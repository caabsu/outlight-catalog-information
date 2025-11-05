import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sku = searchParams.get('sku');

    if (!sku) {
      return NextResponse.json(
        { success: false, error: 'SKU is required' },
        { status: 400 }
      );
    }

    // Fetch all orders containing this SKU
    const { data: orderItems, error: orderItemsError } = await supabaseAdmin
      .from('shopify_order_items')
      .select(`
        *,
        shopify_orders!inner(*)
      `)
      .eq('sku', sku)
      .order('shopify_orders(created_at)', { ascending: false });

    if (orderItemsError) {
      console.error('Error fetching order items:', orderItemsError);
      return NextResponse.json(
        { success: false, error: orderItemsError.message },
        { status: 500 }
      );
    }

    // For each order, fetch invoice data
    const ordersWithInvoices = await Promise.all(
      (orderItems || []).map(async (item: any) => {
        const orderNumber = item.shopify_orders.order_number;

        // Fetch commodity items (try both with and without # prefix)
        const { data: commodityData1 } = await supabaseAdmin
          .from('invoice_commodity_items')
          .select('*')
          .eq('order_number', orderNumber);

        const { data: commodityData2 } = await supabaseAdmin
          .from('invoice_commodity_items')
          .select('*')
          .eq('order_number', `#${orderNumber}`);

        const commodityItems = [...(commodityData1 || []), ...(commodityData2 || [])];

        // Fetch freight items (try both with and without # prefix)
        const { data: freightData1 } = await supabaseAdmin
          .from('invoice_freight_items')
          .select('*')
          .eq('order_number', orderNumber);

        const { data: freightData2 } = await supabaseAdmin
          .from('invoice_freight_items')
          .select('*')
          .eq('order_number', `#${orderNumber}`);

        const freightItems = [...(freightData1 || []), ...(freightData2 || [])];

        // Fetch invoice upload metadata
        const uploadIds = [
          ...commodityItems.map((c: any) => c.upload_id),
          ...freightItems.map((f: any) => f.upload_id)
        ].filter((id, index, self) => id && self.indexOf(id) === index);

        let invoiceUploads: any[] = [];
        if (uploadIds.length > 0) {
          const { data: uploadData } = await supabaseAdmin
            .from('invoice_uploads')
            .select('*')
            .in('id', uploadIds);

          invoiceUploads = uploadData || [];
        }

        return {
          orderItem: item,
          order: item.shopify_orders,
          commodityItems,
          freightItems,
          invoiceUploads,
          hasInvoiceData: commodityItems.length > 0 || freightItems.length > 0,
        };
      })
    );

    // Calculate summary statistics
    const totalOrders = ordersWithInvoices.length;
    const ordersWithInvoices = ordersWithInvoices.filter(o => o.hasInvoiceData).length;
    const totalRevenue = ordersWithInvoices.reduce(
      (sum, o) => sum + ((o.orderItem.price * o.orderItem.quantity) - o.orderItem.total_discount),
      0
    );
    const totalCommodityCost = ordersWithInvoices.reduce(
      (sum, o) => sum + o.commodityItems.reduce((s: number, c: any) => s + (c.total_usd || 0), 0),
      0
    );
    const totalFreightCost = ordersWithInvoices.reduce(
      (sum, o) => sum + o.freightItems.reduce((s: number, f: any) => s + (f.international_shipping_usd || 0) + (f.service_fee_usd || 0), 0),
      0
    );

    return NextResponse.json({
      success: true,
      data: {
        sku,
        orders: ordersWithInvoices,
        summary: {
          totalOrders,
          ordersWithInvoices,
          ordersWithoutInvoices: totalOrders - ordersWithInvoices,
          totalRevenue,
          totalCommodityCost,
          totalFreightCost,
          totalCost: totalCommodityCost + totalFreightCost,
          totalProfit: totalRevenue - (totalCommodityCost + totalFreightCost),
          avgMargin: totalRevenue > 0 ? ((totalRevenue - (totalCommodityCost + totalFreightCost)) / totalRevenue * 100) : 0,
        },
      },
    });
  } catch (error: any) {
    console.error('Error in product details API:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
