-- Item-level cost analysis view
-- This provides detailed cost and pricing data at the SKU/line-item level
CREATE OR REPLACE VIEW item_cost_analysis AS
WITH invoice_costs_by_sku AS (
    -- Get all costs from invoices, grouped by SKU
    SELECT
        ic.sku,
        ic.order_number,
        ic.price_usd,
        ic.domestic_freight_usd,
        ic.total_usd,
        iu.filename as invoice_filename,
        iu.upload_date
    FROM invoice_commodity_items ic
    JOIN invoice_uploads iu ON ic.upload_id = iu.id
    WHERE ic.sku IS NOT NULL AND ic.sku != ''
),
sku_average_costs AS (
    -- Calculate average cost per SKU across all invoices
    SELECT
        sku,
        COUNT(*) as invoice_count,
        AVG(price_usd) as avg_unit_price_usd,
        AVG(domestic_freight_usd) as avg_domestic_freight_usd,
        AVG(total_usd) as avg_total_cost_usd,
        MIN(price_usd) as min_unit_price_usd,
        MAX(price_usd) as max_unit_price_usd,
        STDDEV(price_usd) as price_stddev
    FROM invoice_costs_by_sku
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
order_level_costs AS (
    -- Get total fulfillment costs per order from invoice data
    SELECT
        ic.order_number,
        SUM(ic.total_usd) as total_commodity_cost,
        SUM(if_items.international_shipping_usd) as total_freight_cost,
        SUM(if_items.service_fee_usd) as total_service_fee
    FROM invoice_commodity_items ic
    LEFT JOIN invoice_freight_items if_items ON ic.order_number = if_items.order_number
    GROUP BY ic.order_number
),
estimated_item_costs AS (
    -- Estimate cost per line item using multiple methods
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

        -- Method 1: Direct SKU match from invoice (most accurate)
        sac.avg_total_cost_usd as direct_avg_cost_from_invoices,
        sac.avg_unit_price_usd as direct_avg_unit_price,
        sac.avg_domestic_freight_usd as direct_avg_domestic_freight,
        sac.invoice_count as times_seen_in_invoices,
        sac.price_stddev as cost_price_variance,

        -- Method 2: Order-level cost allocation (when SKU-specific data unavailable)
        olc.total_commodity_cost,
        olc.total_freight_cost,
        olc.total_service_fee,

        -- Best estimate for unit cost
        COALESCE(
            -- Priority 1: Use direct SKU average from invoices
            sac.avg_total_cost_usd / NULLIF(lid.quantity, 0),
            -- Priority 2: Allocate order costs proportionally based on revenue
            CASE
                WHEN olc.total_commodity_cost > 0 THEN
                    (olc.total_commodity_cost / NULLIF(lid.quantity, 0))
                ELSE NULL
            END,
            -- Priority 3: Use a default cost ratio (e.g., 60% of selling price)
            lid.actual_unit_price_usd * 0.60
        ) as estimated_unit_cost_usd,

        -- Confidence score for the estimate (0-100)
        CASE
            WHEN sac.avg_total_cost_usd IS NOT NULL AND sac.invoice_count >= 3 THEN 95
            WHEN sac.avg_total_cost_usd IS NOT NULL AND sac.invoice_count >= 2 THEN 85
            WHEN sac.avg_total_cost_usd IS NOT NULL THEN 70
            WHEN olc.total_commodity_cost > 0 THEN 50
            ELSE 20
        END as cost_confidence_score,

        -- Data source indicator
        CASE
            WHEN sac.avg_total_cost_usd IS NOT NULL THEN 'Direct SKU Match'
            WHEN olc.total_commodity_cost > 0 THEN 'Order Allocation'
            ELSE 'Estimated (60% ratio)'
        END as cost_data_source

    FROM line_item_details lid
    LEFT JOIN sku_average_costs sac ON lid.sku = sac.sku
    LEFT JOIN order_level_costs olc ON lid.order_number = olc.order_number
)
-- Final output with calculated profitability
SELECT
    eic.*,
    -- Profit calculations
    (eic.actual_unit_price_usd - eic.estimated_unit_cost_usd) as profit_per_unit_usd,
    (eic.line_total_revenue - (eic.estimated_unit_cost_usd * eic.quantity)) as total_line_profit_usd,
    CASE
        WHEN eic.actual_unit_price_usd > 0 THEN
            ((eic.actual_unit_price_usd - eic.estimated_unit_cost_usd) / eic.actual_unit_price_usd) * 100
        ELSE 0
    END as profit_margin_percentage,

    -- Cost breakdown
    eic.direct_avg_unit_price as avg_unit_price_cny_converted,
    eic.direct_avg_domestic_freight as avg_domestic_freight_per_unit

FROM estimated_item_costs eic
ORDER BY eic.order_date DESC, eic.sku;


-- SKU summary view - aggregates all instances of each SKU
CREATE OR REPLACE VIEW sku_profitability_summary AS
SELECT
    sku,
    product_title,
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
    AVG(profit_margin_percentage) as avg_profit_margin_pct,

    -- Invoice data availability
    COUNT(CASE WHEN cost_data_source = 'Direct SKU Match' THEN 1 END) as instances_with_invoice_data,
    COUNT(CASE WHEN cost_data_source = 'Order Allocation' THEN 1 END) as instances_with_order_data,
    COUNT(CASE WHEN cost_data_source = 'Estimated (60% ratio)' THEN 1 END) as instances_estimated,

    -- Price ranges
    MIN(actual_unit_price_usd) as min_selling_price_usd,
    MAX(actual_unit_price_usd) as max_selling_price_usd,
    MIN(estimated_unit_cost_usd) as min_cost_usd,
    MAX(estimated_unit_cost_usd) as max_cost_usd

FROM item_cost_analysis
WHERE sku IS NOT NULL AND sku != ''
GROUP BY sku, product_title
ORDER BY total_revenue_usd DESC;
