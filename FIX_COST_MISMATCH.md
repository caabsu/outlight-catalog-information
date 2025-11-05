# Fix Cost Mismatch Between Orders Table and Order Details

## Problem

When viewing an order in the Orders Analysis page:
1. **Main table** shows a high cost value
2. **View Details modal** shows much lower or $0.00 costs
3. Mismatch between the two views for the same order

## Root Causes

### 1. Order Number Matching Issue
**Problem:** Invoice tables store order numbers with `#` prefix (e.g., `#1234`) but Shopify stores without prefix (e.g., `1234`)

**Impact:**
- Old view used direct matching: `so.order_number = ic.order_number`
- This fails when one has `#` and the other doesn't
- Results in $0.00 costs when data actually exists

**Example:**
```sql
-- OLD (BROKEN):
FROM shopify_orders so
LEFT JOIN invoice_commodity_items ic ON so.order_number = ic.order_number
-- If so.order_number = '1234' and ic.order_number = '#1234', no match!

-- NEW (FIXED):
FROM shopify_orders so
LEFT JOIN invoice_commodity_items ic
    ON REPLACE(so.order_number, '#', '') = REPLACE(ic.order_number, '#', '')
-- Both become '1234', match works!
```

### 2. LEFT JOIN Showing Incomplete Data
**Problem:** Old view used LEFT JOIN, showing ALL orders even without invoice data

**Impact:**
- Orders without commodity data show $0.00 commodity costs
- Orders without freight data show $0.00 freight costs
- COALESCE(SUM(...), 0) masks missing data
- User sees order in table but details show "no invoice data"

**Example:**
```sql
-- OLD (SHOWS ALL ORDERS):
FROM shopify_orders so
LEFT JOIN invoice_commodity_items ic ON ...
-- Shows every order, costs = 0 if no invoice

-- NEW (ONLY COMPLETE DATA):
FROM shopify_orders so
INNER JOIN clean_orders co ON ...
-- Only shows orders with BOTH commodity AND freight data
```

### 3. Duplicate Invoice Entries
**Problem:** Some orders may have multiple invoice entries causing inflated costs

**Impact:**
- SUM(total_usd) aggregates ALL entries
- If order appears 3 times in invoice, cost is 3x actual
- Need to identify and clean duplicates

## Solution

### Step 1: Apply New Order Cost Analysis View

Run `FIX_ORDER_COST_ANALYSIS.sql` in Supabase SQL Editor.

**What it does:**
1. ✅ Creates `clean_orders` CTE - only orders with BOTH commodity AND freight data
2. ✅ Uses INNER JOIN to filter to clean orders only
3. ✅ Handles `#` prefix with REPLACE() in all joins
4. ✅ Filters WHERE commodity_total_usd > 0 AND international_shipping_usd > 0
5. ✅ Ensures consistency between main table and detail modal

### Step 2: Debug Duplicate Invoices (Optional)

Run `DEBUG_ORDER_MISMATCH.sql` to create debugging views:

```sql
-- Check for duplicate invoice entries
SELECT * FROM debug_duplicate_invoices
WHERE commodity_count > 1;

-- Compare old vs new matching logic
SELECT * FROM debug_cost_comparison
WHERE difference != 0
ORDER BY ABS(difference) DESC;

-- See all data for specific order
SELECT * FROM debug_order_matching
WHERE order_number = '1234';
```

### Step 3: Verify API Consistency

The API (`app/api/analysis/order-details/route.ts`) already queries with both formats:
```typescript
// Queries both with and without # prefix
const { data: commodityData1 } = await supabaseAdmin
  .from('invoice_commodity_items')
  .select('*')
  .eq('order_number', orderNumber);  // Try without #

const { data: commodityData2 } = await supabaseAdmin
  .from('invoice_commodity_items')
  .select('*')
  .eq('order_number', `#${orderNumber}`);  // Try with #

