-- =====================================================
-- DEBUG SKU COUNTING ISSUES
-- Investigate why multi-SKU orders appear and item counts wrong
-- =====================================================

-- Check for free gift items (price = 0)
SELECT
    so.order_number,
    so.order_name,
    soi.sku,
    soi.title,
    soi.quantity,
    soi.price,
    soi.total_discount,
    (soi.price * soi.quantity) - soi.total_discount as line_total,
    CASE
        WHEN soi.price = 0 THEN 'FREE GIFT'
        WHEN (soi.price * soi.quantity) - soi.total_discount = 0 THEN 'FREE (DISCOUNTED)'
        ELSE 'PAID ITEM'
    END as item_type
FROM shopify_orders so
JOIN shopify_order_items soi ON so.order_id = soi.order_id
WHERE soi.sku IS NOT NULL AND soi.sku != ''
ORDER BY so.order_number, item_type DESC
LIMIT 50;

-- Count orders by SKU types
SELECT
    order_number,
    COUNT(*) as total_items,
    COUNT(*) FILTER (WHERE price > 0) as paid_items,
    COUNT(*) FILTER (WHERE price = 0) as free_items,
    COUNT(DISTINCT sku) as total_unique_skus,
    COUNT(DISTINCT sku) FILTER (WHERE price > 0) as paid_unique_skus,
    string_agg(DISTINCT sku || ' ($' || price::text || ')', ', ') as all_skus
FROM shopify_order_items
WHERE sku IS NOT NULL AND sku != ''
GROUP BY order_number
HAVING COUNT(*) > 1  -- Multi-item orders
ORDER BY total_items DESC
LIMIT 20;

-- Check current order_cost_analysis item_count
SELECT
    order_number,
    order_name,
    item_count,
    total_fulfillment_cost_usd,
    profit_usd
FROM order_cost_analysis
ORDER BY order_date DESC
LIMIT 20;

-- Check what's in single_sku_orders logic
SELECT
    REPLACE(so.order_number, '#', '') as order_number,
    COUNT(DISTINCT soi.id) as total_line_items,
    COUNT(DISTINCT soi.sku) as unique_skus_all,
    COUNT(DISTINCT soi.sku) FILTER (WHERE soi.price > 0) as unique_skus_paid,
    COUNT(*) FILTER (WHERE soi.price = 0) as free_items,
    string_agg(DISTINCT soi.sku || '($' || soi.price::text || ')', ', ' ORDER BY soi.sku) as sku_details
FROM shopify_orders so
LEFT JOIN shopify_order_items soi ON so.order_id = soi.order_id
WHERE soi.sku IS NOT NULL AND soi.sku != ''
GROUP BY so.order_number
HAVING COUNT(DISTINCT soi.sku) = 1  -- Current "single SKU" logic
LIMIT 30;

-- Compare: what SHOULD be single-SKU (excluding free gifts)
SELECT
    REPLACE(so.order_number, '#', '') as order_number,
    COUNT(DISTINCT soi.id) as total_line_items,
    COUNT(DISTINCT soi.sku) FILTER (WHERE soi.price > 0) as unique_paid_skus,
    COUNT(*) FILTER (WHERE soi.price = 0) as free_gift_count,
    string_agg(DISTINCT
        CASE
            WHEN soi.price > 0 THEN soi.sku || '($' || soi.price::text || ')'
            ELSE soi.sku || '(FREE)'
        END,
        ', ' ORDER BY soi.price DESC) as sku_details
FROM shopify_orders so
LEFT JOIN shopify_order_items soi ON so.order_id = soi.order_id
WHERE soi.sku IS NOT NULL AND soi.sku != ''
GROUP BY so.order_number
HAVING COUNT(DISTINCT soi.sku) FILTER (WHERE soi.price > 0) = 1  -- Single PAID SKU
ORDER BY free_gift_count DESC
LIMIT 30;

-- Check service fee values
SELECT
    order_number,
    service_fee_usd,
    international_shipping_usd,
    international_shipping_cny,
    CASE
        WHEN service_fee_usd > 50 THEN 'LIKELY CNY (NEEDS FIX)'
        WHEN service_fee_usd BETWEEN 10 AND 50 THEN 'SUSPICIOUS'
        ELSE 'OK'
    END as service_fee_status
FROM invoice_freight_items
ORDER BY service_fee_usd DESC
LIMIT 20;
