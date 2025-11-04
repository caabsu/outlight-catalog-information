-- CORRECTED SQL - Fixed all syntax errors
-- Drop existing views first
DROP VIEW IF EXISTS product_profitability_summary CASCADE;
DROP VIEW IF EXISTS sku_profitability_summary CASCADE;
DROP VIEW IF EXISTS item_cost_analysis CASCADE;

-- Create the main view
CREATE OR REPLACE VIEW item_cost_analysis AS
WITH order_costs AS (
    SELECT
        REPLACE(ic.order_number, '#', '') as order_number,
        SUM(COALESCE(ic.price_usd, 0)) as total_commodity_price_usd,
        SUM(COALESCE(ic.domestic_freight_usd, 0)) as total_domestic_freight_usd,
        SUM(COALESCE(ic.total_usd, 0)) as total_commodity_cost_usd,
        COUNT(*) as invoice_line_count
    FROM invoice_commodity_items ic
    WHERE ic.order_number IS NOT NULL AND ic.order_number != ''
    GROUP BY REPLACE(ic.order_number, '#', '')
),
order_freight AS (
    SELECT
        REPLACE(order_number, '#', '') as order_number,
        SUM(COALESCE(international_shipping_usd, 0)) as total_intl_shipping_usd,
        SUM(COALESCE(service_fee_usd, 0)) as total_service_fee_usd
    FROM invoice_freight_items
    WHERE order_number IS NOT NULL AND order_number != ''
    GROUP BY REPLACE(order_number, '#', '')
),
orders_with_complete_data AS (
    SELECT DISTINCT oc.order_number
    FROM order_costs oc
    INNER JOIN order_freight of ON oc.order_number = of.order_number
    WHERE oc.total_commodity_cost_usd > 0
),
order_total_costs AS (
    SELECT
        oc.order_number,
        oc.total_commodity_price_usd as order_commodity_price_usd,
        oc.total_domestic_freight_usd as order_domestic_freight_usd,
        oc.total_commodity_cost_usd as order_commodity_total_usd,
        of.total_intl_shipping_usd as order_intl_shipping_usd,
        of.total_service_fee_usd as order_service_fee_usd,
        oc.total_commodity_cost_usd + of.total_intl_shipping_usd + of.total_service_fee_usd as total_order_cost_usd,
        true as has_complete_data
    FROM order_costs oc
    INNER JOIN order_freight of ON oc.order_number = of.order_number
    WHERE oc.order_number IN (SELECT order_number FROM orders_with_complete_data)
),
order_details AS (
    SELECT
        REPLACE(so.order_number, '#', '') as order_number,
        COUNT(DISTINCT soi.sku) as unique_sku_count,
        SUM(soi.quantity) as total_units_in_order,
        SUM((soi.price * soi.quantity) - soi.total_discount) as order_total_revenue
    FROM shopify_orders so
    JOIN shopify_order_items soi ON so.order_id = soi.order_id
    WHERE soi.sku IS NOT NULL AND soi.sku != ''
    GROUP BY REPLACE(so.order_number, '#', '')
),
line_item_details AS (
    SELECT
        soi.line_item_id,
        soi.order_id,
        REPLACE(so.order_number, '#', '') as order_number,
        so.order_name,
        so.created_at as order_date,
        soi.product_id,
        soi.variant_id,
        soi.title as product_title,
        soi.sku,
        soi.quantity,
        soi.price as unit_price_shopify,
        soi.total_discount,
        CASE
            WHEN soi.quantity > 0 THEN
                ((soi.price * soi.quantity) - soi.total_discount) / soi.quantity
            ELSE soi.price
        END as actual_unit_price_usd,
        (soi.price * soi.quantity) - soi.total_discount as line_total_revenue
    FROM shopify_order_items soi
    JOIN shopify_orders so ON soi.order_id = so.order_id
    WHERE soi.sku IS NOT NULL AND soi.sku != ''
),
estimated_item_costs AS (
    SELECT
        lid.*,
        od.unique_sku_count,
        od.total_units_in_order,
        od.order_total_revenue,
        otc.order_commodity_price_usd,
        otc.order_domestic_freight_usd,
        otc.order_commodity_total_usd,
        otc.order_intl_shipping_usd,
        otc.order_service_fee_usd,
        otc.total_order_cost_usd,
        otc.has_complete_data,
        CASE
            WHEN od.order_total_revenue > 0 THEN lid.line_total_revenue / od.order_total_revenue
            ELSE 0
        END as revenue_share_pct,
        CASE
            WHEN otc.has_complete_data = true AND od.unique_sku_count = 1 AND lid.quantity > 0 THEN
                otc.total_order_cost_usd / lid.quantity
            WHEN otc.has_complete_data = true AND od.unique_sku_count > 1 AND od.order_total_revenue > 0 AND lid.quantity > 0 THEN
                (otc.total_order_cost_usd * (lid.line_total_revenue / od.order_total_revenue)) / lid.quantity
            ELSE NULL
        END as estimated_unit_cost_usd,
        CASE
            WHEN otc.has_complete_data = true AND od.unique_sku_count = 1 AND lid.quantity > 0 THEN
                otc.order_commodity_price_usd / lid.quantity
            WHEN otc.has_complete_data = true AND od.unique_sku_count > 1 AND od.order_total_revenue > 0 AND lid.quantity > 0 THEN
                (otc.order_commodity_price_usd * (lid.line_total_revenue / od.order_total_revenue)) / lid.quantity
            ELSE NULL
        END as allocated_commodity_price_per_unit,
        CASE
            WHEN otc.has_complete_data = true AND od.unique_sku_count = 1 AND lid.quantity > 0 THEN
                otc.order_domestic_freight_usd / lid.quantity
            WHEN otc.has_complete_data = true AND od.unique_sku_count > 1 AND od.order_total_revenue > 0 AND lid.quantity > 0 THEN
                (otc.order_domestic_freight_usd * (lid.line_total_revenue / od.order_total_revenue)) / lid.quantity
            ELSE NULL
        END as allocated_domestic_freight_per_unit,
        CASE
            WHEN otc.has_complete_data = true AND od.unique_sku_count = 1 AND lid.quantity > 0 THEN
                otc.order_intl_shipping_usd / lid.quantity
            WHEN otc.has_complete_data = true AND od.unique_sku_count > 1 AND od.order_total_revenue > 0 AND lid.quantity > 0 THEN
                (otc.order_intl_shipping_usd * (lid.line_total_revenue / od.order_total_revenue)) / lid.quantity
            ELSE NULL
        END as allocated_intl_shipping_per_unit,
        CASE
            WHEN otc.has_complete_data = true AND od.unique_sku_count = 1 AND lid.quantity > 0 THEN
                otc.order_service_fee_usd / lid.quantity
            WHEN otc.has_complete_data = true AND od.unique_sku_count > 1 AND od.order_total_revenue > 0 AND lid.quantity > 0 THEN
                (otc.order_service_fee_usd * (lid.line_total_revenue / od.order_total_revenue)) / lid.quantity
            ELSE NULL
        END as allocated_service_fee_per_unit,
        CASE
            WHEN otc.has_complete_data IS NULL OR otc.has_complete_data = false THEN 0
            WHEN od.unique_sku_count = 1 THEN 100
            WHEN od.unique_sku_count = 2 THEN 85
            WHEN od.unique_sku_count = 3 THEN 75
            WHEN od.unique_sku_count <= 5 THEN 60
            WHEN od.unique_sku_count > 5 THEN 40
            ELSE 0
        END as cost_confidence_score,
        CASE
            WHEN otc.has_complete_data IS NULL OR otc.has_complete_data = false THEN 'Incomplete Invoice Data'
            WHEN od.unique_sku_count = 1 THEN 'Complete Data - Direct Allocation (Single-SKU)'
            ELSE CONCAT('Complete Data - Proportional Allocation (', od.unique_sku_count::text, ' SKUs)')
        END as cost_data_source
    FROM line_item_details lid
    LEFT JOIN order_details od ON lid.order_number = od.order_number
    LEFT JOIN order_total_costs otc ON lid.order_number = otc.order_number
)
SELECT
    eic.*,
    CASE
        WHEN eic.has_complete_data = true AND eic.estimated_unit_cost_usd IS NOT NULL THEN
            eic.actual_unit_price_usd - eic.estimated_unit_cost_usd
        ELSE NULL
    END as profit_per_unit_usd,
    CASE
        WHEN eic.has_complete_data = true AND eic.estimated_unit_cost_usd IS NOT NULL THEN
            eic.line_total_revenue - (eic.estimated_unit_cost_usd * eic.quantity)
        ELSE NULL
    END as total_line_profit_usd,
    CASE
        WHEN eic.has_complete_data = true AND eic.actual_unit_price_usd > 0 AND eic.estimated_unit_cost_usd IS NOT NULL THEN
            ((eic.actual_unit_price_usd - eic.estimated_unit_cost_usd) / eic.actual_unit_price_usd) * 100
        ELSE NULL
    END as profit_margin_percentage
