# Multi-SKU Order Filtering

## Problem

When an order contains multiple different products (SKUs), the invoice doesn't tell us which product costs what. The invoice shows:
- **Total commodity cost** for the entire order
- **Total freight cost** for the entire order

But NOT the breakdown per product.

## Example Scenario

### Order #1234 contains:
- Product A (SKU-001): 2 units @ $50 = $100 revenue
- Product B (SKU-002): 1 unit @ $30 = $30 revenue
- **Total revenue: $130**

### Invoice shows:
- Commodity total: $60 (but which product costs what?)
- Freight total: $20 (how to allocate between products?)
- **Total cost: $80**

### The Problem:
We can't determine:
- Is Product A $40 and Product B $20?
- Or Product A $50 and Product B $10?
- Or some other split?

**Without this information, any allocation would be a GUESS!**

## Solution: Filter to Single-SKU Orders Only

### What We Include:
✅ **Single SKU, Single Unit**
```
Order #1234: 1x Widget (SKU-001)
- Can accurately assign all costs to this product
```

✅ **Single SKU, Multiple Units**
```
Order #5678: 3x Widget (SKU-001)
- All costs go to same product
- Cost per unit = Total cost ÷ 3
```

### What We Exclude:
❌ **Multiple Different SKUs**
```
Order #9999: 2x Widget (SKU-001) + 1x Gadget (SKU-002)
- Cannot determine per-product costs from invoice
- EXCLUDED from analysis
```

## Implementation

### Order Cost Analysis View (V3)

```sql
WITH single_sku_orders AS (
    -- Only orders with ONE unique SKU
    SELECT order_number
    FROM order_sku_counts
    WHERE unique_sku_count = 1  -- Key filter!
)
SELECT ...
FROM shopify_orders so
INNER JOIN single_sku_orders sso  -- Apply filter
    ON so.order_number = sso.order_number
```

### Product Cost Analysis View

Already implemented in DATABASE_PRODUCT_FIX.sql:

```sql
single_sku_orders AS (
    -- ONLY single-SKU orders (most reliable)
    SELECT order_number
    FROM order_item_counts
    WHERE unique_sku_count = 1
)
```

## Impact

### Orders Page
**Before:** Shows all orders with invoice data (including multi-SKU)
**After:** Shows only single-SKU orders with invoice data

**Result:** Fewer orders displayed, but 100% accurate cost allocation

### Products Page
**Already filtered:** Only shows costs from single-SKU orders

**Result:** All product costs are accurate (no guessing/estimation)

## Data Accuracy

### Single-SKU Orders:
- ✅ **100% accurate** cost allocation
- ✅ Direct assignment of all costs
- ✅ No estimation or guessing
- ✅ Reliable profit calculations

### Multi-SKU Orders (Excluded):
- ❌ Would require cost **estimation**
- ❌ No way to validate allocation accuracy
- ❌ Could lead to wrong conclusions
- ❌ Better to exclude than to show wrong data

## Statistics

To see how many orders are affected:

```sql
-- Count single vs multi-SKU orders
SELECT
    COUNT(*) FILTER (WHERE unique_sku_count = 1) as single_sku_orders,
    COUNT(*) FILTER (WHERE unique_sku_count > 1) as multi_sku_orders,
    COUNT(*) as total_orders,
    ROUND(100.0 * COUNT(*) FILTER (WHERE unique_sku_count = 1) / COUNT(*), 1) as single_sku_percentage
FROM (
    SELECT
        order_number,
        COUNT(DISTINCT sku) as unique_sku_count
    FROM shopify_order_items
    WHERE sku IS NOT NULL AND sku != ''
    GROUP BY order_number
) counts;
```

## Future Enhancement Options

If you need to include multi-SKU orders in the future, you would need:

### Option 1: Enhanced Invoices
Invoice format would need to change to show:
```
Order #1234
- SKU-001: $40 commodity, $12 freight
- SKU-002: $20 commodity, $8 freight
```

### Option 2: Proportional Allocation (Less Accurate)
```sql
-- Allocate costs proportionally by revenue
cost_per_product = (product_revenue / order_revenue) × total_order_cost
```

**Problem:** Assumes all products have same profit margin (rarely true!)

### Option 3: Average Cost Method (Less Accurate)
Use average cost from single-SKU orders for products in multi-SKU orders.

**Problem:** Ignores order-specific variations in shipping, etc.

## Current Recommendation

**Keep the single-SKU filter!**

Reasons:
1. **Accuracy over completeness** - Better to show less data that's 100% accurate
2. **No guessing** - Every cost is directly traceable to invoice
3. **Trustworthy profits** - All profit calculations are reliable
4. **Clear data quality** - Users know exactly what they're looking at

## How to Apply

Run in Supabase SQL Editor:
```sql
-- Apply the V3 view with single-SKU filtering
-- Copy/paste FIX_ORDER_COST_ANALYSIS_V3.sql
```

After applying:
- Orders page will only show single-SKU orders
- All displayed costs will be 100% accurate
- Multi-SKU orders won't appear (can't calculate costs accurately)
