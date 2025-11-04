'use client';

import { useState } from 'react';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setResult({ success: false, message: 'Please select a file first' });
      return;
    }

    try {
      setUploading(true);
      setResult(null);

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/invoice/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        setResult({
          success: true,
          message: `Successfully uploaded! Processed ${data.commodityCount} commodity items and ${data.freightCount} freight items.`,
        });
        setFile(null);
        // Reset file input
        const fileInput = document.getElementById('file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        setResult({
          success: false,
          message: data.error || 'Upload failed',
        });
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      setResult({
        success: false,
        message: error.message || 'An error occurred during upload',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Upload Invoice</h1>
        <p className="mt-2 text-gray-600">
          Upload XLS/XLSX files containing order cost information
        </p>
      </div>

      {/* Upload Form */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Invoice File
            </label>
            <input
              id="file-input"
              type="file"
              accept=".xls,.xlsx"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                cursor-pointer"
            />
            {file && (
              <p className="mt-2 text-sm text-gray-600">
                Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className={`w-full py-3 px-4 rounded-lg font-medium text-white ${
              !file || uploading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {uploading ? 'Uploading...' : 'Upload Invoice'}
          </button>

          {result && (
            <div
              className={`p-4 rounded-lg ${
                result.success
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}
            >
              {result.message}
            </div>
          )}
        </div>
      </div>

      {/* File Format Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-blue-900 mb-3">File Format Requirements</h2>
        <div className="space-y-4 text-sm text-blue-800">
          <div>
            <h3 className="font-semibold mb-2">Required Tabs:</h3>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>
                <strong>"commodity"</strong> tab with columns:
                <ul className="list-circle list-inside ml-6 mt-1">
                  <li>Time - Fulfillment time</li>
                  <li>Order ID - Shopify order number</li>
                  <li>SKU - Product SKU (optional)</li>
                  <li>Price - Unit price in CNY</li>
                  <li>Domestic Freight - Domestic shipping in CNY</li>
                  <li>Total - Total cost in CNY</li>
                </ul>
              </li>
              <li className="mt-2">
                <strong>"freight"</strong> tab with columns:
                <ul className="list-circle list-inside ml-6 mt-1">
                  <li>Time - Shipping time</li>
                  <li>Order ID - Shopify order number</li>
                  <li>Weight - Package weight (optional)</li>
                  <li>International Shipping - International shipping cost in CNY</li>
                  <li>Service Fee - Service fee (default: $15)</li>
                </ul>
              </li>
            </ul>
          </div>
          <div className="mt-4 p-3 bg-blue-100 rounded">
            <p className="font-semibold">Note:</p>
            <p className="mt-1">All CNY amounts will be automatically converted to USD using the rate: 1 CNY = $0.138</p>
          </div>
        </div>
      </div>
    </div>
  );
}
