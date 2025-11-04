import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sku = searchParams.get('sku');

    let query = supabase
      .from('product_cost_analysis')
      .select('*')
      .order('total_quantity_sold', { ascending: false });

    if (sku) {
      query = query.eq('sku', sku);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching product analysis:', error);
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in product analysis API:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
