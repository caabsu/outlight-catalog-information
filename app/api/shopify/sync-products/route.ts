import { NextResponse } from 'next/server';
import { fetchAllProducts } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST() {
  try {
    console.log('Starting Shopify product sync...');
    const products = await fetchAllProducts();
    console.log(`Fetched ${products.length} products from Shopify`);

    const productsToInsert = products.map((product: any) => ({
      product_id: product.id,
      title: product.title,
      vendor: product.vendor,
      product_type: product.product_type,
      created_at: product.created_at,
      updated_at: product.updated_at,
      raw_data: product,
    }));

    // Insert products (upsert on conflict)
    const { data: insertedProducts, error: productsError } = await supabaseAdmin
      .from('shopify_products')
      .upsert(productsToInsert, { onConflict: 'product_id' })
      .select();

    if (productsError) {
      console.error('Error inserting products:', productsError);
      throw productsError;
    }

    console.log(`Inserted/updated ${insertedProducts?.length || 0} products`);

    // Process variants
    const variantsToInsert: any[] = [];
    for (const product of products) {
      if (product.variants && product.variants.length > 0) {
        for (const variant of product.variants) {
          variantsToInsert.push({
            variant_id: variant.id,
            product_id: product.id,
            title: variant.title,
            sku: variant.sku,
            price: parseFloat(variant.price || 0),
            inventory_quantity: variant.inventory_quantity || 0,
            raw_data: variant,
          });
        }
      }
    }

    if (variantsToInsert.length > 0) {
      const { data: insertedVariants, error: variantsError } = await supabaseAdmin
        .from('shopify_variants')
        .upsert(variantsToInsert, { onConflict: 'variant_id' })
        .select();

      if (variantsError) {
        console.error('Error inserting variants:', variantsError);
        throw variantsError;
      }

      console.log(`Inserted/updated ${insertedVariants?.length || 0} variants`);
    }

    return NextResponse.json({
      success: true,
      productsCount: insertedProducts?.length || 0,
      variantsCount: variantsToInsert.length,
    });
  } catch (error: any) {
    console.error('Error syncing products:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
