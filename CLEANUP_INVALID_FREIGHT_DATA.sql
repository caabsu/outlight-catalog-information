-- Cleanup script to remove invalid freight data
-- Run this to clean up any freight rows that shouldn't be there

-- 1. First, check what will be deleted (DRY RUN)
SELECT
    if_items.id,
    if_items.order_number,
    if_items.international_shipping_usd,
    if_items.service_fee_usd,
    iu.filename,
    CASE
        WHEN if_items.order_number IS NULL THEN 'NULL order_number'
        WHEN if_items.order_number = '' THEN 'Empty order_number'
        WHEN TRIM(if_items.order_number) = '' THEN 'Whitespace-only order_number'
        WHEN LENGTH(REPLACE(if_items.order_number, '#', '')) = 0 THEN 'Only # symbol'
        ELSE 'Unknown issue'
    END as issue
FROM invoice_freight_items if_items
LEFT JOIN invoice_uploads iu ON if_items.upload_id = iu.id
WHERE if_items.order_number IS NULL
   OR if_items.order_number = ''
   OR TRIM(if_items.order_number) = ''
   OR LENGTH(REPLACE(if_items.order_number, '#', '')) = 0;

-- 2. If the above query shows rows that should be deleted, uncomment and run this:
/*
DELETE FROM invoice_freight_items
WHERE order_number IS NULL
   OR order_number = ''
   OR TRIM(order_number) = ''
   OR LENGTH(REPLACE(order_number, '#', '')) = 0;
*/

-- 3. Check for freight rows where international_shipping_usd = 0 AND service_fee_usd = 0
-- These are useless and should be removed
SELECT
    if_items.id,
    if_items.order_number,
    if_items.international_shipping_usd,
    if_items.service_fee_usd,
    iu.filename
FROM invoice_freight_items if_items
LEFT JOIN invoice_uploads iu ON if_items.upload_id = iu.id
WHERE if_items.international_shipping_usd = 0
  AND if_items.service_fee_usd = 0;

-- 4. If you want to delete zero-cost freight rows, uncomment:
/*
DELETE FROM invoice_freight_items
WHERE international_shipping_usd = 0
  AND service_fee_usd = 0;
*/

-- 5. Find "orphan" orders - orders that have commodity data but were matched with freight data they shouldn't have
-- This query shows orders where the commodity and freight data come from different invoices
WITH order_sources AS (
    SELECT
        REPLACE(ic.order_number, '#', '') as order_number,
        array_agg(DISTINCT ic.upload_id) as commodity_upload_ids,
        array_agg(DISTINCT if_items.upload_id) as freight_upload_ids
    FROM invoice_commodity_items ic
    LEFT JOIN invoice_freight_items if_items
        ON REPLACE(ic.order_number, '#', '') = REPLACE(if_items.order_number, '#', '')
    WHERE ic.order_number IS NOT NULL AND ic.order_number != ''
    GROUP BY REPLACE(ic.order_number, '#', '')
)
SELECT
    os.order_number,
    os.commodity_upload_ids,
    os.freight_upload_ids,
    array_length(os.commodity_upload_ids, 1) as num_commodity_sources,
    array_length(os.freight_upload_ids, 1) as num_freight_sources,
    CASE
        WHEN os.freight_upload_ids IS NULL THEN 'No freight data'
        WHEN os.commodity_upload_ids && os.freight_upload_ids THEN 'Same invoice(s)'
        ELSE 'Different invoices'
    END as source_match
FROM order_sources os
WHERE os.order_number = '4490'
   OR os.order_number LIKE '%4490%';

-- 6. After cleanup, refresh the views
-- Copy and paste this separately after running cleanup
/*
REFRESH MATERIALIZED VIEW IF EXISTS item_cost_analysis;
*/
