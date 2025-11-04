import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id;

    // Get invoice details
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoice_uploads')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Get commodity items with order numbers
    const { data: commodityItems, error: commodityError } = await supabaseAdmin
      .from('invoice_commodity_items')
      .select('*')
      .eq('upload_id', invoiceId);

    if (commodityError) {
      console.error('Error fetching commodity items:', commodityError);
    }

    // Get freight items with order numbers
    const { data: freightItems, error: freightError } = await supabaseAdmin
      .from('invoice_freight_items')
      .select('*')
      .eq('upload_id', invoiceId);

    if (freightError) {
      console.error('Error fetching freight items:', freightError);
    }

    // Get unique order numbers affected
    const orderNumbers = new Set<string>();
    commodityItems?.forEach(item => {
      if (item.order_number) orderNumbers.add(item.order_number);
    });
    freightItems?.forEach(item => {
      if (item.order_number) orderNumbers.add(item.order_number);
    });

    // Get unique SKUs affected
    const skus = new Set<string>();
    commodityItems?.forEach(item => {
      if (item.sku) skus.add(item.sku);
    });

    // Get order details for affected orders
    const ordersWithDetails = [];
    if (orderNumbers.size > 0) {
      const { data: orders } = await supabaseAdmin
        .from('shopify_orders')
        .select('order_number, order_name, created_at, total_price')
        .in('order_number', Array.from(orderNumbers));

      ordersWithDetails.push(...(orders || []));
    }

    // Get product details for affected SKUs
    const productsWithDetails = [];
    if (skus.size > 0) {
      const { data: products } = await supabaseAdmin
        .from('shopify_products')
        .select('id, title')
        .in('id', Array.from(skus));

      productsWithDetails.push(...(products || []));
    }

    // Calculate total costs
    const totalCommodityCost = commodityItems?.reduce((sum, item) => sum + (item.total_usd || 0), 0) || 0;
    const totalFreightCost = freightItems?.reduce((sum, item) =>
      sum + (item.international_shipping_usd || 0) + (item.service_fee_usd || 0), 0) || 0;

    return NextResponse.json({
      success: true,
      data: {
        invoice,
        commodityItems: commodityItems || [],
        freightItems: freightItems || [],
        affectedOrders: ordersWithDetails,
        affectedProducts: productsWithDetails,
        summary: {
          totalOrders: orderNumbers.size,
          totalProducts: skus.size,
          totalCommodityCost,
          totalFreightCost,
          totalCost: totalCommodityCost + totalFreightCost,
        }
      }
    });
  } catch (error: any) {
    console.error('Error fetching invoice details:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