FROM estimated_item_costs eic
ORDER BY eic.order_date DESC, eic.sku;


-- SKU summary view
CREATE OR REPLACE VIEW sku_profitability_summary AS
SELECT
    sku,
    product_title,
    COUNT(DISTINCT order_number) as times_ordered,
    SUM(quantity) as total_units_sold,
    AVG(actual_unit_price_usd) as avg_selling_price_usd,
    SUM(line_total_revenue) as total_revenue_usd,
    AVG(estimated_unit_cost_usd) as avg_estimated_cost_usd,
    AVG(allocated_commodity_price_per_unit) as avg_commodity_price_usd,
    AVG(allocated_domestic_freight_per_unit) as avg_domestic_freight_usd,
    AVG(allocated_intl_shipping_per_unit) as avg_intl_shipping_per_unit_usd,
    AVG(allocated_service_fee_per_unit) as avg_service_fee_per_unit_usd,
    SUM(estimated_unit_cost_usd * quantity) as total_estimated_cost_usd,
    AVG(cost_confidence_score) as avg_confidence_score,
    AVG(profit_per_unit_usd) as avg_profit_per_unit_usd,
    SUM(total_line_profit_usd) as total_profit_usd,
    AVG(profit_margin_percentage) as avg_profit_margin_pct,
    COUNT(CASE WHEN cost_data_source LIKE 'Complete Data - Direct%' THEN 1 END) as instances_single_sku,
    COUNT(CASE WHEN cost_data_source LIKE 'Complete Data - Proportional%' THEN 1 END) as instances_multi_sku,
    COUNT(CASE WHEN cost_data_source = 'Incomplete Invoice Data' THEN 1 END) as instances_incomplete_data,
    MIN(actual_unit_price_usd) as min_selling_price_usd,
    MAX(actual_unit_price_usd) as max_selling_price_usd,
    MIN(estimated_unit_cost_usd) as min_cost_usd,
    MAX(estimated_unit_cost_usd) as max_cost_usd
