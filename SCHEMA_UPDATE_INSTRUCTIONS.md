# Schema Update Instructions

This update adds invoice source tracking and filters out orders without international shipping fees.

## Changes Made

### 1. SQL Schema Updates (`supabase-schema-item-analysis-FINAL-COMPLETE.sql`)

**Critical Fix:**
- Changed filter from `>= 0` to `> 0` for international shipping (line 38)
- Now excludes orders with $0 or null international shipping fees

**New Features:**
- Added `commodity_invoice_files` array - shows which invoice files provided commodity data
- Added `commodity_invoice_ids` array - IDs for linking to invoice details
- Added `freight_invoice_files` array - shows which invoice files provided freight data
- Added `freight_invoice_ids` array - IDs for linking to invoice details

These fields are now available in the `item_cost_analysis` view.

### 2. UI Updates (`app/items/page.tsx`)

- SKU rows are now clickable to expand order details
- Shows all orders for each SKU with:
  - Order number, date, quantity, revenue, cost, profit
  - **Invoice sources** - clickable links showing which invoice files provided the data
- Links redirect to `/invoices?id={invoice_id}` to view raw invoice data

### 3. Type Updates (`lib/types.ts`)

Added invoice source fields to `ItemCostAnalysis` interface:
```typescript
commodity_invoice_files?: string[];
commodity_invoice_ids?: number[];
freight_invoice_files?: string[];
freight_invoice_ids?: number[];
```

### 4. Invoices Page Enhancement (`app/invoices/page.tsx`)

- Now supports `?id={invoice_id}` query parameter
- Auto-opens invoice details modal when linked from profitability view

## How to Apply

### Option 1: Via Supabase Dashboard (Recommended)

1. Log in to your Supabase project dashboard
2. Navigate to SQL Editor
3. Open `supabase-schema-item-analysis-FINAL-COMPLETE.sql`
4. Copy and paste the entire contents
5. Click "Run"

### Option 2: Via psql Command Line

```bash
# If you have direct database access
psql "$DATABASE_URL" < supabase-schema-item-analysis-FINAL-COMPLETE.sql
```

### Option 3: Via Supabase CLI (Local Development)

```bash
supabase db reset
# Or
supabase db push
```

## Testing the Changes

1. **Test Zero International Shipping Filter:**
   ```sql
   -- This should return 0 rows (orders with $0 intl shipping now excluded)
   SELECT order_number, order_intl_shipping_usd
   FROM item_cost_analysis
   WHERE order_intl_shipping_usd = 0
   LIMIT 10;
   ```

2. **Test Invoice Source Tracking:**
   ```sql
   -- Should show array of invoice filenames
   SELECT
     order_number,
     sku,
     commodity_invoice_files,
     freight_invoice_files
   FROM item_cost_analysis
   WHERE has_complete_data = true
   LIMIT 5;
   ```

3. **Test UI:**
   - Go to `/items` (Profitability View)
   - Click on a product to expand SKUs
   - Click on a SKU to view order details
   - Verify invoice source links are displayed
   - Click an invoice link to view raw data

## Expected Results

### Before:
- Orders with $0 international shipping were included in calculations
- No visibility into which invoice files provided the data

### After:
- Only orders with positive international shipping fees are included
- Each order shows:
  - 📦 Commodity invoice sources (with links)
  - ✈️ Freight invoice sources (with links)
- Clicking invoice names takes you to `/invoices` page with full details

## Rollback

If you need to revert these changes:

1. The previous version didn't have invoice source fields, so those will simply be NULL/ignored
2. To restore the `>= 0` filter, change line 38 back to:
   ```sql
   AND of.total_intl_shipping_usd >= 0  -- Can be 0, but must exist
   ```

## Questions?

Check the commit message for this change or review the full diff for detailed implementation notes.
