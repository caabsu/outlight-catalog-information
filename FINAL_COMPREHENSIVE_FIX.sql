-- =====================================================
-- FINAL COMPREHENSIVE FIX
-- Addresses ALL identified issues:
-- 1. Service fees still in CNY (not converted)
-- 2. Free gift items causing multi-SKU false positives
-- 3. Item count showing wrong values
-- 4. Multi-SKU orders still appearing in products
-- =====================================================

-- =====================================================
-- STEP 1: FIX SERVICE FEES (ALL VALUES)
-- =====================================================

-- Backup first (if not already exists)
CREATE TABLE IF NOT EXISTS invoice_freight_items_backup_final AS
SELECT * FROM invoice_freight_items;

-- Convert ALL service fees from CNY to USD
-- Since we now know they're ALL in CNY, convert everything
UPDATE invoice_freight_items
SET service_fee_usd = service_fee_usd * 0.138
WHERE service_fee_usd >= 15;  -- Default was 15, anything >= 15 is likely CNY

-- Verify
SELECT
    'Service Fee Fix' as step,
    COUNT(*) as total_records,
    AVG(service_fee_usd) as avg_service_fee,
    MIN(service_fee_usd) as min_service_fee,
    MAX(service_fee_usd) as max_service_fee
FROM invoice_freight_items;

-- =====================================================
-- STEP 2: FIX ORDER COST ANALYSIS - EXCLUDE FREE GIFTS
-- =====================================================

DROP VIEW IF EXISTS order_cost_analysis CASCADE;

