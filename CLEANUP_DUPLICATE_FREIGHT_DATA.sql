-- CRITICAL CLEANUP: Remove duplicate freight data from commodity sheets being parsed as freight
-- This happened because isFreightSheet() was matching commodity sheets with "Domestic Freight" column

-- PROBLEM:
-- The parser was detecting commodity sheets as freight sheets and parsing them twice:
-- 1. Correctly as commodity (with SKU, Price, Total)
-- 2. INCORRECTLY as freight (reading "Domestic Freight" as "International Shipping")
--
-- This created freight rows with:
-- - Low international shipping costs ($1-5, actually domestic freight values)
-- - Order numbers that don't exist in the actual freight tab
-- - Sometimes even NEGATIVE values (refunds/adjustments in domestic freight)

-- STEP 1: Identify the problem (DRY RUN)
-- This shows all invoices where freight items might be duplicates from commodity sheet

SELECT
    iu.id as upload_id,
    iu.filename,
    iu.upload_date,
    iu.row_count_commodity,
    iu.row_count_freight,
    COUNT(DISTINCT if_items.order_number) as unique_freight_orders,
    COUNT(DISTINCT ic.order_number) as unique_commodity_orders,
    -- If freight orders = commodity orders, likely a duplicate
    CASE
        WHEN COUNT(DISTINCT if_items.order_number) = COUNT(DISTINCT ic.order_number) THEN '⚠️  LIKELY DUPLICATE'
        ELSE '✓ Probably OK'
    END as status
FROM invoice_uploads iu
LEFT JOIN invoice_freight_items if_items ON if_items.upload_id = iu.id
LEFT JOIN invoice_commodity_items ic ON ic.upload_id = iu.id
GROUP BY iu.id, iu.filename, iu.upload_date, iu.row_count_commodity, iu.row_count_freight
HAVING COUNT(DISTINCT if_items.order_number) > 0
ORDER BY iu.upload_date DESC;

-- STEP 2: Check for suspicious freight patterns
-- Freight data with very low international shipping (likely domestic freight values)

SELECT
    iu.filename,
    if_items.order_number,
    if_items.international_shipping_usd,
    if_items.service_fee_usd,
    -- Check if this order appears in commodity from same invoice
    EXISTS (
        SELECT 1 FROM invoice_commodity_items ic
        WHERE ic.upload_id = if_items.upload_id
          AND REPLACE(ic.order_number, '#', '') = REPLACE(if_items.order_number, '#', '')
    ) as also_in_commodity
FROM invoice_freight_items if_items
LEFT JOIN invoice_uploads iu ON if_items.upload_id = iu.id
WHERE if_items.international_shipping_usd BETWEEN -10 AND 10  -- Suspiciously low range
ORDER BY iu.upload_date DESC, if_items.order_number;

-- STEP 3: Find orders that appear in BOTH commodity and freight from the SAME invoice
-- These are almost certainly duplicates from the bug

SELECT
    iu.filename,
    iu.upload_date,
    ic.order_number as commodity_order,
    if_items.order_number as freight_order,
    ic.domestic_freight_usd as domestic_in_commodity,
    if_items.international_shipping_usd as intl_in_freight,
    -- Check if intl shipping matches domestic freight (smoking gun!)
    CASE
        WHEN ABS(ic.domestic_freight_usd - if_items.international_shipping_usd) < 0.01 THEN '🔥 MATCH - DEFINITELY DUPLICATE'
        WHEN if_items.international_shipping_usd < 10 THEN '⚠️  Suspicious - very low'
        ELSE '? Investigate'
    END as verdict
FROM invoice_commodity_items ic
INNER JOIN invoice_freight_items if_items
    ON ic.upload_id = if_items.upload_id
    AND REPLACE(ic.order_number, '#', '') = REPLACE(if_items.order_number, '#', '')
