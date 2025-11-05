import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orderNumber = searchParams.get('order_number');

    if (!orderNumber) {
      return NextResponse.json(
        { success: false, error: 'Order number is required' },
        { status: 400 }
      );
    }

    // Fetch order details
    const { data: orderData, error: orderError } = await supabaseAdmin
      .from('shopify_orders')
      .select('*')
      .eq('order_number', orderNumber)
      .single();

    if (orderError || !orderData) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      );
    }

    // Fetch line items
    const { data: lineItems, error: lineItemsError } = await supabaseAdmin
      .from('shopify_order_items')
      .select('*')
      .eq('order_id', orderData.order_id);

    if (lineItemsError) {
      console.error('Error fetching line items:', lineItemsError);
    }

    // Fetch commodity items - try both with and without # prefix
    let commodityItems: any[] = [];
    const { data: commodityData1, error: commodityError1 } = await supabaseAdmin
      .from('invoice_commodity_items')
      .select('*')
      .eq('order_number', orderNumber);

    const { data: commodityData2, error: commodityError2 } = await supabaseAdmin
      .from('invoice_commodity_items')
      .select('*')
      .eq('order_number', `#${orderNumber}`);

    commodityItems = [...(commodityData1 || []), ...(commodityData2 || [])];

    if (commodityError1 && commodityError2) {
      console.error('Error fetching commodity items:', commodityError1 || commodityError2);
    }

    // Fetch freight items - try both with and without # prefix
    let freightItems: any[] = [];
    const { data: freightData1, error: freightError1 } = await supabaseAdmin
      .from('invoice_freight_items')
      .select('*')
      .eq('order_number', orderNumber);

    const { data: freightData2, error: freightError2 } = await supabaseAdmin
      .from('invoice_freight_items')
      .select('*')
      .eq('order_number', `#${orderNumber}`);

    freightItems = [...(freightData1 || []), ...(freightData2 || [])];

    if (freightError1 && freightError2) {
      console.error('Error fetching freight items:', freightError1 || freightError2);
    }

    // Fetch invoice upload metadata and attach to items
    const uploadIds = [
      ...commodityItems.map((c: any) => c.upload_id),
      ...freightItems.map((f: any) => f.upload_id)
    ].filter((id, index, self) => id && self.indexOf(id) === index);

    let invoiceUploadsMap = new Map();
    if (uploadIds.length > 0) {
      const { data: uploadData } = await supabaseAdmin
        .from('invoice_uploads')
        .select('*')
        .in('id', uploadIds);

      (uploadData || []).forEach((upload: any) => {
        invoiceUploadsMap.set(upload.id, upload);
      });
    }

    // Attach upload metadata to each invoice item
    const commodityItemsWithFile = commodityItems.map((c: any) => ({
      ...c,
      upload_filename: invoiceUploadsMap.get(c.upload_id)?.filename || null,
      upload_date: invoiceUploadsMap.get(c.upload_id)?.upload_date || null,
    }));

    const freightItemsWithFile = freightItems.map((f: any) => ({
      ...f,
      upload_filename: invoiceUploadsMap.get(f.upload_id)?.filename || null,
      upload_date: invoiceUploadsMap.get(f.upload_id)?.upload_date || null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        order: orderData,
        lineItems: lineItems || [],
        commodityItems: commodityItemsWithFile || [],
        freightItems: freightItemsWithFile || [],
      },
    });
  } catch (error: any) {
    console.error('Error in order details API:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
