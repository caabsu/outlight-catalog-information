import * as XLSX from 'xlsx';
import { CommodityItem, FreightItem, ParsedInvoiceData } from './types';

const CNY_TO_USD_RATE = parseFloat(process.env.CNY_TO_USD_RATE || '0.138');

/**
 * Parse XLS/XLSX file and extract commodity and freight data
 */
export function parseInvoiceFile(fileBuffer: Buffer, uploadId: number): ParsedInvoiceData {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

  const commodityItems: CommodityItem[] = [];
  const freightItems: FreightItem[] = [];

  // Parse "commodity" sheet
  if (workbook.SheetNames.includes('commodity')) {
    const commoditySheet = workbook.Sheets['commodity'];
    const commodityData: any[] = XLSX.utils.sheet_to_json(commoditySheet, { defval: null });

    for (const row of commodityData) {
      // Skip empty rows
      if (!row['Order ID'] && !row['order id'] && !row['OrderID']) continue;

      const orderNumber = String(row['Order ID'] || row['order id'] || row['OrderID'] || '').trim();
      if (!orderNumber) continue;

      const priceCny = parseFloat(row['Price'] || row['price'] || 0);
      const domesticFreightCny = parseFloat(row['Domestic Freight'] || row['domestic freight'] || 0);
      const totalCny = parseFloat(row['Total'] || row['total'] || 0);

      const item: CommodityItem = {
        upload_id: uploadId,
        time: parseExcelDate(row['Time'] || row['time']),
        order_number: orderNumber,
        sku: row['SKU'] || row['sku'] || null,
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

  // Parse "freight" sheet
  if (workbook.SheetNames.includes('freight')) {
    const freightSheet = workbook.Sheets['freight'];
    const freightData: any[] = XLSX.utils.sheet_to_json(freightSheet, { defval: null });

    for (const row of freightData) {
      // Skip empty rows
      if (!row['Order ID'] && !row['order id'] && !row['OrderID']) continue;

      const orderNumber = String(row['Order ID'] || row['order id'] || row['OrderID'] || '').trim();
      if (!orderNumber) continue;

      const internationalShippingCny = parseFloat(row['International Shipping'] || row['international shipping'] || 0);
      const serviceFee = parseFloat(row['Service Fee'] || row['service fee'] || 15);

      const item: FreightItem = {
        upload_id: uploadId,
        time: parseExcelDate(row['Time'] || row['time']),
        order_number: orderNumber,
        weight: parseFloat(row['Weight'] || row['weight'] || 0) || undefined,
        international_shipping_cny: internationalShippingCny,
        international_shipping_usd: internationalShippingCny * CNY_TO_USD_RATE,
        service_fee_usd: serviceFee,
      };

      freightItems.push(item);
    }
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
 * Validate XLS file structure
 */
export function validateInvoiceFile(fileBuffer: Buffer): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    // Check for required sheets
    if (!workbook.SheetNames.includes('commodity')) {
      errors.push('Missing required sheet: "commodity"');
    }

    if (!workbook.SheetNames.includes('freight')) {
      errors.push('Missing required sheet: "freight"');
    }

    // Validate commodity sheet columns
    if (workbook.SheetNames.includes('commodity')) {
      const commoditySheet = workbook.Sheets['commodity'];
      const commodityData: any[] = XLSX.utils.sheet_to_json(commoditySheet, { defval: null });

      if (commodityData.length === 0) {
        errors.push('Commodity sheet is empty');
      } else {
        const firstRow = commodityData[0];
        const requiredColumns = ['Order ID', 'Total'];

        for (const col of requiredColumns) {
          if (!(col in firstRow) && !(col.toLowerCase() in firstRow)) {
            errors.push(`Missing required column in commodity sheet: "${col}"`);
          }
        }
      }
    }

    // Validate freight sheet columns
    if (workbook.SheetNames.includes('freight')) {
      const freightSheet = workbook.Sheets['freight'];
      const freightData: any[] = XLSX.utils.sheet_to_json(freightSheet, { defval: null });

      if (freightData.length === 0) {
        errors.push('Freight sheet is empty');
      } else {
        const firstRow = freightData[0];
        const requiredColumns = ['Order ID'];

        for (const col of requiredColumns) {
          if (!(col in firstRow) && !(col.toLowerCase() in firstRow)) {
            errors.push(`Missing required column in freight sheet: "${col}"`);
          }
        }
      }
    }
  } catch (error: any) {
    errors.push(`Error parsing file: ${error.message}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
