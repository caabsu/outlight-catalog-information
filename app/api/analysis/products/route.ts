import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sku = searchParams.get('sku');

    // Single product lookup
    if (sku) {
      const { data, error } = await supabaseAdmin
        .from('product_cost_analysis')
        .select('*')
        .eq('sku', sku);

      if (error) throw error;
      return NextResponse.json({ success: true, data, count: data?.length || 0 });
    }

    // Fetch all products in chunks (Supabase has a 1000 row limit per request)
    console.log('Fetching all products in paginated chunks...');
    const allProducts: any[] = [];
    const CHUNK_SIZE = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseAdmin
        .from('product_cost_analysis')
        .select('*')
        .order('total_quantity_sold', { ascending: false })
        .range(offset, offset + CHUNK_SIZE - 1);

      if (error) {
        console.error('Error fetching product chunk:', error);
        throw error;
      }

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
    console.error('Error in product analysis API:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
