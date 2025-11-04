import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    // Count shopify_orders
    const { count: ordersCount, error: ordersError } = await supabaseAdmin
      .from('shopify_orders')
      .select('*', { count: 'exact', head: true });

    // Count order_cost_analysis view
    const { count: viewCount, error: viewError } = await supabaseAdmin
      .from('order_cost_analysis')
      .select('*', { count: 'exact', head: true });

    // Count shopify_products
    const { count: productsCount, error: productsError } = await supabaseAdmin
      .from('shopify_products')
      .select('*', { count: 'exact', head: true });

    // Count product_cost_analysis view
    const { count: productViewCount, error: productViewError } = await supabaseAdmin
      .from('product_cost_analysis')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      success: true,
      counts: {
        shopify_orders_table: ordersCount,
        order_cost_analysis_view: viewCount,
        shopify_products_table: productsCount,
        product_cost_analysis_view: productViewCount,
      },
      errors: {
        ordersError,
        viewError,
        productsError,
        productViewError,
      }
    });
  } catch (error: any) {
    console.error('Error fetching counts:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
