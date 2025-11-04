import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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
    const { data: orderData, error: orderError } = await supabase
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
    const { data: lineItems, error: lineItemsError } = await supabase
      .from('shopify_order_items')
      .select('*')
      .eq('order_id', orderData.order_id);

    if (lineItemsError) {
      console.error('Error fetching line items:', lineItemsError);
    }

    // Fetch commodity items
    const { data: commodityItems, error: commodityError } = await supabase
      .from('invoice_commodity_items')
      .select('*')
      .eq('order_number', orderNumber);

    if (commodityError) {
      console.error('Error fetching commodity items:', commodityError);
    }

    // Fetch freight items
    const { data: freightItems, error: freightError } = await supabase
      .from('invoice_freight_items')
      .select('*')
      .eq('order_number', orderNumber);

    if (freightError) {
      console.error('Error fetching freight items:', freightError);
    }

    return NextResponse.json({
      success: true,
      data: {
        order: orderData,
        lineItems: lineItems || [],
        commodityItems: commodityItems || [],
        freightItems: freightItems || [],
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
