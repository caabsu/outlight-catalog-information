# Cost Estimation Algorithm Upgrade

## Overview
This upgrade redesigns the cost estimation to be **highly accurate** by only using clean, single-SKU order data. The new algorithm includes international shipping costs and excludes ambiguous multi-product orders.

## Key Changes

### 1. Maximum Accuracy Approach
- **Only uses single-SKU orders** (even if multiple quantities)
- **Excludes multi-product orders** that are hard to allocate costs to
- **Includes ALL costs**: commodity + domestic freight + international shipping + service fees
- **Confidence scoring** based on data quality and variance

### 2. International Shipping Inclusion
- Fetches international shipping and service fees from `invoice_freight_items`
- Joins freight data with commodity data by `order_number`
- For single-SKU orders, allocates ALL freight costs to that SKU
- Calculates complete per-unit cost including all fees

### 3. Product-Level Grouping UI
- New view: `product_profitability_summary` groups items by product name
- Collapsible SKU details (collapsed by default)
- Fetch SKU details on-demand when expanding a product
- Shows aggregated metrics at product level

## What You Need to Do

### Step 1: Drop Existing Views
Run this SQL in your Supabase SQL editor **FIRST**:

```sql
-- Drop existing views (in correct order due to dependencies)
DROP VIEW IF EXISTS product_profitability_summary;
DROP VIEW IF EXISTS sku_profitability_summary;
DROP VIEW IF EXISTS item_cost_analysis;
```

### Step 2: Create New Views
Then run the SQL from `supabase-schema-item-analysis.sql`:

```bash
# The file contains all three new views:
# 1. item_cost_analysis - Item-level cost analysis with clean data only
# 2. sku_profitability_summary - SKU aggregations with invoice data only
# 3. product_profitability_summary - Product-level grouping (NEW)
```

Copy and paste the entire content of `supabase-schema-item-analysis.sql` into your Supabase SQL editor and run it.

## New SQL Views

### `item_cost_analysis`
- Uses CTEs to identify single-SKU orders
- Joins commodity costs with international shipping
- Calculates complete per-unit costs (all fees included)
- Only uses clean data points for averaging
- Confidence scoring: 100% (perfect), 95%, 90%, 80%, 70%, 0% (no data)

### `sku_profitability_summary`
- Aggregates all instances of each SKU
- Shows cost breakdown: commodity, domestic freight, intl shipping, service fees
- Only includes SKUs with clean invoice data
- Tracks data quality metrics

### `product_profitability_summary` (NEW)
- Groups SKUs by product name
- Shows aggregated revenue, costs, and profitability
- Includes SKU count and array of SKUs
- Overall profit margin calculated correctly

## UI Changes

### Item Profitability Page (`app/items/page.tsx`)
- **Before**: Flat list of SKUs
- **After**: Product-level grouping with collapsible SKU rows
- **Click to expand**: Shows all SKUs under that product
- **Collapsed by default**: Cleaner, more organized view
- **On-demand loading**: SKU details fetched only when expanded

### New API Endpoints
1. `/api/analysis/products-summary` - Fetches product-level summary
2. `/api/analysis/product-skus?product_title=XYZ` - Fetches SKUs for a product

## Expected Results

### More Accurate But Fewer Items
- You will see **fewer items** in the profitability view
- This is **intentional** and **correct**
- Only items with clean, verifiable cost data are shown
- No more 60% fallback estimates
- No more unreliable multi-product order allocations

### Confidence Scores
- **100%**: 5+ clean invoices, low variance
- **95%**: 3+ clean invoices, low variance
- **90%**: 3+ clean invoices
- **80%**: 2 clean invoices
- **70%**: 1 clean invoice
- **0%**: No clean data (excluded from views)

### Cost Breakdown
Each item now shows:
- Commodity price
- Domestic freight
- International shipping (per unit)
- Service fees (per unit)
- **Total cost** (all-inclusive)

## Testing

After running the SQL:

1. Go to Item Profitability page
2. You should see products grouped by name
3. Click on a product to expand and see its SKUs
4. Check that confidence scores are 70%+
5. Verify costs include all fees (commodity + freight + shipping)

## Rollback

If you need to rollback to the previous version:

```bash
# The old items page is backed up at:
app/items/page.tsx.backup

# Restore it with:
cp app/items/page.tsx.backup app/items/page.tsx
```

Then drop the new views and recreate the old ones (you'll need to find your previous SQL).

## Summary

✅ Maximum accuracy - only clean single-SKU order data
✅ Includes ALL costs - commodity, freight, shipping, fees
✅ Product grouping - organized by product name
✅ Collapsible SKUs - expand to see details
✅ Confidence scoring - know how reliable each estimate is
✅ No fallback estimates - data-only approach

This upgrade prioritizes **accuracy over coverage**. You'll see fewer items, but every cost estimate will be highly reliable.
