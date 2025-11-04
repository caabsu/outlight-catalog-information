import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orderNumber = searchParams.get('order_number');

    // Single order lookup
    if (orderNumber) {
      const { data, error } = await supabaseAdmin
        .from('order_cost_analysis')
        .select('*')
        .eq('order_number', orderNumber);

      if (error) throw error;
      return NextResponse.json({ success: true, data, count: data?.length || 0 });
    }

    // Fetch all orders in chunks (Supabase has a 1000 row limit per request)
    console.log('Fetching all orders in paginated chunks...');
    const allOrders: any[] = [];
    const CHUNK_SIZE = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error, count } = await supabaseAdmin
        .from('order_cost_analysis')
        .select('*', { count: 'exact' })
        .order('order_date', { ascending: false })
        .range(offset, offset + CHUNK_SIZE - 1);

      if (error) {
        console.error('Error fetching order chunk:', error);
        throw error;
      }

      if (data && data.length > 0) {
        allOrders.push(...data);
        console.log(`Fetched chunk: ${offset}-${offset + data.length}, Total so far: ${allOrders.length}`);
        offset += CHUNK_SIZE;
        hasMore = data.length === CHUNK_SIZE;
      } else {
        hasMore = false;
      }
    }

    console.log(`✓ Fetched all ${allOrders.length} orders from view`);

    return NextResponse.json({
      success: true,
      data: allOrders,
      count: allOrders.length
    });
  } catch (error: any) {
    console.error('Error in order analysis API:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
