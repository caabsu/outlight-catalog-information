import { NextResponse } from 'next/server';
import { fetchAllOrders } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';

// Increase timeout for this route (10 minutes)
export const maxDuration = 600;

/**
 * Insert data in batches to avoid timeout
 */
async function insertInBatches(tableName: string, data: any[], batchSize: number, conflictColumn: string) {
  let totalInserted = 0;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(data.length / batchSize);

    console.log(`Inserting ${tableName} batch ${batchNumber}/${totalBatches} (${batch.length} items)`);

    const { error } = await supabaseAdmin
      .from(tableName)
      .upsert(batch, { onConflict: conflictColumn });

    if (error) {
      console.error(`Error inserting ${tableName} batch ${batchNumber}:`, error);
      throw error;
    }

    totalInserted += batch.length;
    console.log(`${tableName}: ${totalInserted}/${data.length} completed`);
  }

  return totalInserted;
}

export async function POST() {
  try {
    console.log('Starting Shopify order sync...');
    const orders = await fetchAllOrders();
    console.log(`Fetched ${orders.length} orders from Shopify`);

    // Prepare orders data
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

    // Insert orders in batches of 100
    console.log(`Inserting ${ordersToInsert.length} orders in batches...`);
    const ordersInserted = await insertInBatches('shopify_orders', ordersToInsert, 100, 'order_id');
    console.log(`✓ Completed inserting ${ordersInserted} orders`);

    // Prepare line items data
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

    // Insert line items in batches of 500
    let lineItemsInserted = 0;
    if (lineItemsToInsert.length > 0) {
      console.log(`Inserting ${lineItemsToInsert.length} line items in batches...`);
      lineItemsInserted = await insertInBatches('shopify_order_items', lineItemsToInsert, 500, 'line_item_id');
      console.log(`✓ Completed inserting ${lineItemsInserted} line items`);
    }

    console.log('✓ Shopify sync completed successfully!');

    return NextResponse.json({
      success: true,
      ordersCount: ordersInserted,
      lineItemsCount: lineItemsInserted,
    });
  } catch (error: any) {
    console.error('Error syncing orders:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
