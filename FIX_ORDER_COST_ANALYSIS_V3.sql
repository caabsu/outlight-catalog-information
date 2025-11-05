-- =====================================================
-- FIX ORDER COST ANALYSIS VIEW V3
-- Fixes cartesian product issue from joining commodity + freight
-- Only show orders with BOTH commodity AND freight data
-- ONLY SINGLE-SKU ORDERS (or multiple of same SKU)
-- Excludes multi-SKU orders where cost allocation is unclear
-- Handle # prefix in order numbers correctly
-- =====================================================

DROP VIEW IF EXISTS order_cost_analysis CASCADE;

CREATE OR REPLACE VIEW order_cost_analysis AS
WITH clean_orders AS (
    -- Only orders with BOTH commodity AND freight data
    SELECT DISTINCT
        REPLACE(ic.order_number, '#', '') as order_number_clean
    FROM invoice_commodity_items ic
    INNER JOIN invoice_freight_items if_items
        ON REPLACE(ic.order_number, '#', '') = REPLACE(if_items.order_number, '#', '')
    WHERE ic.total_usd > 0
        AND if_items.international_shipping_usd > 0
),
order_sku_counts AS (
    -- Count how many DISTINCT SKUs in each order
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
    -- ONLY orders with one unique SKU (can be multiple quantity of same product)
    -- Excludes orders with multiple different products where cost allocation is unclear
    SELECT order_number_clean, item_count
    FROM order_sku_counts
    WHERE unique_sku_count = 1
),
commodity_costs AS (
    -- Aggregate commodity costs separately (no cartesian product)
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
    -- Aggregate freight costs separately (no cartesian product)
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

    -- Commodity costs (from separate aggregation)
    COALESCE(cc.commodity_total_usd, 0) as commodity_total_usd,
    COALESCE(cc.commodity_total_cny, 0) as commodity_total_cny,
    COALESCE(cc.unit_price_usd, 0) as unit_price_usd,
    COALESCE(cc.domestic_freight_usd, 0) as domestic_freight_usd,

    -- Freight costs (from separate aggregation)
    COALESCE(fc.international_shipping_usd, 0) as international_shipping_usd,
    COALESCE(fc.service_fee_usd, 0) as service_fee_usd,

    -- Total fulfillment cost
    COALESCE(cc.commodity_total_usd, 0) +
    COALESCE(fc.international_shipping_usd, 0) +
    COALESCE(fc.service_fee_usd, 0) as total_fulfillment_cost_usd,

    -- Profit margin
    so.total_price - (
        COALESCE(cc.commodity_total_usd, 0) +
        COALESCE(fc.international_shipping_usd, 0) +
        COALESCE(fc.service_fee_usd, 0)
    ) as profit_usd,

    -- Profit percentage
    CASE
        WHEN so.total_price > 0 THEN
            ((so.total_price - (
                COALESCE(cc.commodity_total_usd, 0) +
                COALESCE(fc.international_shipping_usd, 0) +
                COALESCE(fc.service_fee_usd, 0)
            )) / so.total_price) * 100
        ELSE 0
    END as profit_percentage,

    -- Item count
    COALESCE(sso.item_count, 0) as item_count

FROM shopify_orders so
INNER JOIN clean_orders co
    ON REPLACE(so.order_number, '#', '') = co.order_number_clean
INNER JOIN single_sku_orders sso
    ON REPLACE(so.order_number, '#', '') = sso.order_number_clean
LEFT JOIN commodity_costs cc
    ON REPLACE(so.order_number, '#', '') = cc.order_number_clean
LEFT JOIN freight_costs fc
    ON REPLACE(so.order_number, '#', '') = fc.order_number_clean
WHERE COALESCE(cc.commodity_total_usd, 0) > 0
    AND COALESCE(fc.international_shipping_usd, 0) > 0;

COMMENT ON VIEW order_cost_analysis IS 'Order-level cost analysis with NO cartesian product and ONLY single-SKU orders. Multi-SKU orders are excluded because cost allocation per product is unclear from invoices. Aggregates commodity and freight separately before joining.';

-- Example queries to understand the filtering:

-- See how many orders are excluded due to multiple SKUs:
-- SELECT
--     COUNT(*) FILTER (WHERE unique_sku_count = 1) as single_sku_orders,
--     COUNT(*) FILTER (WHERE unique_sku_count > 1) as multi_sku_orders_excluded,
--     COUNT(*) as total_orders
-- FROM (
--     SELECT
--         order_number,
--         COUNT(DISTINCT sku) as unique_sku_count
--     FROM shopify_order_items
--     WHERE sku IS NOT NULL AND sku != ''
--     GROUP BY order_number
-- ) counts;

-- See examples of excluded multi-SKU orders:
-- SELECT
--     so.order_number,
--     so.order_name,
--     COUNT(DISTINCT soi.sku) as unique_skus,
--     string_agg(DISTINCT soi.sku, ', ') as skus
-- FROM shopify_orders so
-- JOIN shopify_order_items soi ON so.order_id = soi.order_id
-- WHERE soi.sku IS NOT NULL AND soi.sku != ''
-- GROUP BY so.order_number, so.order_name
-- HAVING COUNT(DISTINCT soi.sku) > 1
-- LIMIT 10;
