-- =====================================================
-- DIAGNOSE HIGH COSTS ISSUE
-- Find orders with suspiciously high costs and trace the source
-- =====================================================

-- Step 1: Find orders with costs > $10,000 (likely wrong)
CREATE OR REPLACE VIEW suspect_high_cost_orders AS
SELECT
    so.order_number,
    so.order_name,
    so.total_price as shopify_revenue,

    -- Count invoice entries
    COUNT(DISTINCT ic.id) as commodity_entry_count,
    COUNT(DISTINCT if_items.id) as freight_entry_count,

    -- Show individual sums
    COALESCE(SUM(ic.total_usd), 0) as commodity_sum_usd,
    COALESCE(SUM(ic.total_cny), 0) as commodity_sum_cny,
    COALESCE(SUM(if_items.international_shipping_usd), 0) as freight_sum_usd,
    COALESCE(SUM(if_items.international_shipping_cny), 0) as freight_sum_cny,

    -- Show if CNY was accidentally used as USD
    COALESCE(SUM(ic.total_cny), 0) / 7.0 as commodity_cny_converted_to_usd,

    -- Total
    COALESCE(SUM(ic.total_usd), 0) + COALESCE(SUM(if_items.international_shipping_usd), 0) + COALESCE(SUM(if_items.service_fee_usd), 0) as total_cost_calculated,

    -- List all commodity IDs and their values
    array_agg(DISTINCT ic.id) FILTER (WHERE ic.id IS NOT NULL) as commodity_ids,
    array_agg(DISTINCT ic.total_usd) FILTER (WHERE ic.total_usd IS NOT NULL) as commodity_usd_values,
    array_agg(DISTINCT ic.total_cny) FILTER (WHERE ic.total_cny IS NOT NULL) as commodity_cny_values,

    -- List all freight IDs and their values
    array_agg(DISTINCT if_items.id) FILTER (WHERE if_items.id IS NOT NULL) as freight_ids,
    array_agg(DISTINCT if_items.international_shipping_usd) FILTER (WHERE if_items.international_shipping_usd IS NOT NULL) as freight_usd_values

FROM shopify_orders so
LEFT JOIN invoice_commodity_items ic
    ON REPLACE(so.order_number, '#', '') = REPLACE(ic.order_number, '#', '')
LEFT JOIN invoice_freight_items if_items
    ON REPLACE(so.order_number, '#', '') = REPLACE(if_items.order_number, '#', '')
GROUP BY so.order_number, so.order_name, so.total_price
HAVING COALESCE(SUM(ic.total_usd), 0) + COALESCE(SUM(if_items.international_shipping_usd), 0) > 10000
ORDER BY total_cost_calculated DESC;

-- Step 2: Check for duplicate invoice entries
CREATE OR REPLACE VIEW duplicate_invoice_entries AS
SELECT
    'Commodity' as invoice_type,
    order_number,
    COUNT(*) as entry_count,
    SUM(total_usd) as sum_total_usd,
    SUM(total_cny) as sum_total_cny,
    array_agg(id) as entry_ids,
    array_agg(total_usd) as usd_values,
    array_agg(total_cny) as cny_values,
    array_agg(upload_id) as upload_ids
FROM invoice_commodity_items
GROUP BY order_number
HAVING COUNT(*) > 1

UNION ALL

SELECT
    'Freight' as invoice_type,
    order_number,
    COUNT(*) as entry_count,
    SUM(international_shipping_usd) as sum_total_usd,
    SUM(international_shipping_cny) as sum_total_cny,
    array_agg(id) as entry_ids,
    array_agg(international_shipping_usd) as usd_values,
    array_agg(international_shipping_cny) as cny_values,
    array_agg(upload_id) as upload_ids
FROM invoice_freight_items
GROUP BY order_number
HAVING COUNT(*) > 1

ORDER BY sum_total_usd DESC;

-- Step 3: Check for CNY/USD confusion
CREATE OR REPLACE VIEW cny_usd_confusion_check AS
SELECT
    order_number,
    id,
    total_cny,
    total_usd,
    -- If total_usd ≈ total_cny, might be CNY stored in USD column
    CASE
        WHEN total_usd > 0 AND total_cny > 0 AND ABS(total_usd - total_cny) < 1
        THEN 'LIKELY CNY IN USD COLUMN'
        WHEN total_usd > total_cny * 10
        THEN 'SUSPICIOUSLY HIGH USD'
        ELSE 'OK'
    END as status,
    total_cny / 7.0 as cny_properly_converted,
    upload_id
FROM invoice_commodity_items
WHERE total_usd > 0
ORDER BY total_usd DESC;

-- Step 4: Detailed breakdown for a specific order
-- Usage: SELECT * FROM order_cost_detail WHERE order_number = '1234';
CREATE OR REPLACE VIEW order_cost_detail AS
SELECT
    REPLACE(so.order_number, '#', '') as order_number_clean,
    so.order_number as shopify_order_number,
    so.total_price as shopify_revenue,

    -- Commodity items detail
    ic.id as commodity_id,
    ic.order_number as commodity_order_number,
    ic.price_cny as commodity_price_cny,
    ic.price_usd as commodity_price_usd,
    ic.domestic_freight_cny,
    ic.domestic_freight_usd,
    ic.total_cny as commodity_total_cny,
    ic.total_usd as commodity_total_usd,
    ic.upload_id as commodity_upload_id,

    -- Freight items detail
    if_items.id as freight_id,
    if_items.order_number as freight_order_number,
    if_items.international_shipping_cny,
    if_items.international_shipping_usd,
    if_items.service_fee_usd,
    if_items.upload_id as freight_upload_id

FROM shopify_orders so
LEFT JOIN invoice_commodity_items ic
    ON REPLACE(so.order_number, '#', '') = REPLACE(ic.order_number, '#', '')
LEFT JOIN invoice_freight_items if_items
    ON REPLACE(so.order_number, '#', '') = REPLACE(if_items.order_number, '#', '')
ORDER BY so.order_number, ic.id, if_items.id;

COMMENT ON VIEW suspect_high_cost_orders IS 'Find orders with costs > $10k and show entry counts and values';
COMMENT ON VIEW duplicate_invoice_entries IS 'Find orders with multiple commodity or freight entries';
COMMENT ON VIEW cny_usd_confusion_check IS 'Check if CNY values were accidentally stored in USD columns';
COMMENT ON VIEW order_cost_detail IS 'Detailed row-by-row breakdown for any order';
