-- Diagnostic queries to investigate Order #4490 issue
-- Run these in your Supabase SQL Editor to see what's really happening

-- 1. Check ALL commodity data for order 4490
SELECT
    ic.id,
    ic.order_number,
    ic.sku,
    ic.price_usd,
    ic.domestic_freight_usd,
    ic.total_usd,
    iu.id as upload_id,
    iu.filename,
    iu.upload_date
FROM invoice_commodity_items ic
LEFT JOIN invoice_uploads iu ON ic.upload_id = iu.id
WHERE REPLACE(ic.order_number, '#', '') = '4490'
ORDER BY iu.upload_date DESC;

-- 2. Check ALL freight data for order 4490
SELECT
    if_items.id,
    if_items.order_number,
    if_items.international_shipping_usd,
    if_items.service_fee_usd,
    if_items.weight,
    iu.id as upload_id,
    iu.filename,
    iu.upload_date
FROM invoice_freight_items if_items
LEFT JOIN invoice_uploads iu ON if_items.upload_id = iu.id
WHERE REPLACE(if_items.order_number, '#', '') = '4490'
ORDER BY iu.upload_date DESC;

-- 3. Check for freight rows with empty/null order numbers from the problematic invoice
SELECT
    if_items.id,
    if_items.order_number,
    if_items.international_shipping_usd,
    if_items.service_fee_usd,
    if_items.weight,
    LENGTH(if_items.order_number) as order_number_length,
    iu.filename
FROM invoice_freight_items if_items
LEFT JOIN invoice_uploads iu ON if_items.upload_id = iu.id
WHERE iu.filename LIKE '%2025.10.25%put1rp-iq%'
ORDER BY if_items.id;

-- 4. Check what the view shows for order 4490
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
    has_complete_data,
    commodity_invoice_files,
    freight_invoice_files,
    cost_data_source
FROM item_cost_analysis
WHERE REPLACE(order_number, '#', '') = '4490';

-- 5. Check orders_with_complete_data for 4490
SELECT order_number
FROM (
    SELECT DISTINCT oc.order_number
    FROM (
        SELECT
            REPLACE(ic.order_number, '#', '') as order_number,
            SUM(COALESCE(ic.total_usd, 0)) as total_commodity_cost_usd
        FROM invoice_commodity_items ic
        WHERE ic.order_number IS NOT NULL AND ic.order_number != ''
        GROUP BY REPLACE(ic.order_number, '#', '')
    ) oc
    INNER JOIN (
        SELECT
            REPLACE(if_items.order_number, '#', '') as order_number,
            SUM(COALESCE(if_items.international_shipping_usd, 0)) as total_intl_shipping_usd
        FROM invoice_freight_items if_items
        WHERE if_items.order_number IS NOT NULL AND if_items.order_number != ''
        GROUP BY REPLACE(if_items.order_number, '#', '')
    ) of ON oc.order_number = of.order_number
    WHERE oc.total_commodity_cost_usd > 0
      AND of.total_intl_shipping_usd > 0
) complete_data
WHERE order_number = '4490';

-- 6. List ALL freight rows with their order numbers to spot any issues
SELECT
    if_items.id,
    if_items.order_number as raw_order_number,
    REPLACE(if_items.order_number, '#', '') as normalized_order_number,
    LENGTH(if_items.order_number) as order_number_length,
    if_items.international_shipping_usd,
    if_items.service_fee_usd,
    iu.filename
FROM invoice_freight_items if_items
LEFT JOIN invoice_uploads iu ON if_items.upload_id = iu.id
WHERE iu.filename LIKE '%2025.10.25%'
ORDER BY if_items.id;
