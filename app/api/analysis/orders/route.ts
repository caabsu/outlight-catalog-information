import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orderNumber = searchParams.get('order_number');

    let query = supabase
      .from('order_cost_analysis')
      .select('*', { count: 'exact' })
      .order('order_date', { ascending: false });

    if (orderNumber) {
      query = query.eq('order_number', orderNumber);
    } else {
      // Fetch ALL orders - no limit
      // Supabase defaults to 1000 rows, we need to override that
      query = query.range(0, 999999);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching order analysis:', error);
      throw error;
    }

    console.log(`Fetched ${data?.length || 0} orders from database (total: ${count})`);

    return NextResponse.json({ success: true, data, count });
  } catch (error: any) {
    console.error('Error in order analysis API:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
