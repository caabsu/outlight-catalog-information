# Verification SQL - Complete Data Only

Run these queries AFTER running the final SQL to verify only orders with BOTH commodity AND freight are used.

## 1. Verify orders with complete data
```sql
-- This should show which orders have complete data
WITH order_costs AS (
    SELECT DISTINCT REPLACE(order_number, '#', '') as order_number
    FROM invoice_commodity_items
    WHERE order_number IS NOT NULL AND order_number != ''
),
order_freight AS (
    SELECT DISTINCT REPLACE(order_number, '#', '') as order_number
    FROM invoice_freight_items
    WHERE order_number IS NOT NULL AND order_number != ''
)
SELECT
    (SELECT COUNT(*) FROM order_costs) as total_commodity_orders,
    (SELECT COUNT(*) FROM order_freight) as total_freight_orders,
    (SELECT COUNT(*)
     FROM order_costs oc
     INNER JOIN order_freight of ON oc.order_number = of.order_number
    ) as orders_with_both_complete,
    (SELECT COUNT(*) FROM order_costs WHERE order_number NOT IN (SELECT order_number FROM order_freight)) as commodity_only,
    (SELECT COUNT(*) FROM order_freight WHERE order_number NOT IN (SELECT order_number FROM order_costs)) as freight_only;
```

**Expected Results:**
- `orders_with_both_complete`: Should be 400-800 (these are the ONLY ones used)
- `commodity_only`: Some orders (excluded from profit calc)
- `freight_only`: Some orders (excluded from profit calc)

## 2. Verify profit calculations only use complete data
```sql
-- All items with profit should have has_complete_data = true
SELECT
    COUNT(*) as total_items_in_view,
    COUNT(CASE WHEN has_complete_data = true THEN 1 END) as items_with_complete_data,
    COUNT(CASE WHEN has_complete_data = false OR has_complete_data IS NULL THEN 1 END) as items_with_incomplete_data,
    COUNT(CASE WHEN profit_per_unit_usd IS NOT NULL THEN 1 END) as items_with_profit_calculated,
    COUNT(CASE WHEN profit_per_unit_usd IS NULL THEN 1 END) as items_without_profit
FROM item_cost_analysis;
```

**Expected Results:**
- `items_with_profit_calculated` should EQUAL `items_with_complete_data`
- `items_without_profit` should include all incomplete data

## 3. Check that incomplete orders have NULL profit
```sql
-- Should return 0 rows (no profit for incomplete data)
SELECT
    order_number,
    sku,
    has_complete_data,
    cost_data_source,
    estimated_unit_cost_usd,
    profit_per_unit_usd
FROM item_cost_analysis
WHERE (has_complete_data = false OR has_complete_data IS NULL)
  AND profit_per_unit_usd IS NOT NULL
LIMIT 10;
```

**Expected Results:**
- Should return **0 rows** (no profit calculated for incomplete data)

## 4. Verify complete data has all cost components
```sql
-- Orders with complete data should have all cost components
SELECT
    COUNT(*) as orders_with_complete_data,
    COUNT(CASE WHEN order_commodity_total_usd > 0 THEN 1 END) as has_commodity,
    COUNT(CASE WHEN order_intl_shipping_usd >= 0 THEN 1 END) as has_intl_shipping,
    COUNT(CASE WHEN order_service_fee_usd > 0 THEN 1 END) as has_service_fee,
    AVG(order_commodity_total_usd) as avg_commodity,
    AVG(order_intl_shipping_usd) as avg_intl_shipping,
    AVG(order_service_fee_usd) as avg_service_fee,
    AVG(estimated_unit_cost_usd) as avg_total_unit_cost
FROM item_cost_analysis
WHERE has_complete_data = true
  AND cost_data_source != 'Incomplete Invoice Data';
```

**Expected Results:**
- `has_commodity`: Should equal `orders_with_complete_data` (100%)
- `has_intl_shipping`: Should equal `orders_with_complete_data` (100%)
- `avg_intl_shipping`: Should be $20-$40 (significant amount)

## 5. Sample items with complete vs incomplete data
```sql
-- Show examples of both
SELECT
    order_number,
    sku,
    product_title,
    has_complete_data,
    cost_data_source,
    order_commodity_total_usd,
    order_intl_shipping_usd,
    estimated_unit_cost_usd,
    profit_per_unit_usd,
    profit_margin_percentage
FROM item_cost_analysis
ORDER BY has_complete_data DESC, order_number
LIMIT 20;
```

**Expected Results:**
- Complete data rows: All costs populated, profit calculated
- Incomplete data rows: Some costs NULL, profit is NULL

## 6. Check product summary only has complete data
```sql
-- Product summary should only show products with complete data
SELECT
    product_title,
    times_ordered,
    avg_estimated_cost_usd,
    avg_commodity_price_per_unit,
    avg_intl_shipping_per_unit,
    total_profit_usd,
    overall_profit_margin_pct,
    instances_single_sku,
    instances_multi_sku,
    instances_incomplete_data
FROM product_profitability_summary
LIMIT 10;
```

**Expected Results:**
- `instances_incomplete_data`: Should be 0 for all rows
- All cost components should be populated
- All profit metrics should be populated

## 7. Compare complete vs incomplete order counts
```sql
-- How many orders are excluded due to incomplete data?
WITH all_shopify_orders AS (
    SELECT COUNT(DISTINCT REPLACE(order_number, '#', '')) as total
    FROM shopify_orders
),
orders_in_profitability AS (
    SELECT COUNT(DISTINCT order_number) as with_profit
    FROM item_cost_analysis
    WHERE has_complete_data = true
)
SELECT
    (SELECT total FROM all_shopify_orders) as total_shopify_orders,
    (SELECT with_profit FROM orders_in_profitability) as orders_with_profit_calc,
    (SELECT total FROM all_shopify_orders) - (SELECT with_profit FROM orders_in_profitability) as orders_excluded;
```

**Expected Results:**
- `orders_excluded`: Orders without complete invoice data (expected)
- This tells you coverage: what % of orders have complete cost data

---

## Success Criteria:

✅ **Only orders with BOTH commodity AND freight should have profit calculated**
✅ **Incomplete orders should have NULL profit**
✅ **All complete orders should have all 4 cost components (commodity, domestic, intl, service)**
✅ **International shipping should be significant ($20-$50 avg)**
✅ **Product summary should only show items with complete data**

If any verification fails, the SQL needs adjustment!
