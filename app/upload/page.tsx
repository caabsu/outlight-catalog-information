'use client';

import { useState } from 'react';

interface UploadResult {
  fileName: string;
  success: boolean;
  message: string;
  commodityCount?: number;
  freightCount?: number;
}

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [currentFile, setCurrentFile] = useState<string>('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles(selectedFiles);
      setResults([]);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setResults([{ fileName: '', success: false, message: 'Please select at least one file' }]);
      return;
    }

    try {
      setUploading(true);
      setResults([]);
      const uploadResults: UploadResult[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCurrentFile(`Uploading ${i + 1}/${files.length}: ${file.name}`);

        const formData = new FormData();
        formData.append('file', file);

        try {
          const res = await fetch('/api/invoice/upload', {
            method: 'POST',
            body: formData,
          });

          const data = await res.json();

          if (data.success) {
            uploadResults.push({
              fileName: file.name,
              success: true,
              message: `Processed ${data.commodityCount} commodity items and ${data.freightCount} freight items`,
              commodityCount: data.commodityCount,
              freightCount: data.freightCount,
            });
          } else {
            uploadResults.push({
              fileName: file.name,
              success: false,
              message: data.error || 'Upload failed',
            });
          }
        } catch (error: any) {
          uploadResults.push({
            fileName: file.name,
            success: false,
            message: error.message || 'An error occurred during upload',
          });
        }

        setResults([...uploadResults]);
      }

      setCurrentFile('');
      setFiles([]);
      // Reset file input
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (error: any) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  const totalCommodityItems = results.reduce((sum, r) => sum + (r.commodityCount || 0), 0);
  const totalFreightItems = results.reduce((sum, r) => sum + (r.freightCount || 0), 0);
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Upload Invoices</h1>
        <p className="mt-2 text-gray-600">
          Upload one or multiple XLS/XLSX files containing order cost information
        </p>
      </div>

      {/* Upload Form */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Invoice Files (supports multiple selection)
            </label>
            <input
              id="file-input"
              type="file"
              accept=".xls,.xlsx"
              multiple
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                cursor-pointer"
            />
            {files.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-sm font-medium text-gray-700">
                  Selected {files.length} file{files.length > 1 ? 's' : ''}:
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {files.map((file, idx) => (
                    <p key={idx} className="text-sm text-gray-600 pl-2">
                      • {file.name} ({(file.size / 1024).toFixed(2)} KB)
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {currentFile && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              {currentFile}
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
            className={`w-full py-3 px-4 rounded-lg font-medium text-white ${
              files.length === 0 || uploading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {uploading ? 'Uploading...' : `Upload ${files.length} Invoice${files.length > 1 ? 's' : ''}`}
          </button>

          {results.length > 0 && (
            <div className="space-y-3">
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs text-green-600 font-medium">Success</p>
                  <p className="text-2xl font-bold text-green-700">{successCount}</p>
                </div>
                {failCount > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-600 font-medium">Failed</p>
                    <p className="text-2xl font-bold text-red-700">{failCount}</p>
                  </div>
                )}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-600 font-medium">Commodity Items</p>
                  <p className="text-2xl font-bold text-blue-700">{totalCommodityItems}</p>
                </div>
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <p className="text-xs text-purple-600 font-medium">Freight Items</p>
                  <p className="text-2xl font-bold text-purple-700">{totalFreightItems}</p>
                </div>
              </div>

              {/* Detailed Results */}
              <div className="space-y-2">
                {results.map((result, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg ${
                      result.success
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-red-50 border border-red-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className={`font-semibold ${
                          result.success ? 'text-green-900' : 'text-red-900'
                        }`}>
                          {result.fileName}
                        </p>
                        <p className={`text-sm mt-1 ${
                          result.success ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {result.message}
                        </p>
                      </div>
                      <div className="ml-4">
                        {result.success ? (
                          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
            <p className="mt-1">Column names are flexible - the system will match variations including Chinese characters.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
