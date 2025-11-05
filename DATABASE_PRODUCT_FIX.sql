-- =====================================================
-- FIX PRODUCT ANALYSIS - SMART SKU MATCHING
-- Only includes clean single-SKU orders or multi-SKU with clear breakdowns
-- =====================================================

-- Drop old view
DROP VIEW IF EXISTS product_cost_analysis CASCADE;

-- Create new smart product analysis view
CREATE OR REPLACE VIEW product_cost_analysis AS
WITH clean_orders AS (
    -- Only orders with BOTH commodity AND freight data
    SELECT DISTINCT
        REPLACE(ic.order_number, '#', '') as order_number
    FROM invoice_commodity_items ic
    INNER JOIN invoice_freight_items if_items
        ON REPLACE(ic.order_number, '#', '') = REPLACE(if_items.order_number, '#', '')
    WHERE ic.total_usd > 0
        AND if_items.international_shipping_usd > 0
),
order_item_counts AS (
    -- Count how many DISTINCT products in each order
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
    -- ONLY single-SKU orders (most reliable)
    SELECT order_number
    FROM order_item_counts
    WHERE unique_sku_count = 1
),
order_costs_aggregated AS (
    -- Aggregate all costs per order
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
    -- Aggregate freight per order
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
    -- Join Shopify data with invoice data
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
            WHEN soi.quantity > 0 THEN
                ((soi.price * soi.quantity) - soi.total_discount) / soi.quantity
            ELSE soi.price
        END as actual_unit_price_usd,
        (soi.price * soi.quantity) - soi.total_discount as line_revenue,

        -- Order context
        oic.unique_sku_count,
        oic.order_revenue,

        -- Costs (allocated)
        CASE
            WHEN oic.unique_sku_count = 1 THEN
                -- Single SKU: direct allocation
                (oca.total_item_cost_usd + oca.total_domestic_freight_usd +
                 fca.total_intl_shipping_usd + fca.total_service_fee_usd) / soi.quantity
            ELSE NULL  -- Exclude multi-SKU orders
        END as estimated_unit_cost_usd,

        -- Cost breakdown per unit
        CASE
            WHEN oic.unique_sku_count = 1 THEN
                oca.total_item_cost_usd / soi.quantity
            ELSE NULL
        END as item_cost_per_unit_usd,

        CASE
            WHEN oic.unique_sku_count = 1 THEN
                (oca.total_domestic_freight_usd + fca.total_intl_shipping_usd + fca.total_service_fee_usd) / soi.quantity
            ELSE NULL
        END as shipping_cost_per_unit_usd,

        -- CNY breakdown
        CASE
            WHEN oic.unique_sku_count = 1 THEN
                oca.total_item_cost_cny / soi.quantity
            ELSE NULL
        END as item_cost_per_unit_cny,

        -- Invoice tracking
        oca.commodity_invoice_files,
        oca.commodity_invoice_ids,
        fca.freight_invoice_files,
        fca.freight_invoice_ids,

        -- Metadata
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
-- Final aggregation by SKU
SELECT
    sku,
    product_title,
    COUNT(DISTINCT order_number) as order_count,
    SUM(quantity) as total_quantity_sold,

    -- Revenue metrics
    AVG(unit_price_shopify) as avg_listed_price_usd,
    AVG(actual_unit_price_usd) as avg_selling_price_usd,
    SUM(line_revenue) as total_revenue_usd,

    -- Cost metrics (ONLY from single-SKU orders)
    AVG(estimated_unit_cost_usd) as avg_unit_cost_usd,
    AVG(item_cost_per_unit_usd) as avg_item_cost_usd,
    AVG(shipping_cost_per_unit_usd) as avg_shipping_cost_usd,
    AVG(item_cost_per_unit_cny) as avg_unit_cost_cny,

    -- Total costs
    SUM(estimated_unit_cost_usd * quantity) as total_cost_usd,
    SUM(item_cost_per_unit_usd * quantity) as total_item_cost_usd,
    SUM(shipping_cost_per_unit_usd * quantity) as total_shipping_cost_usd,

    -- Profit metrics
    AVG(actual_unit_price_usd - estimated_unit_cost_usd) as avg_profit_per_unit_usd,
    SUM((actual_unit_price_usd - estimated_unit_cost_usd) * quantity) as total_profit_usd,
    AVG(
        CASE
            WHEN actual_unit_price_usd > 0 THEN
                ((actual_unit_price_usd - estimated_unit_cost_usd) / actual_unit_price_usd) * 100
            ELSE 0
        END
    ) as avg_profit_margin_pct,

    -- Data quality
    COUNT(DISTINCT order_number) FILTER (WHERE is_single_sku_order = true) as single_sku_order_count,
    COUNT(DISTINCT order_number) FILTER (WHERE estimated_unit_cost_usd IS NOT NULL) as orders_with_cost_data,

    -- Cost breakdown percentages
    AVG(
        CASE
            WHEN estimated_unit_cost_usd > 0 THEN
                (item_cost_per_unit_usd / estimated_unit_cost_usd) * 100
            ELSE 0
        END
    ) as item_cost_percentage,
    AVG(
        CASE
            WHEN estimated_unit_cost_usd > 0 THEN
                (shipping_cost_per_unit_usd / estimated_unit_cost_usd) * 100
            ELSE 0
        END
    ) as shipping_cost_percentage

FROM product_orders
WHERE sku IS NOT NULL AND sku != ''
GROUP BY sku, product_title
HAVING COUNT(DISTINCT order_number) FILTER (WHERE estimated_unit_cost_usd IS NOT NULL) > 0
ORDER BY total_revenue_usd DESC;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_shopify_order_items_sku_v2
ON shopify_order_items(sku)
WHERE sku IS NOT NULL AND sku != '';

CREATE INDEX IF NOT EXISTS idx_invoice_commodity_order_v2
ON invoice_commodity_items(order_number, total_usd)
WHERE total_usd > 0;

CREATE INDEX IF NOT EXISTS idx_invoice_freight_order_v2
ON invoice_freight_items(order_number, international_shipping_usd)
WHERE international_shipping_usd > 0;

-- Verify the view works
SELECT
    COUNT(*) as total_products,
    COUNT(*) FILTER (WHERE avg_unit_cost_usd > 0) as products_with_costs,
    SUM(total_revenue_usd) as total_revenue,
    SUM(total_profit_usd) as total_profit
FROM product_cost_analysis;

-- Show sample data
SELECT
    sku,
    product_title,
    order_count,
    total_quantity_sold,
    ROUND(avg_selling_price_usd::numeric, 2) as avg_price,
    ROUND(avg_unit_cost_usd::numeric, 2) as avg_cost,
    ROUND(avg_item_cost_usd::numeric, 2) as item_cost,
    ROUND(avg_shipping_cost_usd::numeric, 2) as shipping_cost,
    ROUND(avg_profit_per_unit_usd::numeric, 2) as profit_per_unit,
    ROUND(avg_profit_margin_pct::numeric, 1) as margin_pct,
    single_sku_order_count
FROM product_cost_analysis
LIMIT 10;
