import { NextRequest, NextResponse } from 'next/server';
import { parseInvoiceFile, validateInvoiceFile } from '@/lib/xlsx-parser';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate file
    const validation = validateInvoiceFile(buffer);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: 'Invalid file format', errors: validation.errors },
        { status: 400 }
      );
    }

    // Create upload record
    const { data: uploadRecord, error: uploadError } = await supabaseAdmin
      .from('invoice_uploads')
      .insert({
        filename: file.name,
        upload_date: new Date().toISOString(),
        processed: false,
      })
      .select()
      .single();

    if (uploadError || !uploadRecord) {
      console.error('Error creating upload record:', uploadError);
      throw new Error('Failed to create upload record');
    }

    // Parse file
    const { commodityItems, freightItems } = parseInvoiceFile(buffer, uploadRecord.id);

    // Insert commodity items
    if (commodityItems.length > 0) {
      const { error: commodityError } = await supabaseAdmin
        .from('invoice_commodity_items')
        .insert(commodityItems);

      if (commodityError) {
        console.error('Error inserting commodity items:', commodityError);
        throw commodityError;
      }
    }

    // Insert freight items
    if (freightItems.length > 0) {
      const { error: freightError } = await supabaseAdmin
        .from('invoice_freight_items')
        .insert(freightItems);

      if (freightError) {
        console.error('Error inserting freight items:', freightError);
        throw freightError;
      }
    }

    // Update upload record
    const { error: updateError } = await supabaseAdmin
      .from('invoice_uploads')
      .update({
        processed: true,
        row_count_commodity: commodityItems.length,
        row_count_freight: freightItems.length,
      })
      .eq('id', uploadRecord.id);

    if (updateError) {
      console.error('Error updating upload record:', updateError);
    }

    return NextResponse.json({
      success: true,
      uploadId: uploadRecord.id,
      commodityCount: commodityItems.length,
      freightCount: freightItems.length,
    });
  } catch (error: any) {
    console.error('Error processing invoice upload:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
