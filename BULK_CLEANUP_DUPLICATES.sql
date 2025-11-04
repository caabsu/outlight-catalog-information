-- BULK CLEANUP: Remove all duplicate freight data from affected invoices
-- This handles the 40+ invoices where commodity sheets were parsed as freight

-- AFFECTED INVOICES (freight_orders = commodity_orders):
-- These invoices have the duplicate bug where the commodity sheet was parsed as freight

-- Step 1: Identify ALL affected invoices
-- An invoice is affected if freight_orders = commodity_orders (perfect match)

WITH affected_invoices AS (
    SELECT
        iu.id,
        iu.filename,
        COUNT(DISTINCT if_items.order_number) as freight_orders,
        COUNT(DISTINCT ic.order_number) as commodity_orders
    FROM invoice_uploads iu
    LEFT JOIN invoice_freight_items if_items ON if_items.upload_id = iu.id
    LEFT JOIN invoice_commodity_items ic ON ic.upload_id = iu.id
    GROUP BY iu.id, iu.filename
    HAVING COUNT(DISTINCT if_items.order_number) = COUNT(DISTINCT ic.order_number)
       AND COUNT(DISTINCT if_items.order_number) > 0
)
SELECT
    id,
    filename,
    freight_orders,
    commodity_orders,
    '⚠️ DUPLICATE - Will be deleted' as status
FROM affected_invoices
ORDER BY filename;

-- Step 2: COUNT how many will be affected
SELECT
    COUNT(*) as total_affected_invoices,
    SUM(freight_orders) as total_duplicate_freight_rows,
    SUM(commodity_orders) as total_commodity_rows
FROM (
    SELECT
        iu.id,
        COUNT(DISTINCT if_items.order_number) as freight_orders,
        COUNT(DISTINCT ic.order_number) as commodity_orders
    FROM invoice_uploads iu
    LEFT JOIN invoice_freight_items if_items ON if_items.upload_id = iu.id
    LEFT JOIN invoice_commodity_items ic ON ic.upload_id = iu.id
    GROUP BY iu.id
    HAVING COUNT(DISTINCT if_items.order_number) = COUNT(DISTINCT ic.order_number)
       AND COUNT(DISTINCT if_items.order_number) > 0
) counts;

-- Step 3: BACKUP - Save list of affected filenames
-- Copy this output before deleting, so you know which files to re-upload
SELECT
    filename,
    '👉 Re-upload this file after deletion' as action
FROM invoice_uploads iu
WHERE iu.id IN (
    SELECT iu2.id
    FROM invoice_uploads iu2
    LEFT JOIN invoice_freight_items if_items ON if_items.upload_id = iu2.id
    LEFT JOIN invoice_commodity_items ic ON ic.upload_id = iu2.id
    GROUP BY iu2.id
    HAVING COUNT(DISTINCT if_items.order_number) = COUNT(DISTINCT ic.order_number)
       AND COUNT(DISTINCT if_items.order_number) > 0
)
ORDER BY filename;

-- Step 4: DELETE ALL AFFECTED INVOICES
-- ⚠️ WARNING: This will delete 40+ invoices and all their data
-- The CASCADE will automatically delete all commodity and freight items

-- UNCOMMENT TO RUN (after reviewing Step 1-3):
/*
DELETE FROM invoice_uploads
WHERE id IN (
    SELECT iu.id
    FROM invoice_uploads iu
    LEFT JOIN invoice_freight_items if_items ON if_items.upload_id = iu.id
    LEFT JOIN invoice_commodity_items ic ON ic.upload_id = iu.id
    GROUP BY iu.id
    HAVING COUNT(DISTINCT if_items.order_number) = COUNT(DISTINCT ic.order_number)
       AND COUNT(DISTINCT if_items.order_number) > 0
);
*/

-- Expected result after running: DELETE 40 (or however many affected)

-- Step 5: VERIFY cleanup
-- After deletion, check that problem invoices are gone
SELECT
    COUNT(*) as remaining_invoices,
    COUNT(CASE WHEN status = '⚠️ LIKELY DUPLICATE' THEN 1 END) as still_duplicates
FROM (
    SELECT
        iu.id,
        iu.filename,
        COUNT(DISTINCT if_items.order_number) as freight_orders,
        COUNT(DISTINCT ic.order_number) as commodity_orders,
        CASE
            WHEN COUNT(DISTINCT if_items.order_number) = COUNT(DISTINCT ic.order_number)
                 AND COUNT(DISTINCT if_items.order_number) > 0
            THEN '⚠️ LIKELY DUPLICATE'
            ELSE '✓ OK'
        END as status
    FROM invoice_uploads iu
    LEFT JOIN invoice_freight_items if_items ON if_items.upload_id = iu.id
    LEFT JOIN invoice_commodity_items ic ON ic.upload_id = iu.id
    GROUP BY iu.id, iu.filename
) counts;
-- Expected: still_duplicates should be 0