LEFT JOIN invoice_uploads iu ON ic.upload_id = iu.id
ORDER BY iu.upload_date DESC, ic.order_number;

-- STEP 4: Identify specific invoices that are affected
-- List of invoice filenames with suspected duplicate data

SELECT DISTINCT iu.filename
FROM invoice_commodity_items ic
INNER JOIN invoice_freight_items if_items
    ON ic.upload_id = if_items.upload_id
    AND REPLACE(ic.order_number, '#', '') = REPLACE(if_items.order_number, '#', '')
LEFT JOIN invoice_uploads iu ON ic.upload_id = iu.id
WHERE if_items.international_shipping_usd < 50  -- Arbitrary threshold
ORDER BY iu.filename;

-- STEP 5: SOLUTION OPTIONS

-- OPTION A: Delete ALL freight data from affected invoices
-- (Safest - you'll need to re-upload these invoices with the fixed parser)
/*
-- First, identify which invoices to clean
WITH affected_invoices AS (
    SELECT DISTINCT iu.id
    FROM invoice_commodity_items ic
    INNER JOIN invoice_freight_items if_items
        ON ic.upload_id = if_items.upload_id
        AND REPLACE(ic.order_number, '#', '') = REPLACE(if_items.order_number, '#', '')
    LEFT JOIN invoice_uploads iu ON ic.upload_id = iu.id
)
DELETE FROM invoice_freight_items
WHERE upload_id IN (SELECT id FROM affected_invoices);

-- Then update the invoice_uploads record
UPDATE invoice_uploads
SET row_count_freight = 0
WHERE id IN (SELECT id FROM affected_invoices);
*/

-- OPTION B: Delete only freight rows with suspiciously low international shipping
-- (Less safe - might miss some duplicates)
/*
DELETE FROM invoice_freight_items
WHERE international_shipping_usd < 10  -- Adjust threshold as needed
  AND international_shipping_usd >= 0;
*/

-- OPTION C: Delete freight rows that have matching commodity rows in same invoice
-- (Most precise - removes only confirmed duplicates)
/*
DELETE FROM invoice_freight_items if_items
WHERE EXISTS (
    SELECT 1 FROM invoice_commodity_items ic
    WHERE ic.upload_id = if_items.upload_id
      AND REPLACE(ic.order_number, '#', '') = REPLACE(if_items.order_number, '#', '')
      AND ABS(ic.domestic_freight_usd - if_items.international_shipping_usd) < 0.50  -- Close match
);
*/

-- RECOMMENDED APPROACH:
-- 1. Run STEP 1-4 queries to identify affected invoices
-- 2. Delete the affected invoice(s) entirely from the system:
--    DELETE FROM invoice_uploads WHERE filename = '2025.10.25（put1rp-iq）.xls';
--    (This will CASCADE delete all commodity and freight items)
-- 3. Re-upload the invoice with the FIXED parser
-- 4. Verify the freight data is now correct

-- STEP 6: Verification after cleanup

-- Check that no orders appear in both commodity and freight from same invoice
SELECT COUNT(*)
FROM invoice_commodity_items ic
INNER JOIN invoice_freight_items if_items
    ON ic.upload_id = if_items.upload_id
    AND REPLACE(ic.order_number, '#', '') = REPLACE(if_items.order_number, '#', '');
-- Expected: 0 rows (unless legitimately the same order has multiple shipments)

-- Check freight data quality
SELECT
    COUNT(*) as total_freight_rows,
    COUNT(CASE WHEN international_shipping_usd = 0 THEN 1 END) as zero_intl_shipping,
    COUNT(CASE WHEN international_shipping_usd < 0 THEN 1 END) as negative_intl_shipping,
    COUNT(CASE WHEN international_shipping_usd > 0 THEN 1 END) as positive_intl_shipping,
    AVG(international_shipping_usd) as avg_intl_shipping
FROM invoice_freight_items;
-- Zero and negative should be 0 after cleanup
