import * as XLSX from 'xlsx';
import { CommodityItem, FreightItem, ParsedInvoiceData } from './types';

const CNY_TO_USD_RATE = parseFloat(process.env.CNY_TO_USD_RATE || '0.138');

/**
 * Fuzzy match column name - handles variations, case, and Chinese characters
 */
function findColumn(row: any, possibleNames: string[]): any {
  const keys = Object.keys(row);

  for (const name of possibleNames) {
    // Try exact match first
    if (row[name] !== undefined) return row[name];

    // Try case-insensitive match
    const lowerName = name.toLowerCase();
    for (const key of keys) {
      if (key.toLowerCase() === lowerName) return row[key];

      // Try partial match (contains)
      if (key.toLowerCase().includes(lowerName) || lowerName.includes(key.toLowerCase())) {
        return row[key];
      }
    }
  }

  return null;
}

/**
 * Detect if a sheet is a commodity sheet based on column names
 */
function isCommoditySheet(data: any[]): boolean {
  if (data.length === 0) return false;
  const firstRow = data[0];
  const keys = Object.keys(firstRow).map(k => k.toLowerCase());

  // Look for key commodity indicators
  const hasOrderId = keys.some(k => k.includes('order') || k.includes('订单'));
  const hasTotal = keys.some(k => k.includes('total') || k.includes('合计') || k.includes('总'));
  const hasPrice = keys.some(k => k.includes('price') || k.includes('价格') || k.includes('单价'));

  return hasOrderId && (hasTotal || hasPrice);
}

/**
 * Detect if a sheet is a freight sheet based on column names
 * CRITICAL: Must not match commodity sheets that have "Domestic Freight" column
 */
function isFreightSheet(data: any[]): boolean {
  if (data.length === 0) return false;
  const firstRow = data[0];
  const keys = Object.keys(firstRow).map(k => k.toLowerCase());

  // Must have order ID
  const hasOrderId = keys.some(k => k.includes('order') || k.includes('订单'));
  if (!hasOrderId) return false;

  // Must have INTERNATIONAL shipping (not just "shipping" or "freight")
  // This excludes commodity sheets with "Domestic Freight" column
  const hasInternationalShipping = keys.some(k =>
    k.includes('international') ||
    k.includes('国际')
  );

  // EXCLUDE if it has commodity-specific columns
  const hasSKU = keys.some(k => k.includes('sku') || k.includes('货号'));
  const hasPrice = keys.some(k => k.includes('price') && !k.includes('shipping'));
  const hasTotal = keys.some(k => k.includes('total') || k.includes('合计'));

  const isCommodity = hasSKU || (hasPrice && hasTotal);

  // Bonus: Check for freight-specific indicators
  const hasWeight = keys.some(k => k.includes('weight') || k.includes('重量'));
  const hasServiceFee = keys.some(k => k.includes('service') && k.includes('fee'));

  // It's a freight sheet if:
  // 1. Has order ID
  // 2. Has "International" in column names (or freight-specific columns)
  // 3. Does NOT have commodity-specific columns
  return hasOrderId &&
         (hasInternationalShipping || hasWeight || hasServiceFee) &&
         !isCommodity;
}

/**
 * Parse XLS/XLSX file and extract commodity and freight data
 */
