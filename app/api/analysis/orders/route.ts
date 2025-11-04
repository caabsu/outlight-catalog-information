import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orderNumber = searchParams.get('order_number');

    let query = supabaseAdmin
      .from('order_cost_analysis')
      .select('*', { count: 'exact' })
      .order('order_date', { ascending: false });

    if (orderNumber) {
      query = query.eq('order_number', orderNumber);
    } else {
      // Explicitly set a very high limit to fetch all orders
      query = query.limit(100000);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching order analysis:', error);
      throw error;
    }

    console.log(`Query returned ${data?.length || 0} orders from view (count header: ${count})`);

    // Also check the base table count for debugging
    const { count: baseTableCount } = await supabaseAdmin
      .from('shopify_orders')
      .select('*', { count: 'exact', head: true });

    console.log(`Base table shopify_orders has ${baseTableCount} total records`);
    console.log(`View order_cost_analysis returned ${data?.length || 0} records (count: ${count})`);

    return NextResponse.json({
      success: true,
      data,
      count,
      debug: {
        baseTableCount,
        viewReturnedRows: data?.length,
        viewCount: count
      }
    });
  } catch (error: any) {
    console.error('Error in order analysis API:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
