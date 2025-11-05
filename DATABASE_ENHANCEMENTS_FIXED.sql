-- =====================================================
-- DATABASE ENHANCEMENTS FOR UNIFIED PRODUCTS VIEW
-- FIXED VERSION - No indexes on views
-- Execute these in Supabase SQL Editor
-- =====================================================

-- Enhancement 1: Add indexes on BASE TABLES for better performance
-- These will speed up the views that query from these tables

-- Indexes on shopify_order_items (used by item_cost_analysis)
CREATE INDEX IF NOT EXISTS idx_shopify_order_items_sku
ON shopify_order_items(sku) WHERE sku IS NOT NULL AND sku != '';

CREATE INDEX IF NOT EXISTS idx_shopify_order_items_order_id
ON shopify_order_items(order_id);

-- Indexes on shopify_orders (used by item_cost_analysis)
CREATE INDEX IF NOT EXISTS idx_shopify_orders_order_number
ON shopify_orders(order_number);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_created_at
ON shopify_orders(created_at DESC);

-- Indexes on invoice tables
CREATE INDEX IF NOT EXISTS idx_invoice_commodity_order_number
ON invoice_commodity_items(order_number) WHERE order_number IS NOT NULL AND order_number != '';

CREATE INDEX IF NOT EXISTS idx_invoice_freight_order_number
ON invoice_freight_items(order_number) WHERE order_number IS NOT NULL AND order_number != '';

CREATE INDEX IF NOT EXISTS idx_invoice_commodity_upload_id
ON invoice_commodity_items(upload_id);

CREATE INDEX IF NOT EXISTS idx_invoice_freight_upload_id
ON invoice_freight_items(upload_id);

-- Enhancement 2: Create a unified product summary view
-- This combines the best of both product_cost_analysis and product_profitability_summary
-- Optimized for the new unified interface

DROP VIEW IF EXISTS unified_product_analysis CASCADE;

CREATE VIEW unified_product_analysis AS
WITH product_base AS (
    SELECT
        sku,
        product_title,
        COUNT(DISTINCT order_number) as order_count,
        SUM(quantity) as total_quantity_sold,

        -- Revenue metrics
        AVG(unit_price_shopify) as avg_listed_price_usd,
        AVG(actual_unit_price_usd) as avg_selling_price_usd,
        SUM(line_total_revenue) as total_revenue_usd,

        -- Cost metrics (only for complete data)
        AVG(estimated_unit_cost_usd) as avg_unit_cost_usd,
        AVG(CASE WHEN estimated_unit_cost_usd IS NOT NULL
            THEN estimated_unit_cost_usd / 0.138
            ELSE NULL END) as avg_unit_cost_cny,
        SUM(estimated_unit_cost_usd * quantity) as total_cost_usd,

        -- Cost breakdown
        AVG(allocated_commodity_price_per_unit) as avg_commodity_cost,
        AVG(allocated_domestic_freight_per_unit) as avg_domestic_freight,
        AVG(allocated_intl_shipping_per_unit) as avg_intl_shipping,
        AVG(allocated_service_fee_per_unit) as avg_service_fee,

        -- Profit metrics
        AVG(profit_per_unit_usd) as avg_profit_per_unit_usd,
        SUM(total_line_profit_usd) as total_profit_usd,
        AVG(profit_margin_percentage) as avg_profit_margin_pct,

        -- Data quality
        AVG(cost_confidence_score) as avg_confidence_score,
        COUNT(CASE WHEN has_complete_data = true THEN 1 END) as orders_with_complete_data,
        COUNT(CASE WHEN has_complete_data = false OR has_complete_data IS NULL THEN 1 END) as orders_missing_data,

        -- Order date range
        MIN(order_date) as first_order_date,
        MAX(order_date) as last_order_date

    FROM item_cost_analysis
    WHERE sku IS NOT NULL AND sku != ''
    GROUP BY sku, product_title
)
SELECT
    *,
    -- Calculated fields for easier frontend use
    (total_revenue_usd / NULLIF(total_quantity_sold, 0)) as revenue_per_unit,
    (total_cost_usd / NULLIF(total_quantity_sold, 0)) as cost_per_unit,
    (total_profit_usd / NULLIF(total_quantity_sold, 0)) as profit_per_unit,
    (total_profit_usd / NULLIF(total_revenue_usd, 0) * 100) as overall_profit_margin_pct,

    -- Data completeness percentage
    (orders_with_complete_data::float / NULLIF(order_count, 0) * 100) as data_completeness_pct,

    -- Days since first/last order
    EXTRACT(DAY FROM (CURRENT_TIMESTAMP - first_order_date)) as days_since_first_order,
    EXTRACT(DAY FROM (CURRENT_TIMESTAMP - last_order_date)) as days_since_last_order,

    -- Velocity metric (units per day since first order)
    (total_quantity_sold::float / NULLIF(EXTRACT(DAY FROM (CURRENT_TIMESTAMP - first_order_date)), 0)) as units_per_day

FROM product_base
ORDER BY total_revenue_usd DESC;

