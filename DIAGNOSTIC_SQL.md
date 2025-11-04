# Diagnostic SQL - Check Why No Data Shows

Run these queries in your Supabase SQL editor to diagnose why you're seeing 0 items:

## 1. Check if invoices exist
```sql
-- Should show your uploaded invoices
SELECT
    id,
    filename,
    upload_date,
    row_count_commodity,
    row_count_freight
FROM invoice_uploads
ORDER BY upload_date DESC
LIMIT 10;
```

## 2. Check if invoice commodity items have SKUs
```sql
-- Should show commodity items with SKUs and order numbers
SELECT
    COUNT(*) as total_items,
    COUNT(DISTINCT sku) as unique_skus,
    COUNT(DISTINCT order_number) as unique_orders,
    COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as items_with_sku
FROM invoice_commodity_items;
```

## 3. Check if Shopify orders exist
```sql
-- Should show your synced Shopify orders
SELECT
    COUNT(*) as total_orders,
    COUNT(DISTINCT order_number) as unique_order_numbers
FROM shopify_orders;
```

## 4. Check if Shopify order items have SKUs
```sql
-- Should show order items with SKUs
SELECT
    COUNT(*) as total_line_items,
    COUNT(DISTINCT sku) as unique_skus,
    COUNT(CASE WHEN sku IS NOT NULL AND sku != '' THEN 1 END) as items_with_sku
FROM shopify_order_items;
```

## 5. Check order complexity (CRITICAL)
```sql
-- This shows how many single-SKU vs multi-SKU orders you have
SELECT
    CASE
        WHEN unique_sku_count = 1 THEN 'Single SKU'
        ELSE 'Multiple SKUs'
    END as order_type,
    COUNT(*) as order_count,
    SUM(total_units) as total_units
FROM (
    SELECT
        soi.order_id,
        COUNT(DISTINCT soi.sku) as unique_sku_count,
        SUM(soi.quantity) as total_units
    FROM shopify_order_items soi
    WHERE soi.sku IS NOT NULL AND soi.sku != ''
    GROUP BY soi.order_id
) sub
GROUP BY order_type;
```

## 6. Check if invoice order_numbers match single-SKU Shopify orders
```sql
-- This is the KEY diagnostic - shows if invoice data matches single-SKU orders
SELECT
    COUNT(DISTINCT ic.order_number) as invoice_order_count,
    COUNT(DISTINCT CASE WHEN osc.unique_sku_count = 1 THEN ic.order_number END) as single_sku_order_count,
    COUNT(DISTINCT CASE WHEN osc.unique_sku_count > 1 THEN ic.order_number END) as multi_sku_order_count,
    COUNT(DISTINCT CASE WHEN osc.order_number IS NULL THEN ic.order_number END) as no_match_count
FROM invoice_commodity_items ic
LEFT JOIN (
    SELECT
        so.order_number,
        COUNT(DISTINCT soi.sku) as unique_sku_count
    FROM shopify_order_items soi
    JOIN shopify_orders so ON soi.order_id = so.order_id
    WHERE soi.sku IS NOT NULL AND soi.sku != ''
    GROUP BY so.order_number
) osc ON ic.order_number = osc.order_number;
```

## 7. Check if views were created successfully
```sql
-- Should return row counts for each view
SELECT 'item_cost_analysis' as view_name, COUNT(*) as row_count FROM item_cost_analysis
UNION ALL
SELECT 'sku_profitability_summary', COUNT(*) FROM sku_profitability_summary
UNION ALL
SELECT 'product_profitability_summary', COUNT(*) FROM product_profitability_summary;
```

