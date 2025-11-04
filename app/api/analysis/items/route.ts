import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sku = searchParams.get('sku');

    // Single SKU lookup
    if (sku) {
      // Get all instances of this SKU across orders
      const { data, error } = await supabaseAdmin
        .from('item_cost_analysis')
        .select('*')
        .eq('sku', sku)
        .order('order_date', { ascending: false });

      if (error) throw error;

      // Get summary for this SKU
      const { data: summary } = await supabaseAdmin
        .from('sku_profitability_summary')
        .select('*')
        .eq('sku', sku)
        .single();

      return NextResponse.json({
        success: true,
        data: {
          items: data || [],
          summary: summary || null
        }
      });
    }

    // Fetch all SKUs with profitability data in chunks
    console.log('Fetching all SKU profitability data in paginated chunks...');
    const allSKUs: any[] = [];
    const CHUNK_SIZE = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseAdmin
        .from('sku_profitability_summary')
        .select('*')
        .order('total_revenue_usd', { ascending: false })
        .range(offset, offset + CHUNK_SIZE - 1);

      if (error) {
        console.error('Error fetching SKU chunk:', error);
        throw error;
      }

      if (data && data.length > 0) {
        allSKUs.push(...data);
        console.log(`Fetched chunk: ${offset}-${offset + data.length}, Total so far: ${allSKUs.length}`);
        offset += CHUNK_SIZE;
        hasMore = data.length === CHUNK_SIZE;
      } else {
        hasMore = false;
      }
    }

    console.log(`✓ Fetched all ${allSKUs.length} SKUs from view`);

    return NextResponse.json({
      success: true,
      data: allSKUs,
      count: allSKUs.length
    });
  } catch (error: any) {
    console.error('Error in item analysis API:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
