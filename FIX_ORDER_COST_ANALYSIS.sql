-- =====================================================
-- FIX ORDER COST ANALYSIS VIEW
-- Only show orders with BOTH commodity AND freight data
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
order_costs AS (
    SELECT
        REPLACE(so.order_number, '#', '') as order_number_clean,
        so.order_number,
        so.order_name,
        so.created_at as order_date,
        so.total_price as shopify_total_usd,
        so.currency as shopify_currency,

        -- Aggregate commodity costs (handle # prefix)
        COALESCE(SUM(ic.total_usd), 0) as commodity_total_usd,
        COALESCE(SUM(ic.total_cny), 0) as commodity_total_cny,
        COALESCE(SUM(ic.price_usd), 0) as unit_price_usd,
        COALESCE(SUM(ic.domestic_freight_usd), 0) as domestic_freight_usd,

        -- Aggregate freight costs (handle # prefix)
        COALESCE(SUM(if_items.international_shipping_usd), 0) as international_shipping_usd,
        COALESCE(SUM(if_items.service_fee_usd), 0) as service_fee_usd,

        -- Count of items
        COUNT(DISTINCT soi.id) as item_count

    FROM shopify_orders so
    INNER JOIN clean_orders co
        ON REPLACE(so.order_number, '#', '') = co.order_number_clean
    LEFT JOIN invoice_commodity_items ic
        ON REPLACE(so.order_number, '#', '') = REPLACE(ic.order_number, '#', '')
    LEFT JOIN invoice_freight_items if_items
        ON REPLACE(so.order_number, '#', '') = REPLACE(if_items.order_number, '#', '')
    LEFT JOIN shopify_order_items soi
        ON so.order_id = soi.order_id
    GROUP BY so.order_number, so.order_name, so.created_at, so.total_price, so.currency
)
SELECT
    order_number,
    order_name,
    order_date,
    shopify_total_usd,
    shopify_currency,
    commodity_total_usd,
    commodity_total_cny,
    unit_price_usd,
    domestic_freight_usd,
    international_shipping_usd,
    service_fee_usd,

    -- Total fulfillment cost
    commodity_total_usd + international_shipping_usd + service_fee_usd as total_fulfillment_cost_usd,

    -- Profit margin
    shopify_total_usd - (commodity_total_usd + international_shipping_usd + service_fee_usd) as profit_usd,

    -- Profit percentage
    CASE
        WHEN shopify_total_usd > 0 THEN
            ((shopify_total_usd - (commodity_total_usd + international_shipping_usd + service_fee_usd)) / shopify_total_usd) * 100
        ELSE 0
    END as profit_percentage,

    item_count
FROM order_costs
WHERE commodity_total_usd > 0
    AND international_shipping_usd > 0;  -- Only show orders with both types of data

COMMENT ON VIEW order_cost_analysis IS 'Order-level cost analysis - only includes orders with BOTH commodity and freight invoice data. Handles # prefix in order numbers.';
