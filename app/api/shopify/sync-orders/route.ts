import { NextResponse } from 'next/server';
import { fetchAllOrders } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST() {
  try {
    console.log('Starting Shopify order sync...');
    const orders = await fetchAllOrders();
    console.log(`Fetched ${orders.length} orders from Shopify`);

    const ordersToInsert = orders.map((order: any) => ({
      order_id: order.id,
      order_number: order.name?.replace('#', '') || order.order_number?.toString(),
      order_name: order.name,
      created_at: order.created_at,
      updated_at: order.updated_at,
      total_price: parseFloat(order.total_price || 0),
      subtotal_price: parseFloat(order.subtotal_price || 0),
      total_tax: parseFloat(order.total_tax || 0),
      currency: order.currency,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      customer_email: order.customer?.email,
      customer_name: order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : null,
      raw_data: order,
    }));

    // Insert orders (upsert on conflict)
    const { data: insertedOrders, error: ordersError } = await supabaseAdmin
      .from('shopify_orders')
      .upsert(ordersToInsert, { onConflict: 'order_id' })
      .select();

    if (ordersError) {
      console.error('Error inserting orders:', ordersError);
      throw ordersError;
    }

    console.log(`Inserted/updated ${insertedOrders?.length || 0} orders`);

    // Process line items
    const lineItemsToInsert: any[] = [];
    for (const order of orders) {
      if (order.line_items && order.line_items.length > 0) {
        for (const item of order.line_items) {
          lineItemsToInsert.push({
            line_item_id: item.id,
            order_id: order.id,
            product_id: item.product_id,
            variant_id: item.variant_id,
            title: item.title,
            sku: item.sku,
            quantity: item.quantity,
            price: parseFloat(item.price || 0),
            total_discount: parseFloat(item.total_discount || 0),
            raw_data: item,
          });
        }
      }
    }

    if (lineItemsToInsert.length > 0) {
      const { data: insertedItems, error: itemsError } = await supabaseAdmin
        .from('shopify_order_items')
        .upsert(lineItemsToInsert, { onConflict: 'line_item_id' })
        .select();

      if (itemsError) {
        console.error('Error inserting line items:', itemsError);
        throw itemsError;
      }

      console.log(`Inserted/updated ${insertedItems?.length || 0} line items`);
    }

    return NextResponse.json({
      success: true,
      ordersCount: insertedOrders?.length || 0,
      lineItemsCount: lineItemsToInsert.length,
    });
  } catch (error: any) {
    console.error('Error syncing orders:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
