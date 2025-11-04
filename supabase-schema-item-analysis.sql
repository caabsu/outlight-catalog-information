-- Item-level cost analysis view - HIGHLY ACCURATE VERSION
-- Only uses single-SKU orders with direct invoice data for maximum accuracy
-- Includes international shipping costs from freight invoices
CREATE OR REPLACE VIEW item_cost_analysis AS
WITH order_sku_complexity AS (
    -- Identify which orders have single vs multiple SKUs
    SELECT
        soi.order_id,
        so.order_number,
        COUNT(DISTINCT soi.sku) as unique_sku_count,
        SUM(soi.quantity) as total_units_in_order
    FROM shopify_order_items soi
    JOIN shopify_orders so ON soi.order_id = so.order_id
    WHERE soi.sku IS NOT NULL AND soi.sku != ''
    GROUP BY soi.order_id, so.order_number
),
international_shipping_by_order AS (
    -- Get total international shipping and service fees per order from freight invoices
    SELECT
        order_number,
        SUM(COALESCE(international_shipping_usd, 0)) as total_intl_shipping_usd,
        SUM(COALESCE(service_fee_usd, 0)) as total_service_fee_usd,
        SUM(COALESCE(international_shipping_usd, 0) + COALESCE(service_fee_usd, 0)) as total_freight_cost_usd
    FROM invoice_freight_items
    WHERE order_number IS NOT NULL AND order_number != ''
    GROUP BY order_number
),
commodity_costs_with_freight AS (
    -- Get commodity costs and join with freight costs
    -- For single-SKU orders, all freight goes to that SKU
    -- For multi-SKU orders, we'll exclude them later
    SELECT
        ic.sku,
        ic.order_number,
        ic.price_usd as commodity_price_usd,
        ic.domestic_freight_usd,
        ic.total_usd as commodity_total_usd,
        osc.unique_sku_count,
        osc.total_units_in_order,
        COALESCE(isbo.total_intl_shipping_usd, 0) as order_intl_shipping_usd,
        COALESCE(isbo.total_service_fee_usd, 0) as order_service_fee_usd,
        COALESCE(isbo.total_freight_cost_usd, 0) as order_freight_cost_usd,
        -- For single-SKU orders, calculate complete per-unit cost including all freight
        CASE
            WHEN osc.unique_sku_count = 1 AND osc.total_units_in_order > 0 THEN
                -- Total cost = commodity + domestic freight + (intl shipping + service fee allocated to this order's units)
                ic.total_usd + (COALESCE(isbo.total_freight_cost_usd, 0) / osc.total_units_in_order)
            ELSE NULL  -- Don't calculate for multi-SKU orders
        END as complete_unit_cost_usd,
        iu.filename as invoice_filename,
        iu.upload_date,
        -- Flag for whether this is a clean, usable data point
        CASE
            WHEN osc.unique_sku_count = 1 THEN true
            ELSE false
        END as is_single_sku_order
    FROM invoice_commodity_items ic
    JOIN invoice_uploads iu ON ic.upload_id = iu.id
    LEFT JOIN order_sku_complexity osc ON ic.order_number = osc.order_number
    LEFT JOIN international_shipping_by_order isbo ON ic.order_number = isbo.order_number
    WHERE ic.sku IS NOT NULL AND ic.sku != ''
),
clean_sku_costs AS (
    -- ONLY use single-SKU orders for averaging - maximum accuracy
    SELECT
        sku,
        COUNT(*) as clean_invoice_count,
        AVG(complete_unit_cost_usd) as avg_complete_unit_cost_usd,
        AVG(commodity_price_usd) as avg_commodity_price_usd,
        AVG(domestic_freight_usd) as avg_domestic_freight_usd,
        AVG(order_intl_shipping_usd / NULLIF(total_units_in_order, 0)) as avg_intl_shipping_per_unit_usd,
        AVG(order_service_fee_usd / NULLIF(total_units_in_order, 0)) as avg_service_fee_per_unit_usd,
        MIN(complete_unit_cost_usd) as min_unit_cost_usd,
        MAX(complete_unit_cost_usd) as max_unit_cost_usd,
        STDDEV(complete_unit_cost_usd) as cost_stddev,
        -- Metadata
        COUNT(DISTINCT order_number) as clean_order_count,
        SUM(total_units_in_order) as total_units_analyzed
    FROM commodity_costs_with_freight
    WHERE is_single_sku_order = true  -- ONLY single-SKU orders
      AND complete_unit_cost_usd IS NOT NULL
    GROUP BY sku
),
line_item_details AS (
    -- Get all line items from Shopify orders with their details
    SELECT
        soi.line_item_id,
        soi.order_id,
        so.order_number,
        so.order_name,
        so.created_at as order_date,
        soi.product_id,
        soi.variant_id,
        soi.title as product_title,
        soi.sku,
        soi.quantity,
        soi.price as unit_price_shopify,
        soi.total_discount,
        -- Calculate actual price customer paid per unit (after discount)
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
    -- Join line items with ONLY clean SKU cost data
    SELECT
        lid.line_item_id,
        lid.order_number,
        lid.order_name,
        lid.order_date,
        lid.sku,
        lid.product_title,
        lid.quantity,
        lid.unit_price_shopify,
        lid.actual_unit_price_usd,
        lid.line_total_revenue,
        lid.total_discount,

        -- Cost data from clean single-SKU orders ONLY
        csc.avg_complete_unit_cost_usd as avg_unit_cost_with_all_fees,
        csc.avg_commodity_price_usd,
        csc.avg_domestic_freight_usd,
        csc.avg_intl_shipping_per_unit_usd,
        csc.avg_service_fee_per_unit_usd,
        csc.clean_invoice_count as times_seen_in_clean_invoices,
        csc.clean_order_count,
        csc.total_units_analyzed,
        csc.cost_stddev as cost_variance,
        csc.min_unit_cost_usd,
        csc.max_unit_cost_usd,

        -- The estimated unit cost (all-inclusive)
        csc.avg_complete_unit_cost_usd as estimated_unit_cost_usd,

        -- Confidence score based on data quality
        CASE
            WHEN csc.avg_complete_unit_cost_usd IS NULL THEN 0
            WHEN csc.clean_invoice_count >= 5 AND csc.cost_stddev < (csc.avg_complete_unit_cost_usd * 0.1) THEN 100
            WHEN csc.clean_invoice_count >= 3 AND csc.cost_stddev < (csc.avg_complete_unit_cost_usd * 0.15) THEN 95
            WHEN csc.clean_invoice_count >= 3 THEN 90
            WHEN csc.clean_invoice_count >= 2 THEN 80
            WHEN csc.clean_invoice_count >= 1 THEN 70
            ELSE 0
        END as cost_confidence_score,

        -- Data source (always direct or none)
        CASE
            WHEN csc.avg_complete_unit_cost_usd IS NOT NULL THEN 'Direct SKU Match (Single-SKU Orders Only)'
            ELSE 'No Clean Invoice Data'
        END as cost_data_source

    FROM line_item_details lid
    LEFT JOIN clean_sku_costs csc ON lid.sku = csc.sku
)
-- Final output with calculated profitability
SELECT
    eic.*,
    -- Profit calculations
    CASE
        WHEN eic.estimated_unit_cost_usd IS NOT NULL THEN
            eic.actual_unit_price_usd - eic.estimated_unit_cost_usd
        ELSE NULL
    END as profit_per_unit_usd,

    CASE
        WHEN eic.estimated_unit_cost_usd IS NOT NULL THEN
            eic.line_total_revenue - (eic.estimated_unit_cost_usd * eic.quantity)
        ELSE NULL
    END as total_line_profit_usd,

    CASE
        WHEN eic.actual_unit_price_usd > 0 AND eic.estimated_unit_cost_usd IS NOT NULL THEN
            ((eic.actual_unit_price_usd - eic.estimated_unit_cost_usd) / eic.actual_unit_price_usd) * 100
        ELSE NULL
    END as profit_margin_percentage

FROM estimated_item_costs eic
ORDER BY eic.order_date DESC, eic.sku;


-- SKU summary view - aggregates all instances of each SKU
-- ONLY includes SKUs with actual clean invoice data (single-SKU orders only)
CREATE OR REPLACE VIEW sku_profitability_summary AS
SELECT
    sku,
    product_title,
    COUNT(DISTINCT order_number) as times_ordered,
    SUM(quantity) as total_units_sold,

    -- Revenue metrics
    AVG(actual_unit_price_usd) as avg_selling_price_usd,
    SUM(line_total_revenue) as total_revenue_usd,

    -- Cost metrics (all-inclusive: commodity + domestic + international + service fees)
    AVG(estimated_unit_cost_usd) as avg_estimated_cost_usd,
    AVG(avg_commodity_price_usd) as avg_commodity_price_usd,
    AVG(avg_domestic_freight_usd) as avg_domestic_freight_usd,
    AVG(avg_intl_shipping_per_unit_usd) as avg_intl_shipping_per_unit_usd,
    AVG(avg_service_fee_per_unit_usd) as avg_service_fee_per_unit_usd,
    SUM(estimated_unit_cost_usd * quantity) as total_estimated_cost_usd,
    AVG(cost_confidence_score) as avg_confidence_score,

    -- Profitability
    AVG(profit_per_unit_usd) as avg_profit_per_unit_usd,
    SUM(total_line_profit_usd) as total_profit_usd,
    AVG(profit_margin_percentage) as avg_profit_margin_pct,

    -- Invoice data quality
    AVG(times_seen_in_clean_invoices) as avg_clean_invoice_count,
    AVG(clean_order_count) as avg_clean_order_count,
    SUM(total_units_analyzed) as total_units_in_invoice_data,

    -- Data availability
    COUNT(CASE WHEN cost_data_source LIKE 'Direct SKU Match%' THEN 1 END) as instances_with_clean_data,
    COUNT(CASE WHEN cost_data_source = 'No Clean Invoice Data' THEN 1 END) as instances_no_data,

    -- Price ranges
    MIN(actual_unit_price_usd) as min_selling_price_usd,
    MAX(actual_unit_price_usd) as max_selling_price_usd,
    MIN(estimated_unit_cost_usd) as min_cost_usd,
    MAX(estimated_unit_cost_usd) as max_cost_usd,
    AVG(cost_variance) as avg_cost_variance

FROM item_cost_analysis
WHERE sku IS NOT NULL AND sku != ''
  AND cost_data_source != 'No Clean Invoice Data'  -- ONLY include items with clean invoice data
  AND estimated_unit_cost_usd IS NOT NULL          -- Must have a valid cost estimate
GROUP BY sku, product_title
ORDER BY total_revenue_usd DESC;


-- Product-level summary view - groups SKUs by product name
-- Shows aggregated metrics at the product level with collapsible SKU details
CREATE OR REPLACE VIEW product_profitability_summary AS
SELECT
    product_title,
    COUNT(DISTINCT sku) as unique_sku_count,
    array_agg(DISTINCT sku ORDER BY sku) as skus,

    COUNT(DISTINCT order_number) as times_ordered,
    SUM(quantity) as total_units_sold,

    -- Revenue metrics
    AVG(actual_unit_price_usd) as avg_selling_price_usd,
    SUM(line_total_revenue) as total_revenue_usd,

    -- Cost metrics
    AVG(estimated_unit_cost_usd) as avg_estimated_cost_usd,
    SUM(estimated_unit_cost_usd * quantity) as total_estimated_cost_usd,
    AVG(cost_confidence_score) as avg_confidence_score,

    -- Profitability
    AVG(profit_per_unit_usd) as avg_profit_per_unit_usd,
    SUM(total_line_profit_usd) as total_profit_usd,
    CASE
        WHEN SUM(line_total_revenue) > 0 THEN
            (SUM(total_line_profit_usd) / SUM(line_total_revenue)) * 100
        ELSE 0
    END as overall_profit_margin_pct,

    -- Data quality
    AVG(times_seen_in_clean_invoices) as avg_clean_invoice_count,
    COUNT(CASE WHEN cost_data_source LIKE 'Direct SKU Match%' THEN 1 END) as instances_with_clean_data,
    COUNT(CASE WHEN cost_data_source = 'No Clean Invoice Data' THEN 1 END) as instances_no_data

FROM item_cost_analysis
WHERE product_title IS NOT NULL
  AND cost_data_source != 'No Clean Invoice Data'
  AND estimated_unit_cost_usd IS NOT NULL
GROUP BY product_title
ORDER BY total_revenue_usd DESC;