-- Enhancement 3: Create helper function for quick product search
-- This enables fast search by SKU or product name

CREATE OR REPLACE FUNCTION search_products(search_term TEXT)
RETURNS TABLE (
    sku TEXT,
    product_title TEXT,
    total_quantity_sold BIGINT,
    total_revenue_usd NUMERIC,
    total_profit_usd NUMERIC,
    avg_profit_margin_pct NUMERIC,
    match_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        upa.sku::TEXT,
        upa.product_title::TEXT,
        upa.total_quantity_sold,
        upa.total_revenue_usd,
        upa.total_profit_usd,
        upa.overall_profit_margin_pct,
        CASE
            WHEN LOWER(upa.sku) = LOWER(search_term) THEN 100
            WHEN LOWER(upa.product_title) = LOWER(search_term) THEN 90
            WHEN LOWER(upa.sku) LIKE LOWER(search_term || '%') THEN 80
            WHEN LOWER(upa.product_title) LIKE LOWER(search_term || '%') THEN 70
            WHEN LOWER(upa.sku) LIKE '%' || LOWER(search_term) || '%' THEN 60
            WHEN LOWER(upa.product_title) LIKE '%' || LOWER(search_term) || '%' THEN 50
            ELSE 0
        END as match_score
    FROM unified_product_analysis upa
    WHERE
        LOWER(upa.sku) LIKE '%' || LOWER(search_term) || '%'
        OR LOWER(upa.product_title) LIKE '%' || LOWER(search_term) || '%'
    ORDER BY match_score DESC, upa.total_revenue_usd DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql;

-- Enhancement 4: Create materialized view for faster order analysis
-- This pre-calculates order metrics for better performance

DROP MATERIALIZED VIEW IF EXISTS order_analysis_cache CASCADE;

CREATE MATERIALIZED VIEW order_analysis_cache AS
SELECT
    order_number,
    order_name,
    order_date,
    COUNT(DISTINCT sku) as unique_sku_count,
    SUM(quantity) as total_units,
    SUM(line_total_revenue) as order_revenue,
    SUM(estimated_unit_cost_usd * quantity) as order_cost,
    SUM(total_line_profit_usd) as order_profit,
    AVG(profit_margin_percentage) as avg_margin_pct,
    AVG(cost_confidence_score) as avg_confidence,
    BOOL_AND(has_complete_data) as has_all_costs,
    array_agg(DISTINCT UNNEST(commodity_invoice_files)) FILTER (WHERE commodity_invoice_files IS NOT NULL) as commodity_invoices,
    array_agg(DISTINCT UNNEST(freight_invoice_files)) FILTER (WHERE freight_invoice_files IS NOT NULL) as freight_invoices
FROM item_cost_analysis
WHERE order_number IS NOT NULL
GROUP BY order_number, order_name, order_date;

-- Create indexes on materialized view
CREATE INDEX IF NOT EXISTS idx_order_cache_date
ON order_analysis_cache(order_date DESC);

CREATE INDEX IF NOT EXISTS idx_order_cache_profit
ON order_analysis_cache(order_profit DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_order_cache_revenue
ON order_analysis_cache(order_revenue DESC);

CREATE INDEX IF NOT EXISTS idx_order_cache_order_number
ON order_analysis_cache(order_number);

-- Enhancement 5: Function to refresh the materialized view
-- Call this after uploading new invoices

CREATE OR REPLACE FUNCTION refresh_order_cache()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY order_analysis_cache;
END;
$$ LANGUAGE plpgsql;

-- Enhancement 6: Create a function to get product details with orders
-- This is used by the expandable rows in the unified view

CREATE OR REPLACE FUNCTION get_product_orders(p_sku TEXT)
RETURNS TABLE (
    order_number TEXT,
    order_name TEXT,
    order_date TIMESTAMP WITH TIME ZONE,
    quantity INTEGER,
    line_revenue NUMERIC,
    line_cost NUMERIC,
    line_profit NUMERIC,
    profit_margin NUMERIC,
    confidence_score INTEGER,
    commodity_files TEXT[],
    freight_files TEXT[],
    commodity_ids INTEGER[],
    freight_ids INTEGER[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ica.order_number::TEXT,
        ica.order_name::TEXT,
        ica.order_date,
        ica.quantity,
        ica.line_total_revenue,
        (ica.estimated_unit_cost_usd * ica.quantity) as line_cost,
        ica.total_line_profit_usd,
        ica.profit_margin_percentage,
        ica.cost_confidence_score,
        ica.commodity_invoice_files,
        ica.freight_invoice_files,
        ica.commodity_invoice_ids,
        ica.freight_invoice_ids
    FROM item_cost_analysis ica
    WHERE ica.sku = p_sku
        AND ica.has_complete_data = true
    ORDER BY ica.order_date DESC;
END;
$$ LANGUAGE plpgsql;

-- Enhancement 7: Analytics function for dashboard metrics
-- Get quick summary stats across all products

CREATE OR REPLACE FUNCTION get_product_analytics()
RETURNS TABLE (
    total_products BIGINT,
    total_units_sold NUMERIC,
    total_revenue NUMERIC,
    total_costs NUMERIC,
    total_profit NUMERIC,
    avg_margin NUMERIC,
    products_with_data BIGINT,
    products_missing_data BIGINT,
    top_product_sku TEXT,
    top_product_revenue NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total_products,
        SUM(upa.total_quantity_sold) as total_units_sold,
        SUM(upa.total_revenue_usd) as total_revenue,
        SUM(upa.total_cost_usd) as total_costs,
        SUM(upa.total_profit_usd) as total_profit,
        AVG(upa.overall_profit_margin_pct) as avg_margin,
        COUNT(*) FILTER (WHERE upa.orders_with_complete_data > 0)::BIGINT as products_with_data,
        COUNT(*) FILTER (WHERE upa.orders_with_complete_data = 0)::BIGINT as products_missing_data,
        (SELECT sku FROM unified_product_analysis ORDER BY total_revenue_usd DESC LIMIT 1)::TEXT as top_product_sku,
        (SELECT total_revenue_usd FROM unified_product_analysis ORDER BY total_revenue_usd DESC LIMIT 1) as top_product_revenue
    FROM unified_product_analysis upa;
END;
$$ LANGUAGE plpgsql;

-- Enhancement 8: Cleanup old/incomplete invoice data
-- Run this manually to clean up test data or duplicates

CREATE OR REPLACE FUNCTION cleanup_incomplete_invoices()
RETURNS TABLE (
    deleted_uploads INTEGER,
    deleted_commodity_items INTEGER,
    deleted_freight_items INTEGER
) AS $$
DECLARE
    v_deleted_uploads INTEGER;
    v_deleted_commodity INTEGER;
    v_deleted_freight INTEGER;
BEGIN
    -- Delete commodity items first
    WITH empty_invoices AS (
        SELECT id FROM invoice_uploads
        WHERE (row_count_commodity IS NULL OR row_count_commodity = 0)
          AND (row_count_freight IS NULL OR row_count_freight = 0)
    )
    DELETE FROM invoice_commodity_items
    WHERE upload_id IN (SELECT id FROM empty_invoices);

    GET DIAGNOSTICS v_deleted_commodity = ROW_COUNT;

    -- Delete freight items
    WITH empty_invoices AS (
        SELECT id FROM invoice_uploads
        WHERE (row_count_commodity IS NULL OR row_count_commodity = 0)
          AND (row_count_freight IS NULL OR row_count_freight = 0)
    )
    DELETE FROM invoice_freight_items
    WHERE upload_id IN (SELECT id FROM empty_invoices);

    GET DIAGNOSTICS v_deleted_freight = ROW_COUNT;

    -- Delete the empty upload records
    WITH empty_invoices AS (
        SELECT id FROM invoice_uploads
        WHERE (row_count_commodity IS NULL OR row_count_commodity = 0)
          AND (row_count_freight IS NULL OR row_count_freight = 0)
    )
    DELETE FROM invoice_uploads
    WHERE id IN (SELECT id FROM empty_invoices);

    GET DIAGNOSTICS v_deleted_uploads = ROW_COUNT;

    RETURN QUERY SELECT v_deleted_uploads, v_deleted_commodity, v_deleted_freight;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VERIFICATION QUERIES
-- Run these to verify everything works
-- =====================================================

-- Test 1: Check unified view
SELECT 'Unified View' as test_name, COUNT(*) as product_count FROM unified_product_analysis;

-- Test 2: Check search function
SELECT 'Search Function' as test_name, COUNT(*) as result_count FROM search_products('test');

-- Test 3: Check analytics
SELECT 'Analytics Function' as test_name, * FROM get_product_analytics();

-- Test 4: Check order cache (may take a moment to build)
SELECT 'Order Cache' as test_name, COUNT(*) as cached_orders FROM order_analysis_cache;

-- Test 5: Check indexes were created
SELECT
    'Indexes Created' as test_name,
    COUNT(*) as index_count
FROM pg_indexes
WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%';

-- =====================================================
-- MAINTENANCE COMMANDS
-- Use these periodically for optimal performance
-- =====================================================

-- Refresh materialized view (run after bulk invoice uploads)
-- SELECT refresh_order_cache();

-- Cleanup incomplete invoices (run to remove test data)
-- SELECT * FROM cleanup_incomplete_invoices();

-- Analyze tables for query planner optimization
ANALYZE invoice_uploads;
ANALYZE invoice_commodity_items;
ANALYZE invoice_freight_items;
ANALYZE shopify_orders;
ANALYZE shopify_order_items;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Database enhancements applied successfully!';
    RAISE NOTICE '📊 Created unified_product_analysis view';
    RAISE NOTICE '⚡ Created % indexes on base tables',
        (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%');
    RAISE NOTICE '🔄 Created order_analysis_cache materialized view';
    RAISE NOTICE '🔍 Created helper functions for search and analytics';
    RAISE NOTICE '';
    RAISE NOTICE '▶️  Run verification queries above to test';
    RAISE NOTICE '📖 See IMPLEMENTATION_GUIDE.md for next steps';
END $$;
