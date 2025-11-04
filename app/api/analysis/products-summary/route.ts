import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    console.log('Fetching product profitability summary...');

    // Fetch all products in chunks (Supabase has a 1000 row limit per request)
    const allProducts: any[] = [];
    const CHUNK_SIZE = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseAdmin
        .from('product_profitability_summary')
        .select('*')
        .order('total_revenue_usd', { ascending: false })
        .range(offset, offset + CHUNK_SIZE - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allProducts.push(...data);
        console.log(`Fetched chunk: ${offset}-${offset + data.length}, Total so far: ${allProducts.length}`);
        offset += CHUNK_SIZE;
        hasMore = data.length === CHUNK_SIZE;
      } else {
        hasMore = false;
      }
    }

    console.log(`✓ Fetched all ${allProducts.length} products from view`);

    return NextResponse.json({
      success: true,
      data: allProducts,
      count: allProducts.length
    });
  } catch (error: any) {
    console.error('Error in product summary API:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
