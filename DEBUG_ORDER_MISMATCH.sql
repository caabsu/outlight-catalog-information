-- =====================================================
-- DEBUG ORDER COST MISMATCH
-- Check for duplicate invoice entries and order number matching issues
-- =====================================================

-- Test with a specific order (replace with actual order number you're seeing mismatch on)
-- Example: SELECT * FROM debug_order WHERE order_number = '1234';

CREATE OR REPLACE VIEW debug_order_matching AS
SELECT
    'Shopify Orders' as source,
    order_number,
    order_name,
    total_price as amount,
    NULL as detail
FROM shopify_orders
WHERE order_number IN (
    SELECT DISTINCT order_number FROM shopify_orders LIMIT 10
)

UNION ALL

SELECT
    'Commodity Items' as source,
    order_number,
    NULL as order_name,
    total_usd as amount,
    'Item #' || id::text as detail
FROM invoice_commodity_items
WHERE REPLACE(order_number, '#', '') IN (
    SELECT REPLACE(order_number, '#', '') FROM shopify_orders LIMIT 10
)

UNION ALL

SELECT
    'Freight Items' as source,
    order_number,
    NULL as order_name,
    international_shipping_usd + service_fee_usd as amount,
    'Freight #' || id::text as detail
FROM invoice_freight_items
WHERE REPLACE(order_number, '#', '') IN (
    SELECT REPLACE(order_number, '#', '') FROM shopify_orders LIMIT 10
)
ORDER BY order_number, source;

-- Check for duplicate invoice entries per order
CREATE OR REPLACE VIEW debug_duplicate_invoices AS
SELECT
    REPLACE(order_number, '#', '') as order_number_clean,
    order_number,
    COUNT(*) as commodity_count,
    SUM(total_usd) as total_commodity_usd,
    array_agg(id) as commodity_ids,
    array_agg(upload_id) as upload_ids
FROM invoice_commodity_items
GROUP BY order_number
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- Compare old view vs new view for same orders
CREATE OR REPLACE VIEW debug_cost_comparison AS
WITH old_calc AS (
    SELECT
        so.order_number,
        COALESCE(SUM(ic.total_usd), 0) as commodity_old,
        COALESCE(SUM(if_items.international_shipping_usd), 0) as freight_old,
        COALESCE(SUM(ic.total_usd), 0) + COALESCE(SUM(if_items.international_shipping_usd), 0) + COALESCE(SUM(if_items.service_fee_usd), 0) as total_old
    FROM shopify_orders so
    LEFT JOIN invoice_commodity_items ic ON so.order_number = ic.order_number
    LEFT JOIN invoice_freight_items if_items ON so.order_number = if_items.order_number
    GROUP BY so.order_number
),
new_calc AS (
    SELECT
        REPLACE(so.order_number, '#', '') as order_number_clean,
        so.order_number,
        COALESCE(SUM(ic.total_usd), 0) as commodity_new,
        COALESCE(SUM(if_items.international_shipping_usd), 0) as freight_new,
        COALESCE(SUM(ic.total_usd), 0) + COALESCE(SUM(if_items.international_shipping_usd), 0) + COALESCE(SUM(if_items.service_fee_usd), 0) as total_new
    FROM shopify_orders so
    LEFT JOIN invoice_commodity_items ic
        ON REPLACE(so.order_number, '#', '') = REPLACE(ic.order_number, '#', '')
    LEFT JOIN invoice_freight_items if_items
        ON REPLACE(so.order_number, '#', '') = REPLACE(if_items.order_number, '#', '')
    GROUP BY so.order_number
)
SELECT
    o.order_number,
    o.commodity_old,
    n.commodity_new,
    o.freight_old,
    n.freight_new,
    o.total_old,
    n.total_new,
    (o.total_old - n.total_new) as difference
FROM old_calc o
JOIN new_calc n ON o.order_number = n.order_number
WHERE o.total_old != n.total_new
ORDER BY ABS(o.total_old - n.total_new) DESC;

-- Show detailed breakdown for a specific order
COMMENT ON VIEW debug_order_matching IS 'Shows all data sources for orders to identify matching issues';
COMMENT ON VIEW debug_duplicate_invoices IS 'Identifies orders with multiple commodity invoice entries (potential duplicates)';
COMMENT ON VIEW debug_cost_comparison IS 'Compares old LEFT JOIN vs new REPLACE matching to find differences';