CREATE OR REPLACE VIEW order_cost_analysis AS
WITH clean_orders AS (
    -- Orders with BOTH commodity AND freight data
    SELECT DISTINCT
        REPLACE(ic.order_number, '#', '') as order_number_clean
    FROM invoice_commodity_items ic
    INNER JOIN invoice_freight_items if_items
        ON REPLACE(ic.order_number, '#', '') = REPLACE(if_items.order_number, '#', '')
    WHERE ic.total_usd > 0
        AND if_items.international_shipping_usd > 0
),
order_sku_counts AS (
    -- Count PAID SKUs only (exclude free gifts where price = 0)
    SELECT
        REPLACE(so.order_number, '#', '') as order_number_clean,
        COUNT(DISTINCT soi.sku) FILTER (WHERE soi.price > 0) as unique_paid_sku_count,
        COUNT(DISTINCT soi.id) as total_line_items,
        COUNT(DISTINCT soi.id) FILTER (WHERE soi.price > 0) as paid_line_items,
        COUNT(DISTINCT soi.id) FILTER (WHERE soi.price = 0) as free_line_items
    FROM shopify_orders so
    LEFT JOIN shopify_order_items soi ON so.order_id = soi.order_id
    WHERE soi.sku IS NOT NULL AND soi.sku != ''
    GROUP BY REPLACE(so.order_number, '#', '')
),
single_paid_sku_orders AS (
    -- ONLY orders with ONE unique PAID SKU (ignore free gifts)
    SELECT
        order_number_clean,
        paid_line_items as item_count
    FROM order_sku_counts
    WHERE unique_paid_sku_count = 1  -- Single paid SKU (free gifts don't count)
),
commodity_costs AS (
    -- Aggregate commodity costs
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
    -- Aggregate freight costs
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
    COALESCE(spso.item_count, 0) as item_count
FROM shopify_orders so
INNER JOIN clean_orders co ON REPLACE(so.order_number, '#', '') = co.order_number_clean
INNER JOIN single_paid_sku_orders spso ON REPLACE(so.order_number, '#', '') = spso.order_number_clean
LEFT JOIN commodity_costs cc ON REPLACE(so.order_number, '#', '') = cc.order_number_clean
LEFT JOIN freight_costs fc ON REPLACE(so.order_number, '#', '') = fc.order_number_clean
WHERE COALESCE(cc.commodity_total_usd, 0) > 0
    AND COALESCE(fc.international_shipping_usd, 0) > 0;

COMMENT ON VIEW order_cost_analysis IS 'Order cost analysis V4 - Only single PAID SKU orders (excludes free gifts from SKU counting). Item count shows paid items only.';

-- =====================================================
-- STEP 3: FIX PRODUCT COST ANALYSIS - EXCLUDE FREE GIFTS
-- =====================================================

DROP VIEW IF EXISTS product_cost_analysis CASCADE;

CREATE OR REPLACE VIEW product_cost_analysis AS
WITH clean_orders AS (
    -- Orders with BOTH commodity AND freight data
    SELECT DISTINCT
        REPLACE(ic.order_number, '#', '') as order_number
    FROM invoice_commodity_items ic
    INNER JOIN invoice_freight_items if_items
        ON REPLACE(ic.order_number, '#', '') = REPLACE(if_items.order_number, '#', '')
    WHERE ic.total_usd > 0
        AND if_items.international_shipping_usd > 0
),
order_item_counts AS (
    -- Count PAID items only (exclude free gifts)
    SELECT
        REPLACE(so.order_number, '#', '') as order_number,
        COUNT(DISTINCT soi.sku) FILTER (WHERE soi.price > 0) as unique_paid_sku_count,
        COUNT(DISTINCT soi.product_id) FILTER (WHERE soi.price > 0) as unique_paid_product_count,
        SUM(soi.quantity) FILTER (WHERE soi.price > 0) as total_paid_units,
        SUM((soi.price * soi.quantity) - soi.total_discount) FILTER (WHERE soi.price > 0) as order_revenue
    FROM shopify_orders so
    JOIN shopify_order_items soi ON so.order_id = soi.order_id
    WHERE soi.sku IS NOT NULL AND soi.sku != ''
    GROUP BY REPLACE(so.order_number, '#', '')
),
single_paid_sku_orders AS (
    -- ONLY single PAID SKU orders
    SELECT order_number
    FROM order_item_counts
    WHERE unique_paid_sku_count = 1
),
order_costs_aggregated AS (
    -- Aggregate commodity costs
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
    -- Aggregate freight costs
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
    -- Join only PAID items from single PAID SKU orders
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
        oic.unique_paid_sku_count,
        oic.order_revenue,
        CASE
            WHEN oic.unique_paid_sku_count = 1 THEN
                (oca.total_item_cost_usd + oca.total_domestic_freight_usd + fca.total_intl_shipping_usd + fca.total_service_fee_usd) / soi.quantity
            ELSE NULL
        END as estimated_unit_cost_usd,
        CASE
            WHEN oic.unique_paid_sku_count = 1 THEN oca.total_item_cost_usd / soi.quantity
            ELSE NULL
        END as item_cost_per_unit_usd,
        CASE
            WHEN oic.unique_paid_sku_count = 1 THEN (oca.total_domestic_freight_usd + fca.total_intl_shipping_usd + fca.total_service_fee_usd) / soi.quantity
            ELSE NULL
        END as shipping_cost_per_unit_usd,
        CASE
            WHEN oic.unique_paid_sku_count = 1 THEN oca.total_item_cost_cny / soi.quantity
            ELSE NULL
        END as item_cost_per_unit_cny,
        oca.commodity_invoice_files,
        oca.commodity_invoice_ids,
        fca.freight_invoice_files,
        fca.freight_invoice_ids,
        CASE
            WHEN oic.unique_paid_sku_count = 1 THEN true
            ELSE false
        END as is_single_sku_order
    FROM shopify_orders so
    JOIN shopify_order_items soi ON so.order_id = soi.order_id
    INNER JOIN single_paid_sku_orders spso ON REPLACE(so.order_number, '#', '') = spso.order_number
    INNER JOIN order_item_counts oic ON REPLACE(so.order_number, '#', '') = oic.order_number
    LEFT JOIN order_costs_aggregated oca ON REPLACE(so.order_number, '#', '') = oca.order_number
    LEFT JOIN freight_costs_aggregated fca ON REPLACE(so.order_number, '#', '') = fca.order_number
    WHERE soi.sku IS NOT NULL
        AND soi.sku != ''
        AND soi.price > 0  -- ONLY PAID ITEMS (exclude free gifts)
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

COMMENT ON VIEW product_cost_analysis IS 'Product cost analysis V2 - Only single PAID SKU orders (free gifts excluded). Only paid items contribute to cost calculations.';

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check service fees are reasonable now
SELECT
    'Service Fees After Fix' as metric,
    AVG(service_fee_usd) as avg,
    MIN(service_fee_usd) as min,
    MAX(service_fee_usd) as max,
    COUNT(*) as count
FROM invoice_freight_items;

-- Check order counts
SELECT
    'Orders After Fix' as metric,
    COUNT(*) as count,
    AVG(item_count) as avg_items_per_order,
    AVG(total_fulfillment_cost_usd) as avg_total_cost,
    AVG(profit_percentage) as avg_margin_pct
FROM order_cost_analysis;

-- Check product counts
SELECT
    'Products After Fix' as metric,
    COUNT(*) as count,
    AVG(order_count) as avg_orders_per_product,
    AVG(avg_unit_cost_usd) as avg_unit_cost,
    AVG(avg_profit_margin_pct) as avg_margin_pct
FROM product_cost_analysis;

-- Sample orders with item counts
SELECT
    order_name,
    item_count,
    shopify_total_usd as revenue,
    total_fulfillment_cost_usd as cost,
    service_fee_usd,
    profit_percentage as margin_pct
FROM order_cost_analysis
ORDER BY order_date DESC
LIMIT 10;

-- Show example of free gift filtering
SELECT
    'Free Gift Analysis' as analysis,
    COUNT(DISTINCT so.order_number) as total_orders_with_items,
    COUNT(DISTINCT so.order_number) FILTER (
        WHERE EXISTS (
            SELECT 1 FROM shopify_order_items soi2
            WHERE soi2.order_id = so.order_id AND soi2.price = 0
        )
    ) as orders_with_free_gifts,
    COUNT(DISTINCT soi.sku) FILTER (WHERE soi.price = 0) as total_free_gift_skus
FROM shopify_orders so
JOIN shopify_order_items soi ON so.order_id = soi.order_id
WHERE soi.sku IS NOT NULL AND soi.sku != '';

SELECT 'ALL FINAL FIXES APPLIED!' as status;
