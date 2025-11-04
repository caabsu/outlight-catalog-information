-- Catalog Information Database Schema
-- This schema supports order cost analysis by integrating Shopify data with invoice XLS files

-- Table to store Shopify orders
CREATE TABLE IF NOT EXISTS shopify_orders (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT UNIQUE NOT NULL,
    order_number TEXT NOT NULL,
    order_name TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    total_price DECIMAL(10, 2),
    subtotal_price DECIMAL(10, 2),
    total_tax DECIMAL(10, 2),
    currency TEXT,
    financial_status TEXT,
    fulfillment_status TEXT,
    customer_email TEXT,
    customer_name TEXT,
    raw_data JSONB,
    synced_at TIMESTAMP DEFAULT NOW()
);

-- Table to store Shopify products
CREATE TABLE IF NOT EXISTS shopify_products (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT UNIQUE NOT NULL,
    title TEXT,
    vendor TEXT,
    product_type TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    raw_data JSONB,
    synced_at TIMESTAMP DEFAULT NOW()
);

-- Table to store Shopify product variants
CREATE TABLE IF NOT EXISTS shopify_variants (
    id BIGSERIAL PRIMARY KEY,
    variant_id BIGINT UNIQUE NOT NULL,
    product_id BIGINT REFERENCES shopify_products(product_id),
    title TEXT,
    sku TEXT,
    price DECIMAL(10, 2),
    inventory_quantity INTEGER,
    raw_data JSONB,
    synced_at TIMESTAMP DEFAULT NOW()
);

-- Table to store Shopify order line items
CREATE TABLE IF NOT EXISTS shopify_order_items (
    id BIGSERIAL PRIMARY KEY,
    line_item_id BIGINT UNIQUE NOT NULL,
    order_id BIGINT REFERENCES shopify_orders(order_id),
    product_id BIGINT,
    variant_id BIGINT,
    title TEXT,
    sku TEXT,
    quantity INTEGER,
    price DECIMAL(10, 2),
    total_discount DECIMAL(10, 2),
    raw_data JSONB,
    synced_at TIMESTAMP DEFAULT NOW()
);

-- Table to track uploaded invoice files
CREATE TABLE IF NOT EXISTS invoice_uploads (
    id BIGSERIAL PRIMARY KEY,
    filename TEXT NOT NULL,
    upload_date TIMESTAMP DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,
    row_count_commodity INTEGER,
    row_count_freight INTEGER,
    notes TEXT
);

-- Table to store data from "commodity" tab of XLS files
CREATE TABLE IF NOT EXISTS invoice_commodity_items (
    id BIGSERIAL PRIMARY KEY,
    upload_id BIGINT REFERENCES invoice_uploads(id) ON DELETE CASCADE,
    time TIMESTAMP,
    order_number TEXT NOT NULL,
    sku TEXT,
    price_cny DECIMAL(10, 2),
    price_usd DECIMAL(10, 2),
    domestic_freight_cny DECIMAL(10, 2),
    domestic_freight_usd DECIMAL(10, 2),
    total_cny DECIMAL(10, 2),
    total_usd DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Table to store data from "freight" tab of XLS files
CREATE TABLE IF NOT EXISTS invoice_freight_items (
    id BIGSERIAL PRIMARY KEY,
    upload_id BIGINT REFERENCES invoice_uploads(id) ON DELETE CASCADE,
    time TIMESTAMP,
    order_number TEXT NOT NULL,
    weight DECIMAL(10, 2),
    international_shipping_cny DECIMAL(10, 2),
    international_shipping_usd DECIMAL(10, 2),
    service_fee_usd DECIMAL(10, 2) DEFAULT 15.00,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_shopify_orders_order_number ON shopify_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_created_at ON shopify_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_shopify_order_items_order_id ON shopify_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_shopify_order_items_sku ON shopify_order_items(sku);
CREATE INDEX IF NOT EXISTS idx_invoice_commodity_order_number ON invoice_commodity_items(order_number);
CREATE INDEX IF NOT EXISTS idx_invoice_freight_order_number ON invoice_freight_items(order_number);
CREATE INDEX IF NOT EXISTS idx_invoice_commodity_upload_id ON invoice_commodity_items(upload_id);
CREATE INDEX IF NOT EXISTS idx_invoice_freight_upload_id ON invoice_freight_items(upload_id);

-- Create a view for easy cost analysis by order
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

-- Create a view for product-level cost analysis
CREATE OR REPLACE VIEW product_cost_analysis AS
SELECT
    soi.sku,
    soi.title as product_title,
    COUNT(DISTINCT soi.order_id) as order_count,
    SUM(soi.quantity) as total_quantity_sold,

    -- Average selling price
    AVG(soi.price) as avg_selling_price_usd,

    -- Average unit cost from invoices
    AVG(ic.price_usd) as avg_unit_cost_usd,
    AVG(ic.price_cny) as avg_unit_cost_cny,

    -- Average profit per unit
    AVG(soi.price) - AVG(ic.price_usd) as avg_profit_per_unit_usd

FROM shopify_order_items soi
LEFT JOIN shopify_orders so ON soi.order_id = so.order_id
LEFT JOIN invoice_commodity_items ic ON so.order_number = ic.order_number AND soi.sku = ic.sku
WHERE soi.sku IS NOT NULL AND soi.sku != ''
GROUP BY soi.sku, soi.title;
