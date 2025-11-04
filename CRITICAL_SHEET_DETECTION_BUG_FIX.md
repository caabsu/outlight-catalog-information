# CRITICAL BUG FIX: Sheet Misidentification

## 🔥 The Problem

You discovered that **Order #4490 appears in the database with freight data that doesn't exist in the actual Excel file**. After investigation, we found the root cause:

### The Bug

The `isFreightSheet()` function was **too broad** and was incorrectly detecting **commodity sheets as freight sheets**.

```typescript
// OLD CODE (BUGGY)
function isFreightSheet(data: any[]): boolean {
  const hasOrderId = keys.some(k => k.includes('order'));
  const hasShipping = keys.some(k => k.includes('shipping') || k.includes('freight'));
  return hasOrderId && hasShipping;  // ❌ MATCHES BOTH SHEETS!
}
```

**Why this matched commodity sheets:**
- Commodity tab has: `Order ID`, `SKU`, `Price`, **`Domestic Freight`**, `Total`
- The function looked for "order" ✓ and "freight" ✓
- So it detected the commodity tab as a freight tab!

### The Impact

This caused the parser to **read the same commodity data twice**:

1. **First pass:** Correctly as commodity → Created commodity rows ✓
2. **Second pass:** INCORRECTLY as freight → Created FAKE freight rows ❌

The fake freight rows had:
- ❌ Order numbers from the commodity tab (not the freight tab)
- ❌ "International shipping" values that were actually **domestic freight** values
- ❌ Very low costs ($1-5) - because domestic freight is much cheaper than international
- ❌ Even **negative values** (like Order 4124: -$2.76) - probably refunds in domestic freight

### What You Saw

Looking at your database query results:
```json
{
  "order_number": "4490",
  "international_shipping_usd": "3.64",  // ← This is actually domestic freight!
  "filename": "2025.10.25（put1rp-iq）.xls"
}
```

And many orders with $0.00 international shipping:
```json
{ "order_number": "4477", "international_shipping_usd": "0.00" }
{ "order_number": "4496", "international_shipping_usd": "0.00" }
{ "order_number": "4499", "international_shipping_usd": "0.00" }
```

**When you opened the Excel file manually:**
- The freight tab was EMPTY or had NO order numbers
- But the database had freight rows for dozens of orders!
- Mystery solved: They were parsed from the **commodity tab**

## ✅ The Fix

### 1. Enhanced Sheet Detection Logic

**New `isFreightSheet()` function:**

```typescript
function isFreightSheet(data: any[]): boolean {
  const hasOrderId = keys.some(k => k.includes('order'));

  // ✅ Must have INTERNATIONAL specifically (not just "freight")
  const hasInternationalShipping = keys.some(k =>
    k.includes('international') || k.includes('国际')
  );

  // ✅ EXCLUDE if it has commodity-specific columns
  const hasSKU = keys.some(k => k.includes('sku'));
  const hasPrice = keys.some(k => k.includes('price') && !k.includes('shipping'));
  const hasTotal = keys.some(k => k.includes('total'));
  const isCommodity = hasSKU || (hasPrice && hasTotal);

  // ✅ Bonus: Check for freight-specific columns
  const hasWeight = keys.some(k => k.includes('weight'));
  const hasServiceFee = keys.some(k => k.includes('service') && k.includes('fee'));

  // Only freight if:
  // 1. Has order ID
  // 2. Has "International" OR freight-specific columns
  // 3. Does NOT have commodity columns
  return hasOrderId &&
         (hasInternationalShipping || hasWeight || hasServiceFee) &&
         !isCommodity;
}
```

**Key improvements:**
1. ✅ Looks for "**International**" specifically, not just "freight" or "shipping"
2. ✅ **Excludes** sheets with SKU, Price, or Total columns (commodity indicators)
3. ✅ Double-checks with freight-specific columns (Weight, Service Fee)
4. ✅ Added safety check: `if (isFreight && !isCommodity)` before parsing

### 2. Enhanced Logging

The parser now logs detailed information during upload:

```
Checking sheet "Sheet1" with 45 rows
  Columns: Order ID, SKU, Price, Domestic Freight, Total
  Detection: isCommodity=true, isFreight=false
  Parsing as COMMODITY sheet

✅ Parsing complete:
   📦 45 commodity items
   ✈️  0 freight items

⚠️  No freight items found. This invoice only contains commodity data.
   Orders from this invoice will NOT appear in profitability view.
```

