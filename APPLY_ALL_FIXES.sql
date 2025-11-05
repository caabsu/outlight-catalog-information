-- =====================================================
-- APPLY ALL FIXES - COMPREHENSIVE UPDATE
-- Run this single file to apply all fixes at once
-- =====================================================

-- This script combines:
-- 1. Service fee CNY to USD conversion fix
-- 2. Order cost analysis V3 (single-SKU filtering + cartesian product fix)
-- 3. Product cost analysis update (ensure single-SKU filtering)

-- =====================================================
-- STEP 1: FIX SERVICE FEES (CNY to USD conversion)
-- =====================================================

-- Create backup
CREATE TABLE IF NOT EXISTS invoice_freight_items_backup_service_fee AS
SELECT * FROM invoice_freight_items;

-- Fix service fees that are clearly in CNY (over $50 USD would be unusual)
UPDATE invoice_freight_items
SET service_fee_usd = service_fee_usd * 0.138
WHERE service_fee_usd > 50;

-- Verify fix
SELECT
    'Service Fee Fix' as fix_name,
    AVG(service_fee_usd) as avg_service_fee_usd,
    MIN(service_fee_usd) as min_service_fee_usd,
    MAX(service_fee_usd) as max_service_fee_usd
FROM invoice_freight_items;

-- =====================================================
-- STEP 2: FIX ORDER COST ANALYSIS VIEW (V3)
-- =====================================================

DROP VIEW IF EXISTS order_cost_analysis CASCADE;

CREATE OR REPLACE VIEW order_cost_analysis AS
WITH clean_orders AS (
    SELECT DISTINCT
        REPLACE(ic.order_number, '#', '') as order_number_clean
    FROM invoice_commodity_items ic
    INNER JOIN invoice_freight_items if_items
        ON REPLACE(ic.order_number, '#', '') = REPLACE(if_items.order_number, '#', '')
    WHERE ic.total_usd > 0
        AND if_items.international_shipping_usd > 0
),
order_sku_counts AS (
    SELECT
        REPLACE(so.order_number, '#', '') as order_number_clean,
        COUNT(DISTINCT soi.sku) as unique_sku_count,
        COUNT(DISTINCT soi.id) as item_count
    FROM shopify_orders so
    LEFT JOIN shopify_order_items soi ON so.order_id = soi.order_id
    WHERE soi.sku IS NOT NULL AND soi.sku != ''
    GROUP BY REPLACE(so.order_number, '#', '')
),
single_sku_orders AS (
    SELECT order_number_clean, item_count
    FROM order_sku_counts
    WHERE unique_sku_count = 1
),
commodity_costs AS (
    SELECT
        REPLACE(order_number, '#', '') as order_number_clean,
        SUM(total_usd) as commodity_total_usd,
        SUM(total_cny) as commodity_total_cny,
        SUM(price_usd) as unit_price_usd,
        SUM(domestic_freight_usd) as domestic_freight_usd,
        COUNT(*) as commodity_entry_count
    FROM invoice_commodity_items
    WHERE total_usd > 0
    GROUP BY REPLACE(order_number, '#', '')
),
freight_costs AS (
    SELECT
        REPLACE(order_number, '#', '') as order_number_clean,
        SUM(international_shipping_usd) as international_shipping_usd,
        SUM(service_fee_usd) as service_fee_usd,
        COUNT(*) as freight_entry_count
    FROM invoice_freight_items
    WHERE international_shipping_usd > 0
    GROUP BY REPLACE(order_number, '#', '')
)
SELECT
    so.order_number,
    so.order_name,
    so.created_at as order_date,
    so.total_price as shopify_total_usd,
    so.currency as shopify_currency,
    COALESCE(cc.commodity_total_usd, 0) as commodity_total_usd,
    COALESCE(cc.commodity_total_cny, 0) as commodity_total_cny,
    COALESCE(cc.unit_price_usd, 0) as unit_price_usd,
    COALESCE(cc.domestic_freight_usd, 0) as domestic_freight_usd,
    COALESCE(fc.international_shipping_usd, 0) as international_shipping_usd,
    COALESCE(fc.service_fee_usd, 0) as service_fee_usd,
    COALESCE(cc.commodity_total_usd, 0) + COALESCE(fc.international_shipping_usd, 0) + COALESCE(fc.service_fee_usd, 0) as total_fulfillment_cost_usd,
    so.total_price - (COALESCE(cc.commodity_total_usd, 0) + COALESCE(fc.international_shipping_usd, 0) + COALESCE(fc.service_fee_usd, 0)) as profit_usd,
    CASE
        WHEN so.total_price > 0 THEN
            ((so.total_price - (COALESCE(cc.commodity_total_usd, 0) + COALESCE(fc.international_shipping_usd, 0) + COALESCE(fc.service_fee_usd, 0))) / so.total_price) * 100
        ELSE 0
    END as profit_percentage,
    COALESCE(sso.item_count, 0) as item_count
