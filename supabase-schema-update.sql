-- Schema update to add actual customer price calculations
-- Run this AFTER the initial schema to add price calculation improvements

-- Drop the old views
DROP VIEW IF EXISTS product_cost_analysis;
DROP VIEW IF EXISTS order_cost_analysis;

-- Recreate order_cost_analysis view with improved calculations
CREATE OR REPLACE VIEW order_cost_analysis AS
SELECT
    so.order_number,
    so.order_name,
    so.created_at as order_date,
    so.total_price as shopify_total_usd,
    so.currency as shopify_currency,

    -- Aggregate commodity costs
    COALESCE(SUM(ic.total_usd), 0) as commodity_total_usd,
    COALESCE(SUM(ic.total_cny), 0) as commodity_total_cny,
    COALESCE(SUM(ic.price_usd), 0) as unit_price_usd,
    COALESCE(SUM(ic.domestic_freight_usd), 0) as domestic_freight_usd,

    -- Aggregate freight costs
    COALESCE(SUM(if_items.international_shipping_usd), 0) as international_shipping_usd,
    COALESCE(SUM(if_items.service_fee_usd), 0) as service_fee_usd,

    -- Total fulfillment cost
    COALESCE(SUM(ic.total_usd), 0) +
    COALESCE(SUM(if_items.international_shipping_usd), 0) +
    COALESCE(SUM(if_items.service_fee_usd), 0) as total_fulfillment_cost_usd,

    -- Profit margin
    so.total_price - (
        COALESCE(SUM(ic.total_usd), 0) +
        COALESCE(SUM(if_items.international_shipping_usd), 0) +
        COALESCE(SUM(if_items.service_fee_usd), 0)
    ) as profit_usd,

    -- Profit percentage
    CASE
        WHEN so.total_price > 0 THEN
            ((so.total_price - (
                COALESCE(SUM(ic.total_usd), 0) +
                COALESCE(SUM(if_items.international_shipping_usd), 0) +
                COALESCE(SUM(if_items.service_fee_usd), 0)
            )) / so.total_price) * 100
        ELSE 0
    END as profit_percentage,

    -- Count of items
    COUNT(DISTINCT soi.id) as item_count

FROM shopify_orders so
LEFT JOIN invoice_commodity_items ic ON so.order_number = ic.order_number
LEFT JOIN invoice_freight_items if_items ON so.order_number = if_items.order_number
LEFT JOIN shopify_order_items soi ON so.order_id = soi.order_id
GROUP BY so.order_number, so.order_name, so.created_at, so.total_price, so.currency;

-- Recreate product_cost_analysis view with ACTUAL customer price (after discounts)
CREATE OR REPLACE VIEW product_cost_analysis AS
SELECT
    soi.sku,
    soi.title as product_title,
    COUNT(DISTINCT soi.order_id) as order_count,
    SUM(soi.quantity) as total_quantity_sold,

    -- Average LISTED price (before discounts)
    AVG(soi.price) as avg_listed_price_usd,

    -- Average ACTUAL price customer paid (after discounts) per unit
    AVG(
        CASE
            WHEN soi.quantity > 0 THEN
                ((soi.price * soi.quantity) - soi.total_discount) / soi.quantity
            ELSE soi.price
        END
    ) as avg_selling_price_usd,

    -- Total revenue from this product (what customers actually paid)
    SUM((soi.price * soi.quantity) - soi.total_discount) as total_revenue_usd,

    -- Average unit cost from invoices (what we pay to fulfill)
    AVG(ic.price_usd) as avg_unit_cost_usd,
    AVG(ic.price_cny) as avg_unit_cost_cny,

    -- Average profit per unit (actual customer payment - unit cost)
    AVG(
        CASE
            WHEN soi.quantity > 0 THEN
                (((soi.price * soi.quantity) - soi.total_discount) / soi.quantity) - COALESCE(ic.price_usd, 0)
            ELSE soi.price - COALESCE(ic.price_usd, 0)
        END
    ) as avg_profit_per_unit_usd

FROM shopify_order_items soi
LEFT JOIN shopify_orders so ON soi.order_id = so.order_id
LEFT JOIN invoice_commodity_items ic ON so.order_number = ic.order_number AND soi.sku = ic.sku
WHERE soi.sku IS NOT NULL AND soi.sku != ''
GROUP BY soi.sku, soi.title;

-- Add helpful comment
COMMENT ON VIEW product_cost_analysis IS 'Product analysis showing ACTUAL customer payment (after discounts) vs fulfillment costs';
COMMENT ON VIEW order_cost_analysis IS 'Order-level cost and profit analysis';
