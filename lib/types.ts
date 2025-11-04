// Shopify Types
export interface ShopifyOrder {
  id: number;
  order_id: number;
  order_number: string;
  order_name: string;
  created_at: string;
  updated_at: string;
  total_price: number;
  subtotal_price: number;
  total_tax: number;
  currency: string;
  financial_status: string;
  fulfillment_status: string;
  customer_email?: string;
  customer_name?: string;
  raw_data: any;
  synced_at: string;
}

export interface ShopifyProduct {
  id: number;
  product_id: number;
  title: string;
  vendor?: string;
  product_type?: string;
  created_at: string;
  updated_at: string;
  raw_data: any;
  synced_at: string;
}

export interface ShopifyVariant {
  id: number;
  variant_id: number;
  product_id: number;
  title: string;
  sku?: string;
  price: number;
  inventory_quantity: number;
  raw_data: any;
  synced_at: string;
}

export interface ShopifyOrderItem {
  id: number;
  line_item_id: number;
  order_id: number;
  product_id?: number;
  variant_id?: number;
  title: string;
  sku?: string;
  quantity: number;
  price: number;
  total_discount: number;
  raw_data: any;
  synced_at: string;
}

// Invoice Types
export interface InvoiceUpload {
  id: number;
  filename: string;
  upload_date: string;
  processed: boolean;
  row_count_commodity?: number;
  row_count_freight?: number;
  notes?: string;
}

export interface CommodityItem {
  id?: number;
  upload_id: number;
  time: string | Date;
  order_number: string;
  sku?: string;
  price_cny: number;
  price_usd: number;
  domestic_freight_cny: number;
  domestic_freight_usd: number;
  total_cny: number;
  total_usd: number;
  created_at?: string;
}

export interface FreightItem {
  id?: number;
  upload_id: number;
  time: string | Date;
  order_number: string;
  weight?: number;
  international_shipping_cny: number;
  international_shipping_usd: number;
  service_fee_usd: number;
  created_at?: string;
}

// Analysis Types
export interface OrderCostAnalysis {
  order_number: string;
  order_name?: string;
  order_date: string;
  shopify_total_usd: number;
  shopify_currency: string;
  commodity_total_usd: number;
  commodity_total_cny: number;
  unit_price_usd: number;
  domestic_freight_usd: number;
  international_shipping_usd: number;
  service_fee_usd: number;
  total_fulfillment_cost_usd: number;
  profit_usd: number;
  profit_percentage: number;
  item_count: number;
}

export interface ProductCostAnalysis {
  sku: string;
  product_title: string;
  order_count: number;
  total_quantity_sold: number;
  avg_listed_price_usd: number;  // Price before discounts
  avg_selling_price_usd: number;  // Actual customer payment after discounts
  total_revenue_usd: number;  // Total revenue from this product
  avg_unit_cost_usd: number;
  avg_unit_cost_cny: number;
  avg_profit_per_unit_usd: number;
}

// Item-Level Analysis Types
export interface ItemCostAnalysis {
  line_item_id: number;
  order_number: string;
  order_name: string;
  order_date: string;
  sku: string;
  product_title: string;
  quantity: number;
  unit_price_shopify: number;
  actual_unit_price_usd: number;
  line_total_revenue: number;
  total_discount: number;

  // Cost breakdown (all-inclusive)
  avg_unit_cost_with_all_fees?: number;
  avg_commodity_price_usd?: number;
  avg_domestic_freight_usd?: number;
  avg_intl_shipping_per_unit_usd?: number;
  avg_service_fee_per_unit_usd?: number;

  // Data quality
  times_seen_in_clean_invoices?: number;
  clean_order_count?: number;
  total_units_analyzed?: number;
  cost_variance?: number;
  min_unit_cost_usd?: number;
  max_unit_cost_usd?: number;

  // Best estimate
  estimated_unit_cost_usd?: number;
  cost_confidence_score: number;
  cost_data_source: string;

  // Profitability
  profit_per_unit_usd?: number;
  total_line_profit_usd?: number;
  profit_margin_percentage?: number;
}

export interface SKUProfitabilitySummary {
  sku: string;
  product_title: string;
  times_ordered: number;
  total_units_sold: number;

  // Revenue metrics
  avg_selling_price_usd: number;
  total_revenue_usd: number;

  // Cost metrics (all-inclusive)
  avg_estimated_cost_usd: number;
  avg_commodity_price_usd?: number;
  avg_domestic_freight_usd?: number;
  avg_intl_shipping_per_unit_usd?: number;
  avg_service_fee_per_unit_usd?: number;
  total_estimated_cost_usd: number;
  avg_confidence_score: number;

  // Profitability
  avg_profit_per_unit_usd: number;
  total_profit_usd: number;
  avg_profit_margin_pct: number;

  // Data quality
  avg_clean_invoice_count: number;
  avg_clean_order_count: number;
  total_units_in_invoice_data: number;
  instances_with_clean_data: number;
  instances_no_data: number;
  avg_cost_variance?: number;

  // Price ranges
  min_selling_price_usd: number;
  max_selling_price_usd: number;
  min_cost_usd: number;
  max_cost_usd: number;
}

export interface ProductProfitabilitySummary {
  product_title: string;
  unique_sku_count: number;
  skus: string[];
  times_ordered: number;
  total_units_sold: number;

  // Revenue metrics
  avg_selling_price_usd: number;
  total_revenue_usd: number;

  // Cost metrics
  avg_estimated_cost_usd: number;
  total_estimated_cost_usd: number;
  avg_confidence_score: number;

  // Profitability
  avg_profit_per_unit_usd: number;
  total_profit_usd: number;
  overall_profit_margin_pct: number;

  // Data quality
  avg_clean_invoice_count: number;
  instances_with_clean_data: number;
  instances_no_data: number;
}

// XLS Parsing Types
export interface CommodityRowRaw {
  Time?: any;
  'Order ID'?: any;
  SKU?: any;
  Price?: any;
  'Domestic Freight'?: any;
  Total?: any;
}

export interface FreightRowRaw {
  Time?: any;
  'Order ID'?: any;
  Weight?: any;
  'International Shipping'?: any;
  'Service Fee'?: any;
}

export interface ParsedInvoiceData {
  commodityItems: CommodityItem[];
  freightItems: FreightItem[];
}