-- Step 6: Verify freight data quality
SELECT
    COUNT(*) as total_freight_rows,
    COUNT(CASE WHEN international_shipping_usd = 0 THEN 1 END) as zero_shipping,
    COUNT(CASE WHEN international_shipping_usd < 0 THEN 1 END) as negative_shipping,
    COUNT(CASE WHEN international_shipping_usd < 10 THEN 1 END) as suspicious_low,
    MIN(international_shipping_usd) as min_shipping,
    AVG(international_shipping_usd) as avg_shipping,
    MAX(international_shipping_usd) as max_shipping
FROM invoice_freight_items;
-- After cleanup, zero_shipping and negative_shipping should be much lower
-- suspicious_low should also decrease significantly

-- Step 7: Check specific order #4490
SELECT *
FROM invoice_freight_items
WHERE REPLACE(order_number, '#', '') = '4490';
-- Expected: 0 rows (if that freight data was fake)

------------------------------------------------------------------------------------
-- ALTERNATIVE APPROACH: Delete ONLY freight data (keep commodity)
-- Use this if you want to keep the commodity data and only remove duplicate freight
------------------------------------------------------------------------------------

-- This deletes freight items from invoices where all orders appear in both tabs
/*
DELETE FROM invoice_freight_items
WHERE upload_id IN (
    SELECT iu.id
    FROM invoice_uploads iu
    LEFT JOIN invoice_freight_items if_items ON if_items.upload_id = iu.id
    LEFT JOIN invoice_commodity_items ic ON ic.upload_id = iu.id
    GROUP BY iu.id
    HAVING COUNT(DISTINCT if_items.order_number) = COUNT(DISTINCT ic.order_number)
       AND COUNT(DISTINCT if_items.order_number) > 0
);

-- Then update invoice_uploads to reflect zero freight items
UPDATE invoice_uploads
SET row_count_freight = 0
WHERE id IN (
    SELECT iu.id
    FROM invoice_uploads iu
    LEFT JOIN invoice_freight_items if_items ON if_items.upload_id = iu.id
    LEFT JOIN invoice_commodity_items ic ON ic.upload_id = iu.id
    GROUP BY iu.id
    HAVING COUNT(DISTINCT if_items.order_number) = COUNT(DISTINCT ic.order_number)
       AND COUNT(DISTINCT if_items.order_number) > 0
);
*/

------------------------------------------------------------------------------------
-- RE-UPLOAD CHECKLIST
------------------------------------------------------------------------------------

-- After cleanup, re-upload these files (copy this list):
/*
2025.10.29（put1rp-iq）.xls
2025.10.28（put1rp-iq）.xls
2025.10.20（put1rp-iq）.xls
2025.10.18（put1rp-iq）.xls
2025.10.13（put1rp-iq）.xls
2025.10.11（put1rp-iq）.xls
2025.09.22（put1rp-iq）.xls
2025.09.21（put1rp-iq）.xls
2025.09.17（put1rp-iq）.xls
2025.09.16（put1rp-iq）.xls
2025.09.11（put1rp-iq）.xls
2025.09.09（put1rp-iq）.xls
2025.09.06（put1rp-iq）.xls
2025.09.05（put1rp-iq）.xls
2025.09.02（put1rp-iq）.xls
2025.09.01（put1rp-iq）.xls
2025.08.27（put1rp-iq）.xls
2025.08.20（put1rp-iq）.xls
2025.08.16（put1rp-iq）.xls
2025.08.12（put1rp-iq）.xls
2025.08.11（put1rp-iq）.xls
2025.08.05-1（put1rp-iq）.xls
2025.08.05（put1rp-iq）.xls
2025.08.05（put1rp-iq）(1).xls
2025.08.04（put1rp-iq）.xls
2025.08.02（put1rp-iq）.xls
2025.07.28（glasses）.xls
2025.07.24（glasses）.xls
2025.07.22（put1rp-iq）.xls
2025.07.21（put1rp-iq）.xls
2025.07.19（put1rp-iq）.xls
2025.07.15（put1rp-iq）.xls
2025.07.14（put1rp-iq）.xls
2025.07.12（put1rp-iq）.xls
2025.07.08（put1rp-iq）.xls
2025.07.07（put1rp-iq）.xls
2025.07.05（put1rp-iq）.xls
2025.07.01（put1rp-iq）.xls
2025.06.30（put1rp-iq）.xls
2025.06.28（put1rp-iq）.xls
2025.06.25（put1rp-iq）.xls
*/

-- Total: 41 files to re-upload
