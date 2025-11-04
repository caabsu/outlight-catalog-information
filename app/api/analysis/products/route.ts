import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sku = searchParams.get('sku');

    let query = supabase
      .from('product_cost_analysis')
      .select('*', { count: 'exact' })
      .order('total_quantity_sold', { ascending: false });

    if (sku) {
      query = query.eq('sku', sku);
    } else {
      // Fetch ALL products - no limit
      query = query.range(0, 999999);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching product analysis:', error);
      throw error;
    }

    console.log(`Fetched ${data?.length || 0} products from database (total: ${count})`);

    return NextResponse.json({ success: true, data, count });
  } catch (error: any) {
    console.error('Error in product analysis API:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
