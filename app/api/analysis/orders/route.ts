import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orderNumber = searchParams.get('order_number');

    let query = supabase
      .from('order_cost_analysis')
      .select('*')
      .order('order_date', { ascending: false });

    if (orderNumber) {
      query = query.eq('order_number', orderNumber);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching order analysis:', error);
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in order analysis API:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