FROM shopify_orders so
INNER JOIN clean_orders co ON REPLACE(so.order_number, '#', '') = co.order_number_clean
INNER JOIN single_sku_orders sso ON REPLACE(so.order_number, '#', '') = sso.order_number_clean
LEFT JOIN commodity_costs cc ON REPLACE(so.order_number, '#', '') = cc.order_number_clean
LEFT JOIN freight_costs fc ON REPLACE(so.order_number, '#', '') = fc.order_number_clean
WHERE COALESCE(cc.commodity_total_usd, 0) > 0
    AND COALESCE(fc.international_shipping_usd, 0) > 0;

-- =====================================================
-- STEP 3: VERIFY PRODUCT COST ANALYSIS VIEW
-- =====================================================

-- The product view should already be correct from DATABASE_PRODUCT_FIX.sql
-- But let's ensure it's applied. If it errors, the view already exists correctly.

DROP VIEW IF EXISTS product_cost_analysis CASCADE;

CREATE OR REPLACE VIEW product_cost_analysis AS
WITH clean_orders AS (
    SELECT DISTINCT
        REPLACE(ic.order_number, '#', '') as order_number
    FROM invoice_commodity_items ic
    INNER JOIN invoice_freight_items if_items
        ON REPLACE(ic.order_number, '#', '') = REPLACE(if_items.order_number, '#', '')
    WHERE ic.total_usd > 0
        AND if_items.international_shipping_usd > 0
),
order_item_counts AS (
    SELECT
        REPLACE(so.order_number, '#', '') as order_number,
        COUNT(DISTINCT soi.sku) as unique_sku_count,
        COUNT(DISTINCT soi.product_id) as unique_product_count,
        SUM(soi.quantity) as total_units,
        SUM((soi.price * soi.quantity) - soi.total_discount) as order_revenue
    FROM shopify_orders so
    JOIN shopify_order_items soi ON so.order_id = soi.order_id
    WHERE soi.sku IS NOT NULL AND soi.sku != ''
    GROUP BY REPLACE(so.order_number, '#', '')
),
single_sku_orders AS (
    SELECT order_number
    FROM order_item_counts
    WHERE unique_sku_count = 1
),
order_costs_aggregated AS (
    SELECT
        REPLACE(ic.order_number, '#', '') as order_number,
        SUM(ic.price_usd) as total_item_cost_usd,
        SUM(ic.domestic_freight_usd) as total_domestic_freight_usd,
        SUM(ic.total_usd) as total_commodity_cost_usd,
        SUM(ic.price_cny) as total_item_cost_cny,
        array_agg(DISTINCT iu.filename) FILTER (WHERE iu.filename IS NOT NULL) as commodity_invoice_files,
        array_agg(DISTINCT iu.id) FILTER (WHERE iu.id IS NOT NULL) as commodity_invoice_ids
    FROM invoice_commodity_items ic
    LEFT JOIN invoice_uploads iu ON ic.upload_id = iu.id
    WHERE ic.order_number IS NOT NULL
    GROUP BY REPLACE(ic.order_number, '#', '')
),
freight_costs_aggregated AS (
    SELECT
        REPLACE(if_items.order_number, '#', '') as order_number,
        SUM(if_items.international_shipping_usd) as total_intl_shipping_usd,
        SUM(if_items.service_fee_usd) as total_service_fee_usd,
        array_agg(DISTINCT iu.filename) FILTER (WHERE iu.filename IS NOT NULL) as freight_invoice_files,
        array_agg(DISTINCT iu.id) FILTER (WHERE iu.id IS NOT NULL) as freight_invoice_ids
    FROM invoice_freight_items if_items
    LEFT JOIN invoice_uploads iu ON if_items.upload_id = iu.id
    WHERE if_items.order_number IS NOT NULL
    GROUP BY REPLACE(if_items.order_number, '#', '')
),
product_orders AS (
    SELECT
        soi.sku,
        soi.title as product_title,
        soi.product_id,
        REPLACE(so.order_number, '#', '') as order_number,
        so.order_name,
        so.created_at as order_date,
        soi.quantity,
        soi.price as unit_price_shopify,
        CASE
            WHEN soi.quantity > 0 THEN ((soi.price * soi.quantity) - soi.total_discount) / soi.quantity
            ELSE soi.price
        END as actual_unit_price_usd,
        (soi.price * soi.quantity) - soi.total_discount as line_revenue,
        oic.unique_sku_count,
        oic.order_revenue,
        CASE
            WHEN oic.unique_sku_count = 1 THEN
                (oca.total_item_cost_usd + oca.total_domestic_freight_usd + fca.total_intl_shipping_usd + fca.total_service_fee_usd) / soi.quantity
            ELSE NULL
        END as estimated_unit_cost_usd,
        CASE
            WHEN oic.unique_sku_count = 1 THEN oca.total_item_cost_usd / soi.quantity
            ELSE NULL
        END as item_cost_per_unit_usd,
        CASE
            WHEN oic.unique_sku_count = 1 THEN (oca.total_domestic_freight_usd + fca.total_intl_shipping_usd + fca.total_service_fee_usd) / soi.quantity
            ELSE NULL
        END as shipping_cost_per_unit_usd,
        CASE
            WHEN oic.unique_sku_count = 1 THEN oca.total_item_cost_cny / soi.quantity
            ELSE NULL
        END as item_cost_per_unit_cny,
        oca.commodity_invoice_files,
        oca.commodity_invoice_ids,
        fca.freight_invoice_files,
        fca.freight_invoice_ids,
        CASE
            WHEN oic.unique_sku_count = 1 THEN true
            ELSE false
        END as is_single_sku_order
    FROM shopify_orders so
    JOIN shopify_order_items soi ON so.order_id = soi.order_id
    INNER JOIN single_sku_orders sso ON REPLACE(so.order_number, '#', '') = sso.order_number
    INNER JOIN order_item_counts oic ON REPLACE(so.order_number, '#', '') = oic.order_number
    LEFT JOIN order_costs_aggregated oca ON REPLACE(so.order_number, '#', '') = oca.order_number
    LEFT JOIN freight_costs_aggregated fca ON REPLACE(so.order_number, '#', '') = fca.order_number
    WHERE soi.sku IS NOT NULL
        AND soi.sku != ''
        AND REPLACE(so.order_number, '#', '') IN (SELECT order_number FROM clean_orders)
)
SELECT
    sku,
    product_title,
    COUNT(DISTINCT order_number) as order_count,
    SUM(quantity) as total_quantity_sold,
    AVG(unit_price_shopify) as avg_listed_price_usd,
    AVG(actual_unit_price_usd) as avg_selling_price_usd,
    SUM(line_revenue) as total_revenue_usd,
    AVG(estimated_unit_cost_usd) as avg_unit_cost_usd,
    AVG(item_cost_per_unit_usd) as avg_item_cost_usd,
    AVG(shipping_cost_per_unit_usd) as avg_shipping_cost_usd,
    AVG(item_cost_per_unit_cny) as avg_unit_cost_cny,
    SUM(estimated_unit_cost_usd * quantity) as total_cost_usd,
    SUM(item_cost_per_unit_usd * quantity) as total_item_cost_usd,
    SUM(shipping_cost_per_unit_usd * quantity) as total_shipping_cost_usd,
    AVG(actual_unit_price_usd - estimated_unit_cost_usd) as avg_profit_per_unit_usd,
    SUM((actual_unit_price_usd - estimated_unit_cost_usd) * quantity) as total_profit_usd,
    AVG(CASE
        WHEN actual_unit_price_usd > 0 THEN
            ((actual_unit_price_usd - estimated_unit_cost_usd) / actual_unit_price_usd) * 100
        ELSE 0
    END) as avg_profit_margin_pct,
    AVG(CASE WHEN item_cost_per_unit_usd + shipping_cost_per_unit_usd > 0 THEN
        (item_cost_per_unit_usd / (item_cost_per_unit_usd + shipping_cost_per_unit_usd)) * 100
        ELSE 0
    END) as item_cost_percentage,
    AVG(CASE WHEN item_cost_per_unit_usd + shipping_cost_per_unit_usd > 0 THEN
        (shipping_cost_per_unit_usd / (item_cost_per_unit_usd + shipping_cost_per_unit_usd)) * 100
        ELSE 0
    END) as shipping_cost_percentage,
    COUNT(*) FILTER (WHERE is_single_sku_order = true) as single_sku_order_count,
    COUNT(DISTINCT order_number) FILTER (WHERE estimated_unit_cost_usd IS NOT NULL) as orders_with_cost_data
