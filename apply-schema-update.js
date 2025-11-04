// Script to apply updated SQL schema with invoice source tracking and zero intl shipping filter
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applySchema() {
  try {
    console.log('📖 Reading SQL schema file...');
    const sqlPath = path.join(__dirname, 'supabase-schema-item-analysis-FINAL-COMPLETE.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('🔄 Applying schema updates...');
    console.log('   - Filtering out orders with zero international shipping fees');
    console.log('   - Adding invoice source tracking (commodity_invoice_files, freight_invoice_files)');
    console.log('   - Recreating views: item_cost_analysis, sku_profitability_summary, product_profitability_summary');

    const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql });

    if (error) {
      // If rpc doesn't exist, try direct query
      console.log('⚠️  RPC method not available, trying direct query...');
      const { error: directError } = await supabase.from('_temp').select('*').limit(0);

      console.log('\n⚠️  Please apply the SQL manually:');
      console.log('1. Go to your Supabase dashboard');
      console.log('2. Open the SQL Editor');
      console.log('3. Paste and run the contents of: supabase-schema-item-analysis-FINAL-COMPLETE.sql');
      console.log('\nOr use the Supabase CLI:');
      console.log('   supabase db reset (if using local dev)');
      console.log('   OR');
      console.log('   psql $DATABASE_URL < supabase-schema-item-analysis-FINAL-COMPLETE.sql');

      return;
    }

    console.log('✅ Schema updated successfully!');
    console.log('\n📊 Changes applied:');
    console.log('   ✓ Orders with $0 international shipping now excluded');
    console.log('   ✓ Invoice source tracking added to all views');
    console.log('   ✓ Views recreated with new fields');
    console.log('\n🔗 You can now see invoice sources in the profitability view!');
    console.log('   - Click on any SKU to view order details');
    console.log('   - Click on invoice names to view raw invoice data');

  } catch (err) {
    console.error('❌ Error applying schema:', err);
    process.exit(1);
  }
}

applySchema();