export function parseInvoiceFile(fileBuffer: Buffer, uploadId: number): ParsedInvoiceData {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });

  const commodityItems: CommodityItem[] = [];
  const freightItems: FreightItem[] = [];

  console.log('Available sheets:', workbook.SheetNames);

  // Check first 3 sheets for commodity and freight data
  const sheetsToCheck = workbook.SheetNames.slice(0, 3);

  for (const sheetName of sheetsToCheck) {
    const sheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });

    console.log(`Checking sheet "${sheetName}" with ${data.length} rows`);

    if (data.length === 0) continue;

    // Log column names for debugging
    const columnNames = Object.keys(data[0]);
    console.log(`  Columns: ${columnNames.join(', ')}`);

    // Try to determine what type of sheet this is
    const isCommodity = isCommoditySheet(data);
    const isFreight = isFreightSheet(data);

    console.log(`  Detection: isCommodity=${isCommodity}, isFreight=${isFreight}`);

    // CRITICAL: A sheet should never be BOTH commodity AND freight
    if (isCommodity && isFreight) {
      console.error(`⚠️  ERROR: Sheet "${sheetName}" detected as BOTH commodity and freight!`);
      console.error(`  This should never happen. Treating as commodity only.`);
    }

    if (isCommodity) {
      // Parse as commodity sheet
      console.log(`  Parsing as COMMODITY sheet`);
      for (const row of data) {
        const orderNumber = String(
          findColumn(row, ['Order ID', 'OrderID', 'order id', 'order_id', '订单号', '订单编号', 'Order Number']) || ''
        ).trim();

        if (!orderNumber) continue;

        const priceCny = parseFloat(
          findColumn(row, ['Price', 'price', 'Unit Price', 'unit price', '单价', '价格']) || 0
        );
        const domesticFreightCny = parseFloat(
          findColumn(row, ['Domestic Freight', 'domestic freight', 'Domestic Shipping', '国内运费', '国内物流']) || 0
        );
        const totalCny = parseFloat(
          findColumn(row, ['Total', 'total', 'Amount', 'amount', '合计', '总计', '总金额', '总价']) || 0
        );

        const item: CommodityItem = {
          upload_id: uploadId,
          time: parseExcelDate(findColumn(row, ['Time', 'time', 'Date', 'date', '时间', '日期'])),
          order_number: orderNumber,
          sku: findColumn(row, ['SKU', 'sku', 'Sku', '货号', '商品编号']) || null,
          price_cny: priceCny,
          price_usd: priceCny * CNY_TO_USD_RATE,
          domestic_freight_cny: domesticFreightCny,
          domestic_freight_usd: domesticFreightCny * CNY_TO_USD_RATE,
          total_cny: totalCny,
          total_usd: totalCny * CNY_TO_USD_RATE,
        };

        commodityItems.push(item);
      }
    }

    if (isFreight && !isCommodity) {
      // Parse as freight sheet (ONLY if not also detected as commodity)
      console.log(`  Parsing as FREIGHT sheet`);
      let skippedRows = 0;
      let zeroCostRows = 0;

      for (const row of data) {
        const rawOrderNumber = findColumn(row, ['Order ID', 'OrderID', 'order id', 'order_id', '订单号', '订单编号', 'Order Number']);
        const orderNumber = String(rawOrderNumber || '').trim();

        // Skip rows without valid order numbers
        if (!orderNumber || orderNumber.length === 0) {
          skippedRows++;
          continue;
        }

        // Skip rows where order number is just whitespace or placeholder values
        const normalized = orderNumber.toLowerCase().replace(/\s+/g, '');
        if (normalized === 'n/a' || normalized === 'na' || normalized === '-' || normalized === '/' || normalized === '#') {
          console.log(`⚠️  Skipping freight row with placeholder order number: "${orderNumber}"`);
          skippedRows++;
          continue;
        }

        const internationalShippingCny = parseFloat(
          findColumn(row, [
            'International Shipping',
            'international shipping',
            'Int Shipping',
            'Shipping',
            'Freight',
            '国际运费',
            '国际物流',
            '运费'
          ]) || 0
        );

        // Service fee is in CNY in the Excel file, need to convert to USD
        const serviceFeeCny = parseFloat(
          findColumn(row, ['Service Fee', 'service fee', 'Fee', 'fee', '服务费']) || 0
        );
        const serviceFeeUsd = serviceFeeCny * CNY_TO_USD_RATE;

        // Skip rows with zero international shipping AND zero service fee (useless data)
        if (internationalShippingCny === 0 && serviceFeeCny === 0) {
          console.log(`⚠️  Skipping freight row for order ${orderNumber} with zero costs`);
          zeroCostRows++;
          continue;
        }

        // CRITICAL: Skip rows with zero international shipping (even if service fee exists)
        // This ensures only orders with actual international shipping are included
        if (internationalShippingCny === 0) {
          console.log(`⚠️  Skipping freight row for order ${orderNumber} - zero international shipping (only service fee: ¥${serviceFeeCny})`);
          zeroCostRows++;
          continue;
        }

        const item: FreightItem = {
          upload_id: uploadId,
          time: parseExcelDate(findColumn(row, ['Time', 'time', 'Date', 'date', '时间', '日期'])),
          order_number: orderNumber,
          weight: parseFloat(findColumn(row, ['Weight', 'weight', '重量']) || 0) || undefined,
          international_shipping_cny: internationalShippingCny,
          international_shipping_usd: internationalShippingCny * CNY_TO_USD_RATE,
          service_fee_usd: serviceFeeUsd,
        };

        freightItems.push(item);
      }

      if (skippedRows > 0) {
        console.log(`⚠️  Skipped ${skippedRows} freight rows with invalid/missing order numbers`);
      }
      if (zeroCostRows > 0) {
        console.log(`⚠️  Skipped ${zeroCostRows} freight rows with zero international shipping`);
      }
    }
  }

  console.log(`\n✅ Parsing complete:`);
  console.log(`   📦 ${commodityItems.length} commodity items`);
  console.log(`   ✈️  ${freightItems.length} freight items`);

  if (freightItems.length === 0) {
    console.log(`\n⚠️  No freight items found. This invoice only contains commodity data.`);
    console.log(`   Orders from this invoice will NOT appear in profitability view.`);
  }

  return {
    commodityItems,
    freightItems,
  };
}

/**
 * Parse Excel date format to ISO string
 */
function parseExcelDate(value: any): string {
  if (!value) return new Date().toISOString();

  // If it's already a date string
  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  // If it's an Excel date number
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    return new Date(date.y, date.m - 1, date.d, date.H, date.M, date.S).toISOString();
  }

  // If it's already a Date object
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date().toISOString();
}

/**
 * Validate XLS file structure - now very lenient
 */
export function validateInvoiceFile(fileBuffer: Buffer): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    if (workbook.SheetNames.length === 0) {
      errors.push('File contains no sheets');
      return { valid: false, errors };
    }

    // Check if at least one sheet has data
    let hasAnyData = false;
    for (const sheetName of workbook.SheetNames.slice(0, 3)) {
      const sheet = workbook.Sheets[sheetName];
      const data: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });
      if (data.length > 0) {
        hasAnyData = true;
        break;
      }
    }

    if (!hasAnyData) {
      errors.push('File contains no parseable data in the first 3 sheets');
    }

    // Don't validate specific columns - let the parser handle it
  } catch (error: any) {
    errors.push(`Error parsing file: ${error.message}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
