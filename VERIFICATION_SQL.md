# Verification SQL - Test Order Number Normalization

Run these queries AFTER running the main SQL to verify everything is working:

## 1. Check if # stripping worked on all tables
```sql
-- This should show normalized order numbers (no # symbols)
WITH normalized_orders AS (
    SELECT DISTINCT REPLACE(order_number, '#', '') as order_number, 'Commodity' as source
    FROM invoice_commodity_items
    WHERE order_number IS NOT NULL
    UNION
    SELECT DISTINCT REPLACE(order_number, '#', '') as order_number, 'Freight' as source
    FROM invoice_freight_items
    WHERE order_number IS NOT NULL
    UNION
    SELECT DISTINCT REPLACE(order_number, '#', '') as order_number, 'Shopify' as source
    FROM shopify_orders
    WHERE order_number IS NOT NULL
)
SELECT
    source,
    COUNT(*) as unique_orders,
    MIN(order_number) as sample_min,
    MAX(order_number) as sample_max
FROM normalized_orders
GROUP BY source;
```

## 2. Verify freight is matching better now
```sql
-- Before fix: 427 matches. After fix: Should be much higher!
SELECT
    COUNT(DISTINCT ic.order_number) as total_commodity_orders,
    COUNT(DISTINCT if_items.order_number) as total_freight_orders,
    COUNT(DISTINCT CASE
        WHEN ic.order_number IS NOT NULL AND if_items.order_number IS NOT NULL
        THEN ic.order_number
    END) as matched_orders
FROM (
    SELECT DISTINCT REPLACE(order_number, '#', '') as order_number
    FROM invoice_commodity_items
) ic
FULL OUTER JOIN (
    SELECT DISTINCT REPLACE(order_number, '#', '') as order_number
    FROM invoice_freight_items
) if_items ON ic.order_number = if_items.order_number;
```

## 3. Verify international shipping is included in costs
```sql
-- Check a sample order with international shipping
SELECT
    order_number,
    sku,
    product_title,
    quantity,
    estimated_unit_cost_usd,
    allocated_commodity_price_per_unit,
    allocated_domestic_freight_per_unit,
    allocated_intl_shipping_per_unit,
    allocated_service_fee_per_unit,
    order_intl_shipping_usd,
    -- Verify the math: total should equal sum of parts
    (allocated_commodity_price_per_unit +
     allocated_domestic_freight_per_unit +
     allocated_intl_shipping_per_unit +
     allocated_service_fee_per_unit) as calculated_total,
    estimated_unit_cost_usd as actual_total
FROM item_cost_analysis
WHERE order_intl_shipping_usd > 10  -- Orders with significant intl shipping
  AND cost_data_source != 'No Invoice Data'
LIMIT 5;
```

## 4. Summary stats - Before vs After
```sql
-- Total international shipping included
SELECT
    COUNT(DISTINCT order_number) as orders_with_data,
    COUNT(CASE WHEN order_intl_shipping_usd > 0 THEN 1 END) as orders_with_intl_shipping,
    SUM(order_intl_shipping_usd) as total_intl_shipping_at_order_level,
    SUM(allocated_intl_shipping_per_unit * quantity) as total_intl_shipping_allocated,
    AVG(allocated_intl_shipping_per_unit) as avg_intl_shipping_per_unit,
    MAX(allocated_intl_shipping_per_unit) as max_intl_shipping_per_unit
FROM item_cost_analysis
WHERE cost_data_source != 'No Invoice Data';
```

## 5. Check product profitability view has breakdown
```sql
-- Verify cost breakdown is visible in product view
SELECT
    product_title,
    avg_estimated_cost_usd,
    avg_commodity_price_per_unit,
    avg_domestic_freight_per_unit,
    avg_intl_shipping_per_unit,
    avg_service_fee_per_unit,
    -- Verify breakdown sums to total
    (COALESCE(avg_commodity_price_per_unit, 0) +
     COALESCE(avg_domestic_freight_per_unit, 0) +
     COALESCE(avg_intl_shipping_per_unit, 0) +
     COALESCE(avg_service_fee_per_unit, 0)) as calculated_total,
    avg_estimated_cost_usd as actual_total
FROM product_profitability_summary
WHERE avg_intl_shipping_per_unit > 0
LIMIT 10;
```

---

## Expected Results:

### Query 2 (Matching):
- **Before**: ~427 matched orders
- **After**: Should be 700-800+ matched orders

### Query 4 (International Shipping):
- **total_intl_shipping_allocated**: Should be $40,000-$60,000
- **avg_intl_shipping_per_unit**: Should be $15-$30
- **orders_with_intl_shipping**: Should be 700+

### Query 5 (Cost Breakdown):
- **calculated_total** should approximately equal **actual_total**
- All cost components should show realistic values
- International shipping should be visible and significant

---

## What Fixed:

1. ✅ **Stripped # from commodity** - `REPLACE(ic.order_number, '#', '')`
2. ✅ **Stripped # from freight** - Already done
3. ✅ **Stripped # from Shopify** - `REPLACE(so.order_number, '#', '')`
4. ✅ **Using TOTAL column** - `ic.total_usd` from commodity
5. ✅ **Using International Shipping** - `international_shipping_usd` from freight
6. ✅ **FULL OUTER JOIN** - Handles cases where orders don't match
7. ✅ **Cost breakdown visible** - All components shown in UI

Run these verification queries to confirm everything is working!