commodityItems = [...(commodityData1 || []), ...(commodityData2 || [])];
```

## Expected Results After Fix

### Orders Analysis Table
- ✅ Only shows orders with BOTH commodity AND freight invoice data
- ✅ Costs calculated from actual invoice totals
- ✅ No more $0.00 costs displayed

### View Details Modal
- ✅ Always shows matching data (never "no invoice data" warning)
- ✅ Commodity section populated with product + domestic freight costs
- ✅ Freight section populated with international shipping + service fees
- ✅ All costs match the main table exactly

### Data Consistency
```
Main Table:
Order #1234: $150.00 cost

View Details:
- Commodity: $100.00 (product $80 + domestic $20)
- Freight: $50.00 (international $40 + fees $10)
- Total: $150.00 ✓ MATCH
```

## Testing Checklist

After applying SQL:

### 1. Orders Table
- [ ] Load `/orders` page
- [ ] Verify orders shown have cost > $0
- [ ] Check a few order costs make sense
- [ ] Note the total order count (should be lower than before)

### 2. Order Details Modal
- [ ] Click "View Details" on any order
- [ ] Should NOT see "Incomplete Invoice Data" warning
- [ ] Should see commodity breakdown section with data
- [ ] Should see freight breakdown section with data
- [ ] Verify "Total Costs" in summary matches modal breakdown

### 3. Calculation Verification
- [ ] Pick an order with visible costs in main table
- [ ] Open details modal
- [ ] Check calculation panel at bottom:
  - Revenue should match Shopify order total
  - Commodity costs should match commodity section sum
  - Freight costs should match freight section sum
  - Total costs = commodity + freight
  - Profit = revenue - total costs
  - All numbers should be consistent

### 4. Edge Cases
- [ ] Search for an order number directly
- [ ] Try orders from different date ranges
- [ ] Check orders with multiple line items
- [ ] Verify profit percentages make sense

## Rollback Plan

If something goes wrong:

```sql
-- Restore old view (without filtering)
CREATE OR REPLACE VIEW order_cost_analysis AS
SELECT
    so.order_number,
    so.order_name,
    so.created_at as order_date,
    so.total_price as shopify_total_usd,
    so.currency as shopify_currency,
    COALESCE(SUM(ic.total_usd), 0) as commodity_total_usd,
    COALESCE(SUM(ic.total_cny), 0) as commodity_total_cny,
    COALESCE(SUM(ic.price_usd), 0) as unit_price_usd,
    COALESCE(SUM(ic.domestic_freight_usd), 0) as domestic_freight_usd,
    COALESCE(SUM(if_items.international_shipping_usd), 0) as international_shipping_usd,
    COALESCE(SUM(if_items.service_fee_usd), 0) as service_fee_usd,
    COALESCE(SUM(ic.total_usd), 0) + COALESCE(SUM(if_items.international_shipping_usd), 0) + COALESCE(SUM(if_items.service_fee_usd), 0) as total_fulfillment_cost_usd,
    so.total_price - (COALESCE(SUM(ic.total_usd), 0) + COALESCE(SUM(if_items.international_shipping_usd), 0) + COALESCE(SUM(if_items.service_fee_usd), 0)) as profit_usd,
    CASE WHEN so.total_price > 0 THEN ((so.total_price - (COALESCE(SUM(ic.total_usd), 0) + COALESCE(SUM(if_items.international_shipping_usd), 0) + COALESCE(SUM(if_items.service_fee_usd), 0))) / so.total_price) * 100 ELSE 0 END as profit_percentage,
    COUNT(DISTINCT soi.id) as item_count
FROM shopify_orders so
LEFT JOIN invoice_commodity_items ic ON so.order_number = ic.order_number
LEFT JOIN invoice_freight_items if_items ON so.order_number = if_items.order_number
LEFT JOIN shopify_order_items soi ON so.order_id = soi.order_id
GROUP BY so.order_number, so.order_name, so.created_at, so.total_price, so.currency;
```

## Summary

**Root cause:** Order number matching failed due to `#` prefix inconsistency + LEFT JOIN showing incomplete data

**Fix:** New view uses REPLACE() for matching + INNER JOIN for completeness + filters to only complete data

**Result:** Perfect consistency between main table and detail modal - only shows orders with complete invoice data