## 8. Check what's in the clean_sku_costs (if views exist)
```sql
-- This simulates the CTE to see if any clean SKU costs were calculated
WITH order_sku_complexity AS (
    SELECT
        soi.order_id,
        so.order_number,
        COUNT(DISTINCT soi.sku) as unique_sku_count,
        SUM(soi.quantity) as total_units_in_order
    FROM shopify_order_items soi
    JOIN shopify_orders so ON soi.order_id = so.order_id
    WHERE soi.sku IS NOT NULL AND soi.sku != ''
    GROUP BY soi.order_id, so.order_number
),
commodity_costs_with_freight AS (
    SELECT
        ic.sku,
        ic.order_number,
        ic.total_usd,
        osc.unique_sku_count,
        osc.total_units_in_order,
        CASE
            WHEN osc.unique_sku_count = 1 THEN true
            ELSE false
        END as is_single_sku_order
    FROM invoice_commodity_items ic
    LEFT JOIN order_sku_complexity osc ON ic.order_number = osc.order_number
    WHERE ic.sku IS NOT NULL AND ic.sku != ''
)
SELECT
    COUNT(*) as total_invoice_items,
    COUNT(CASE WHEN is_single_sku_order = true THEN 1 END) as single_sku_items,
    COUNT(CASE WHEN is_single_sku_order = false THEN 1 END) as multi_sku_items,
    COUNT(DISTINCT sku) as unique_skus_in_invoices,
    COUNT(DISTINCT CASE WHEN is_single_sku_order = true THEN sku END) as unique_skus_in_single_sku_orders
FROM commodity_costs_with_freight;
```

## 9. Sample data check - Show me actual SKUs that SHOULD appear
```sql
-- This shows SKUs that meet all criteria
WITH order_sku_complexity AS (
    SELECT
        soi.order_id,
        so.order_number,
        COUNT(DISTINCT soi.sku) as unique_sku_count,
        SUM(soi.quantity) as total_units_in_order
    FROM shopify_order_items soi
    JOIN shopify_orders so ON soi.order_id = so.order_id
    WHERE soi.sku IS NOT NULL AND soi.sku != ''
    GROUP BY soi.order_id, so.order_number
)
SELECT
    ic.sku,
    ic.order_number,
    ic.total_usd as cost,
    osc.unique_sku_count,
    osc.total_units_in_order
FROM invoice_commodity_items ic
JOIN order_sku_complexity osc ON ic.order_number = osc.order_number
WHERE osc.unique_sku_count = 1
  AND ic.sku IS NOT NULL
  AND ic.sku != ''
LIMIT 10;
```

---

## Interpretation Guide

### If Query #5 shows "0 Single SKU orders":
**Problem**: All your orders have multiple different SKUs
**Solution**: The new algorithm can't use multi-SKU orders. Options:
1. Use the old algorithm (less accurate)
2. Wait until you have single-SKU orders
3. Modify the algorithm to be less strict

### If Query #6 shows "0 single_sku_order_count":
**Problem**: Your invoice order_numbers don't match any single-SKU Shopify orders
**Solution**:
1. Check if order_numbers in invoices match Shopify order_numbers
2. You might need to re-sync Shopify data
3. Or invoices are for multi-SKU orders only

### If Query #7 shows "0 rows" for all views:
**Problem**: Views weren't created or have no data
**Solution**: Re-run the CREATE VIEW SQL from the main SQL file

### If Query #8 shows "0 single_sku_items":
**Problem**: No invoice items correspond to single-SKU orders
**Solution**: You need either:
1. Single-SKU orders (orders with only one product type)
2. Or revert to the less strict algorithm

---

## Quick Fix: Less Strict Algorithm

If you have NO single-SKU orders, you can use this modified version that's less strict but still better than the old algorithm:

Run this to see if you'd get data with a less strict approach:
```sql
-- Check if you'd get data by including orders with <= 2 SKUs instead of just 1
WITH order_sku_complexity AS (
    SELECT
        soi.order_id,
        so.order_number,
        COUNT(DISTINCT soi.sku) as unique_sku_count
    FROM shopify_order_items soi
    JOIN shopify_orders so ON soi.order_id = so.order_id
    WHERE soi.sku IS NOT NULL AND soi.sku != ''
    GROUP BY soi.order_id, so.order_number
)
SELECT
    COUNT(DISTINCT ic.sku) as skus_if_we_allow_2_sku_orders
FROM invoice_commodity_items ic
JOIN order_sku_complexity osc ON ic.order_number = osc.order_number
WHERE osc.unique_sku_count <= 2  -- Allow 1 or 2 SKUs instead of just 1
  AND ic.sku IS NOT NULL
  AND ic.sku != '';
```

If this returns > 0, let me know and I can provide a modified algorithm that allows orders with up to 2 SKUs.
