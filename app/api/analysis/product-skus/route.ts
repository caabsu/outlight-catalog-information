import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const productTitle = searchParams.get('product_title');

    if (!productTitle) {
      return NextResponse.json(
        { success: false, error: 'product_title is required' },
        { status: 400 }
      );
    }

    console.log(`Fetching SKUs for product: ${productTitle}`);

    const { data, error } = await supabaseAdmin
      .from('sku_profitability_summary')
      .select('*')
      .eq('product_title', productTitle)
      .order('total_revenue_usd', { ascending: false });

    if (error) throw error;

    console.log(`✓ Fetched ${data?.length || 0} SKUs for product: ${productTitle}`);

    return NextResponse.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    });
  } catch (error: any) {
    console.error('Error in product SKUs API:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
