-- =====================================================
-- FIX SERVICE FEE CNY TO USD CONVERSION
-- Service fees were stored as CNY values in the service_fee_usd column
-- This script converts them to actual USD values
-- =====================================================

-- IMPORTANT: Adjust the CNY_TO_USD_RATE if different
-- Current rate: 0.138 (1 CNY = 0.138 USD)

-- Step 1: Check current service fee values to identify the issue
-- Run this first to see the problem:
SELECT
    id,
    order_number,
    service_fee_usd as current_service_fee_usd,
    service_fee_usd * 0.138 as corrected_service_fee_usd,
    service_fee_usd - (service_fee_usd * 0.138) as difference
FROM invoice_freight_items
WHERE service_fee_usd > 50  -- Service fees over $50 are likely CNY values
ORDER BY service_fee_usd DESC
LIMIT 20;

-- Step 2: Backup the current data (IMPORTANT!)
-- Create a backup table before making changes
CREATE TABLE IF NOT EXISTS invoice_freight_items_backup_service_fee AS
SELECT * FROM invoice_freight_items;

-- Step 3: Fix the service fee conversion
-- This updates ALL service fees assuming they are currently stored as CNY
-- If service_fee_usd > 50, it's likely a CNY value that needs conversion
UPDATE invoice_freight_items
SET service_fee_usd = service_fee_usd * 0.138
WHERE service_fee_usd > 50;  -- Only fix values that are clearly CNY (over $50 USD would be unusually high)

-- Alternative: Fix ALL service fees if you're sure they're all in CNY
-- Uncomment the line below if you want to convert all service fees
-- UPDATE invoice_freight_items SET service_fee_usd = service_fee_usd * 0.138;

-- Step 4: Verify the fix
SELECT
    'Before Fix (from backup)' as status,
    COUNT(*) as record_count,
    AVG(service_fee_usd) as avg_service_fee,
    MIN(service_fee_usd) as min_service_fee,
    MAX(service_fee_usd) as max_service_fee
FROM invoice_freight_items_backup_service_fee
UNION ALL
SELECT
    'After Fix' as status,
    COUNT(*) as record_count,
    AVG(service_fee_usd) as avg_service_fee,
    MIN(service_fee_usd) as min_service_fee,
    MAX(service_fee_usd) as max_service_fee
FROM invoice_freight_items;

-- Step 5: Check a few specific orders to confirm
SELECT
    order_number,
    international_shipping_cny,
    international_shipping_usd,
    service_fee_usd,
    (international_shipping_usd + service_fee_usd) as total_freight_cost
FROM invoice_freight_items
ORDER BY order_number
LIMIT 10;

COMMENT ON TABLE invoice_freight_items_backup_service_fee IS 'Backup of invoice_freight_items before service fee CNY to USD conversion fix';

-- To rollback if something goes wrong:
-- DELETE FROM invoice_freight_items;
-- INSERT INTO invoice_freight_items SELECT * FROM invoice_freight_items_backup_service_fee;
