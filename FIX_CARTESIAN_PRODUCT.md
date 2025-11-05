# Fix Insanely High Costs - Cartesian Product Issue

## Problem

Orders showing absurdly high costs in the main table:
- **Main table:** $75,082 total cost
- **Detail modal:** $1,635 total cost (correct)
- **Issue:** 46x multiplier!

## Root Cause: Cartesian Product from LEFT JOIN

### What is a Cartesian Product?

When you LEFT JOIN two tables that BOTH have multiple rows per order, you get a multiplication effect.

**Example:**
```
Order #1234 has:
- 3 commodity invoice entries (3 rows)
- 2 freight invoice entries (2 rows)

SQL: LEFT JOIN commodity LEFT JOIN freight
Result: 3 × 2 = 6 rows per order!

When you SUM(commodity.total_usd):
- Each commodity entry gets counted 2 times (once per freight row)
- Commodity cost = actual × 2

When you SUM(freight.total_usd):
- Each freight entry gets counted 3 times (once per commodity row)
- Freight cost = actual × 3
```

### Real Example from Your Data

```sql
-- OLD BROKEN VIEW:
FROM shopify_orders so
LEFT JOIN invoice_commodity_items ic ON ...
LEFT JOIN invoice_freight_items if_items ON ...
GROUP BY so.order_number

Order #1234:
- Commodity actual: $1,000 (3 entries: $400, $300, $300)
- Freight actual: $635 (2 entries: $600, $35)
- JOIN creates 6 rows

SUM(ic.total_usd) = $400 + $300 + $300 + $400 + $300 + $300 = $2,000 (2x actual!)
SUM(if_items.intl_shipping_usd) = $600 + $600 + $600 + $35 + $35 + $35 = $1,905 (3x actual!)

Total calculated: $2,000 + $1,905 = $3,905
Total actual: $1,000 + $635 = $1,635

Multiplier: 2.4x (average of 2x and 3x)
```

### Why Detail Modal Was Correct

The detail modal fetches commodityItems and freightItems as **separate arrays**, then sums each independently:

```typescript
// Correct approach - no cartesian product
commodityItems.reduce((sum, item) => sum + item.total_usd, 0)  // = $1,000
+ freightItems.reduce((sum, item) => sum + intl + fees, 0)     // = $635
= $1,635 ✓
```

## Solution: Aggregate Separately Before Joining

**FIX_ORDER_COST_ANALYSIS_V2.sql** fixes this by:

1. **Separate CTEs** for commodity and freight aggregation
2. **Aggregate FIRST**, then join the aggregated results
3. **No cartesian product** - each order has exactly 1 row per CTE

```sql
WITH commodity_costs AS (
    -- Sum commodity items FIRST (1 row per order)
    SELECT
        REPLACE(order_number, '#', '') as order_number_clean,
        SUM(total_usd) as commodity_total_usd,
        SUM(total_cny) as commodity_total_cny
    FROM invoice_commodity_items
    GROUP BY REPLACE(order_number, '#', '')
),
freight_costs AS (
    -- Sum freight items FIRST (1 row per order)
    SELECT
        REPLACE(order_number, '#', '') as order_number_clean,
        SUM(international_shipping_usd) as international_shipping_usd,
        SUM(service_fee_usd) as service_fee_usd
    FROM invoice_freight_items
    GROUP BY REPLACE(order_number, '#', '')
)
SELECT
    so.order_number,
    cc.commodity_total_usd,    -- Already summed (1 value)
    fc.international_shipping_usd,  -- Already summed (1 value)
    cc.commodity_total_usd + fc.international_shipping_usd as total_cost  -- Correct!
FROM shopify_orders so
LEFT JOIN commodity_costs cc ON ...
LEFT JOIN freight_costs fc ON ...
```

Now each order has exactly 1 row, with pre-aggregated costs. No multiplication!

## Diagnostic Queries

**DIAGNOSE_HIGH_COSTS.sql** provides views to investigate:

### 1. Find Suspect Orders
```sql
SELECT * FROM suspect_high_cost_orders
ORDER BY total_cost_calculated DESC
LIMIT 20;
```

Shows orders with costs > $10k with:
- Entry counts per order
- Individual values
- Possible CNY/USD confusion

### 2. Check for Duplicates
```sql
SELECT * FROM duplicate_invoice_entries
WHERE entry_count > 5;
```

Shows orders with many invoice entries (might be duplicates or legitimate).

### 3. Check CNY/USD Confusion
```sql
SELECT * FROM cny_usd_confusion_check
WHERE status != 'OK'
LIMIT 50;
```

Identifies if CNY values were accidentally stored in USD columns.

### 4. Detailed Order Breakdown
```sql
SELECT * FROM order_cost_detail
WHERE order_number_clean = '1234';
```

Shows every single row for an order to trace the multiplication.

## How to Apply the Fix

### Step 1: Run Diagnostics (Optional but Recommended)

```sql
-- In Supabase SQL Editor, run:
-- 1. Copy/paste DIAGNOSE_HIGH_COSTS.sql
-- 2. Run these queries:

SELECT * FROM suspect_high_cost_orders LIMIT 10;
-- Note the orders with crazy high costs

SELECT * FROM order_cost_detail
WHERE order_number_clean = 'YOUR_ORDER_HERE';
-- See the cartesian product in action
```

### Step 2: Apply the Fix

```sql
-- In Supabase SQL Editor:
-- Copy/paste entire FIX_ORDER_COST_ANALYSIS_V2.sql and run
```

### Step 3: Verify the Fix

1. Refresh the orders page
2. Find an order that previously had high costs
3. Check main table cost
4. Click "View Details"
5. Verify costs match exactly

## Expected Results

### Before Fix
```
Order #1234
Main table: $75,082 total cost
Detail modal: $1,635 total cost
Difference: 46x multiplier (cartesian product)
```

### After Fix
```
Order #1234
Main table: $1,635 total cost ✓
Detail modal: $1,635 total cost ✓
Difference: MATCH!
```

## Why This Happened

1. **Original schema** stores invoice data normalized (multiple rows per order)
2. **Original view** used LEFT JOIN on both tables simultaneously
3. **SQL JOIN behavior** creates cartesian product with multiple matches
4. **SUM() aggregation** counts each row, multiplying costs

This is a classic SQL anti-pattern when aggregating from multiple one-to-many relationships.

## Prevention for Future

When creating views that aggregate from multiple tables with one-to-many relationships:

❌ **DON'T:**
```sql
SELECT SUM(table1.amount), SUM(table2.amount)
FROM main
LEFT JOIN table1 ON ...
LEFT JOIN table2 ON ...
```

✅ **DO:**
```sql
WITH agg1 AS (SELECT id, SUM(amount) FROM table1 GROUP BY id),
     agg2 AS (SELECT id, SUM(amount) FROM table2 GROUP BY id)
SELECT agg1.amount, agg2.amount
FROM main
LEFT JOIN agg1 ON ...
LEFT JOIN agg2 ON ...
```

## Rollback Plan

If V2 has issues:

```sql
-- Restore V1 (with # prefix fix but cartesian product still exists)
-- Run: FIX_ORDER_COST_ANALYSIS.sql (not V2)
```

## Summary

**Root cause:** Cartesian product from LEFT JOIN commodity + freight simultaneously

**Symptom:** Costs multiplied by (commodity_entries × freight_entries)

**Fix:** Aggregate each table separately in CTEs, then join pre-aggregated results

**Result:** 1 row per order, accurate costs matching detail modal