FROM item_cost_analysis
WHERE sku IS NOT NULL AND sku != ''
  AND cost_data_source != 'Incomplete Invoice Data'
  AND has_complete_data = true
  AND estimated_unit_cost_usd IS NOT NULL
GROUP BY sku, product_title
ORDER BY total_revenue_usd DESC;


-- Product summary view
CREATE OR REPLACE VIEW product_profitability_summary AS
SELECT
    product_title,
    COUNT(DISTINCT sku) as unique_sku_count,
    array_agg(DISTINCT sku ORDER BY sku) as skus,
    COUNT(DISTINCT order_number) as times_ordered,
    SUM(quantity) as total_units_sold,
    AVG(actual_unit_price_usd) as avg_selling_price_usd,
    SUM(line_total_revenue) as total_revenue_usd,
    AVG(estimated_unit_cost_usd) as avg_estimated_cost_usd,
    AVG(allocated_commodity_price_per_unit) as avg_commodity_price_per_unit,
    AVG(allocated_domestic_freight_per_unit) as avg_domestic_freight_per_unit,
    AVG(allocated_intl_shipping_per_unit) as avg_intl_shipping_per_unit,
    AVG(allocated_service_fee_per_unit) as avg_service_fee_per_unit,
    SUM(estimated_unit_cost_usd * quantity) as total_estimated_cost_usd,
    SUM(allocated_commodity_price_per_unit * quantity) as total_commodity_cost_usd,
    SUM(allocated_domestic_freight_per_unit * quantity) as total_domestic_freight_usd,
    SUM(allocated_intl_shipping_per_unit * quantity) as total_intl_shipping_usd,
    SUM(allocated_service_fee_per_unit * quantity) as total_service_fee_usd,
    AVG(cost_confidence_score) as avg_confidence_score,
    AVG(profit_per_unit_usd) as avg_profit_per_unit_usd,
    SUM(total_line_profit_usd) as total_profit_usd,
    CASE
        WHEN SUM(line_total_revenue) > 0 THEN
            (SUM(total_line_profit_usd) / SUM(line_total_revenue)) * 100
        ELSE 0
    END as overall_profit_margin_pct,
    COUNT(CASE WHEN cost_data_source LIKE 'Complete Data - Direct%' THEN 1 END) as instances_single_sku,
    COUNT(CASE WHEN cost_data_source LIKE 'Complete Data - Proportional%' THEN 1 END) as instances_multi_sku,
    COUNT(CASE WHEN cost_data_source = 'Incomplete Invoice Data' THEN 1 END) as instances_incomplete_data
FROM item_cost_analysis
WHERE product_title IS NOT NULL
  AND cost_data_source != 'Incomplete Invoice Data'
  AND has_complete_data = true
  AND estimated_unit_cost_usd IS NOT NULL
GROUP BY product_title
ORDER BY total_revenue_usd DESC;