**If a sheet is detected as BOTH** (should never happen now):
```
⚠️  ERROR: Sheet "Sheet1" detected as BOTH commodity and freight!
  This should never happen. Treating as commodity only.
```

### 3. Strict Validation (Already Added)

The parser also skips freight rows with:
- Empty/null order numbers
- Placeholder values (N/A, -, /, #)
- **Zero international shipping** (our previous fix)

## 🧹 What You Need To Do

### Step 1: Identify Affected Invoices

Run the diagnostic query to see which invoices have duplicate freight data:

```bash
# In Supabase SQL Editor, run:
cat CLEANUP_DUPLICATE_FREIGHT_DATA.sql
```

Look for invoices marked as `⚠️  LIKELY DUPLICATE`.

Based on your data, **`2025.10.25（put1rp-iq）.xls`** is definitely affected.

### Step 2: Delete the Affected Invoice(s)

**Option A: Via UI** (Easiest)
1. Go to `/invoices` page
2. Find invoice `2025.10.25（put1rp-iq）.xls`
3. Click "Delete"
4. Confirm deletion

**Option B: Via SQL**
```sql
DELETE FROM invoice_uploads
WHERE filename = '2025.10.25（put1rp-iq）.xls';
-- This will CASCADE delete all commodity and freight items
```

### Step 3: Re-upload with Fixed Parser

1. Go to `/upload` page
2. Select the file `2025.10.25（put1rp-iq）.xls`
3. Upload it
4. **Watch the server logs carefully**

You should now see:
```
Checking sheet "commodity" with 45 rows
  Columns: Order ID, SKU, Price, Domestic Freight, Total
  Detection: isCommodity=true, isFreight=false
  Parsing as COMMODITY sheet

Checking sheet "freight" with 0 rows
  (sheet is empty or doesn't exist)

✅ Parsing complete:
   📦 45 commodity items
   ✈️  0 freight items

⚠️  No freight items found. This invoice only contains commodity data.
   Orders from this invoice will NOT appear in profitability view.
```

**If the invoice truly has no freight tab or the freight tab is empty:**
- ✅ This is correct behavior!
- ✅ Orders from this invoice will NOT appear in the profitability view
- ✅ They will be excluded (as intended) because they lack complete data

**If the invoice DOES have a real freight tab with order numbers:**
- ✅ You should see both commodity AND freight items parsed
- ✅ The freight items should have realistic international shipping costs (not $1-5)
- ✅ No negative values or zero values (our validator excludes those)

### Step 4: Verify in Profitability View

1. Go to `/items` (Profitability View)
2. Search for SKU `FL-CAE-ACR-35K`
3. **Expected result:**
   - If the invoice has NO freight data: Order #4490 should NOT appear ✓
   - If the invoice HAS freight data: Order #4490 should appear with correct freight costs ✓

### Step 5: Check Other Invoices

Run this query to find other potentially affected invoices:

```sql
SELECT DISTINCT iu.filename
FROM invoice_commodity_items ic
INNER JOIN invoice_freight_items if_items
    ON ic.upload_id = if_items.upload_id
    AND REPLACE(ic.order_number, '#', '') = REPLACE(if_items.order_number, '#', '')
LEFT JOIN invoice_uploads iu ON ic.upload_id = iu.id
WHERE if_items.international_shipping_usd < 50
ORDER BY iu.filename;
```

For each affected invoice:
1. Delete it from the system
2. Re-upload with the fixed parser

## 🎯 Expected Behavior After Fix

### What SHOULD Happen:

**Commodity-only invoices:**
- ✅ Parse commodity data correctly
- ✅ Do NOT create any freight rows
- ✅ Orders excluded from profitability (no complete data)
- ✅ Console logs: "⚠️  No freight items found"

**Invoices with separate freight tab:**
- ✅ Parse commodity tab as commodity
- ✅ Parse freight tab as freight
- ✅ Order numbers should match between tabs
- ✅ International shipping costs should be realistic ($10-$100+ range)

**What should NEVER happen:**
- ❌ Same sheet parsed as both commodity AND freight
- ❌ Freight rows with international shipping < $10 (unless truly small items)
- ❌ Freight rows with negative costs
- ❌ Freight rows with zero international shipping
- ❌ Order numbers in freight that don't exist in the actual freight tab

## 📊 Verification Queries

After re-uploading, verify everything is correct:

### 1. No duplicate detection
```sql
-- Should return 0 rows (or very few legitimate duplicates)
SELECT COUNT(*)
FROM invoice_commodity_items ic
INNER JOIN invoice_freight_items if_items
    ON ic.upload_id = if_items.upload_id
    AND REPLACE(ic.order_number, '#', '') = REPLACE(if_items.order_number, '#', '');
```

### 2. Freight data quality
```sql
SELECT
    COUNT(*) as total_freight_rows,
    COUNT(CASE WHEN international_shipping_usd = 0 THEN 1 END) as zero_intl,
    COUNT(CASE WHEN international_shipping_usd < 0 THEN 1 END) as negative,
    MIN(international_shipping_usd) as min_cost,
    AVG(international_shipping_usd) as avg_cost,
    MAX(international_shipping_usd) as max_cost
FROM invoice_freight_items;
```

Expected:
- `zero_intl`: 0
- `negative`: 0
- `min_cost`: > 0 (probably > 0.50)
- `avg_cost`: Reasonable (probably $5-$30)

### 3. Check specific order
```sql
-- Check if #4490 still has (incorrect) freight data
SELECT *
FROM invoice_freight_items
WHERE REPLACE(order_number, '#', '') = '4490';
```

Expected:
- If the freight tab truly has #4490: 1 row with realistic costs
- If the freight tab doesn't have #4490: 0 rows ✓

## 🔍 Root Cause Summary

| Component | Old Behavior | New Behavior |
|-----------|-------------|--------------|
| **Sheet Detection** | Matched any sheet with "order" + "freight" | Requires "international" and excludes commodity columns |
| **Commodity Tab** | ❌ Detected as freight (because of "Domestic Freight" column) | ✅ Only detected as commodity |
| **Freight Tab** | ✅ Detected as freight | ✅ Only detected as freight |
| **Result** | Same data parsed twice, creating fake freight rows | Each sheet parsed once correctly |

## 📁 Files Changed

1. **lib/xlsx-parser.ts**
   - Rewrote `isFreightSheet()` function
   - Added `isCommodity` exclusion check
   - Added detailed logging
   - Added warning for dual-detection

2. **CLEANUP_DUPLICATE_FREIGHT_DATA.sql** (New)
   - Diagnostic queries to find affected invoices
   - Options for cleaning up duplicate data
   - Verification queries

3. **This Document** (New)
   - Complete explanation of bug and fix

## ⚠️ Important Notes

1. **This was a parser bug**, not a data issue with your Excel files
2. **The fix prevents future problems** - new uploads will work correctly
3. **You must clean up existing bad data** - by deleting and re-uploading affected invoices
4. **Some invoices may legitimately have no freight data** - this is OK and expected
5. **Orders without complete data will be excluded from profitability view** - this is correct behavior

## 🆘 If You Still See Issues

If after cleanup and re-upload you still see Order #4490 with freight data:

1. **Check if it exists in a different invoice:**
   ```sql
   SELECT iu.filename, if_items.*
   FROM invoice_freight_items if_items
   LEFT JOIN invoice_uploads iu ON if_items.upload_id = iu.id
   WHERE REPLACE(if_items.order_number, '#', '') = '4490';
   ```

2. **Check the actual Excel file** - Open it and verify:
   - Does the freight tab have order #4490?
   - What is the actual international shipping cost?

3. **Check the upload logs** - Look for:
   - "Parsing as COMMODITY sheet"
   - "Parsing as FREIGHT sheet"
   - Any ERROR messages

## ✅ Success Criteria

You'll know the fix worked when:

1. ✅ Re-uploading an invoice shows correct detection in logs
2. ✅ No orders appear in freight that aren't in the actual freight tab
3. ✅ International shipping costs are realistic (not $1-5)
4. ✅ No zero or negative international shipping costs
5. ✅ Profitability view shows only orders with complete data
6. ✅ Invoice source links correctly show which file provided each piece of data

---

**All changes committed to branch:** `claude/improve-profitability-view-tracing-011CUndhNDPHYdCaVjuzv1vV`