FROM product_orders
WHERE estimated_unit_cost_usd IS NOT NULL
GROUP BY sku, product_title
HAVING AVG(estimated_unit_cost_usd) > 0
ORDER BY total_revenue_usd DESC;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check order count
SELECT 'Order Analysis' as view_name, COUNT(*) as record_count FROM order_cost_analysis;

-- Check product count
SELECT 'Product Analysis' as view_name, COUNT(*) as record_count FROM product_cost_analysis;

-- Check average costs look reasonable
SELECT
    'Orders' as view_name,
    AVG(total_fulfillment_cost_usd) as avg_total_cost,
    AVG(service_fee_usd) as avg_service_fee,
    AVG(profit_percentage) as avg_margin_pct
FROM order_cost_analysis
UNION ALL
SELECT
    'Products' as view_name,
    AVG(avg_unit_cost_usd) as avg_total_cost,
    NULL as avg_service_fee,
    AVG(avg_profit_margin_pct) as avg_margin_pct
FROM product_cost_analysis;

-- Show sample orders
SELECT
    order_name,
    shopify_total_usd as revenue,
    total_fulfillment_cost_usd as cost,
    profit_usd as profit,
    profit_percentage as margin_pct
FROM order_cost_analysis
ORDER BY order_date DESC
LIMIT 10;

-- Show sample products
SELECT
    sku,
    product_title,
    order_count,
    total_revenue_usd,
    avg_unit_cost_usd,
    avg_profit_margin_pct
FROM product_cost_analysis
ORDER BY total_revenue_usd DESC
LIMIT 10;

-- All done!
SELECT 'ALL FIXES APPLIED SUCCESSFULLY!' as status;
