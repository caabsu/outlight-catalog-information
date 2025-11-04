import { NextResponse } from 'next/server';
import { fetchAllProducts } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';

// Increase timeout for this route (10 minutes)
export const maxDuration = 600;

/**
 * Insert data in batches to avoid timeout
 */
async function insertInBatches(tableName: string, data: any[], batchSize: number, conflictColumn: string) {
  let totalInserted = 0;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(data.length / batchSize);

    console.log(`Inserting ${tableName} batch ${batchNumber}/${totalBatches} (${batch.length} items)`);

    const { error } = await supabaseAdmin
      .from(tableName)
      .upsert(batch, { onConflict: conflictColumn });

    if (error) {
      console.error(`Error inserting ${tableName} batch ${batchNumber}:`, error);
      throw error;
    }

    totalInserted += batch.length;
    console.log(`${tableName}: ${totalInserted}/${data.length} completed`);
  }

  return totalInserted;
}

export async function POST() {
  try {
    console.log('Starting Shopify product sync...');
    const products = await fetchAllProducts();
    console.log(`Fetched ${products.length} products from Shopify`);

    // Prepare products data
    const productsToInsert = products.map((product: any) => ({
      product_id: product.id,
      title: product.title,
      vendor: product.vendor,
      product_type: product.product_type,
      created_at: product.created_at,
      updated_at: product.updated_at,
      raw_data: product,
    }));

    // Insert products in batches of 100
    console.log(`Inserting ${productsToInsert.length} products in batches...`);
    const productsInserted = await insertInBatches('shopify_products', productsToInsert, 100, 'product_id');
    console.log(`✓ Completed inserting ${productsInserted} products`);

    // Prepare variants data
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

    // Insert variants in batches of 500
    let variantsInserted = 0;
    if (variantsToInsert.length > 0) {
      console.log(`Inserting ${variantsToInsert.length} variants in batches...`);
      variantsInserted = await insertInBatches('shopify_variants', variantsToInsert, 500, 'variant_id');
      console.log(`✓ Completed inserting ${variantsInserted} variants`);
    }

    console.log('✓ Shopify product sync completed successfully!');

    return NextResponse.json({
      success: true,
      productsCount: productsInserted,
      variantsCount: variantsInserted,
    });
  } catch (error: any) {
    console.error('Error syncing products:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
