'use client';

import { useState } from 'react';

export default function SyncPage() {
  const [syncing, setSyncing] = useState({ orders: false, products: false });
  const [results, setResults] = useState<{
    orders?: { success: boolean; message: string };
    products?: { success: boolean; message: string };
  }>({});

  const syncOrders = async () => {
    try {
      setSyncing({ ...syncing, orders: true });
      setResults({ ...results, orders: undefined });

      const res = await fetch('/api/shopify/sync-orders', {
        method: 'POST',
      });

      const data = await res.json();

      if (data.success) {
        setResults({
          ...results,
          orders: {
            success: true,
            message: `Successfully synced ${data.ordersCount} orders and ${data.lineItemsCount} line items`,
          },
        });
      } else {
        setResults({
          ...results,
          orders: {
            success: false,
            message: data.error || 'Sync failed',
          },
        });
      }
    } catch (error: any) {
      console.error('Sync error:', error);
      setResults({
        ...results,
        orders: {
          success: false,
          message: error.message || 'An error occurred during sync',
        },
      });
    } finally {
      setSyncing({ ...syncing, orders: false });
    }
  };

  const syncProducts = async () => {
    try {
      setSyncing({ ...syncing, products: true });
      setResults({ ...results, products: undefined });

      const res = await fetch('/api/shopify/sync-products', {
        method: 'POST',
      });

      const data = await res.json();

      if (data.success) {
        setResults({
          ...results,
          products: {
            success: true,
            message: `Successfully synced ${data.productsCount} products and ${data.variantsCount} variants`,
          },
        });
      } else {
        setResults({
          ...results,
          products: {
            success: false,
            message: data.error || 'Sync failed',
          },
        });
      }
    } catch (error: any) {
      console.error('Sync error:', error);
      setResults({
        ...results,
        products: {
          success: false,
          message: error.message || 'An error occurred during sync',
        },
      });
    } finally {
      setSyncing({ ...syncing, products: false });
    }
  };

  const syncAll = async () => {
    await syncOrders();
    await syncProducts();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Sync Shopify Data</h1>
        <p className="mt-2 text-gray-600">
          Fetch and update orders and products from your Shopify store
        </p>
      </div>

      {/* Sync All Button */}
      <div className="bg-white rounded-lg shadow p-6">
        <button
          onClick={syncAll}
          disabled={syncing.orders || syncing.products}
          className={`w-full py-4 px-6 rounded-lg font-semibold text-white text-lg ${
            syncing.orders || syncing.products
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {syncing.orders || syncing.products ? 'Syncing...' : 'Sync All Data'}
        </button>
      </div>

      {/* Individual Sync Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Orders Sync */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <svg
                className="w-8 h-8 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
            </div>
            <div className="ml-4">
              <h2 className="text-xl font-semibold text-gray-900">Sync Orders</h2>
              <p className="text-sm text-gray-600">Fetch all orders from Shopify</p>
            </div>
          </div>

          <button
            onClick={syncOrders}
            disabled={syncing.orders}
            className={`w-full py-3 px-4 rounded-lg font-medium text-white ${
              syncing.orders
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {syncing.orders ? 'Syncing Orders...' : 'Sync Orders'}
          </button>

          {results.orders && (
            <div
              className={`mt-4 p-4 rounded-lg ${
                results.orders.success
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}
            >
              {results.orders.message}
            </div>
          )}
        </div>

        {/* Products Sync */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
            <div className="ml-4">
              <h2 className="text-xl font-semibold text-gray-900">Sync Products</h2>
              <p className="text-sm text-gray-600">Fetch all products from Shopify</p>
            </div>
          </div>

          <button
            onClick={syncProducts}
            disabled={syncing.products}
            className={`w-full py-3 px-4 rounded-lg font-medium text-white ${
              syncing.products
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {syncing.products ? 'Syncing Products...' : 'Sync Products'}
          </button>

          {results.products && (
            <div
              className={`mt-4 p-4 rounded-lg ${
                results.products.success
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}
            >
              {results.products.message}
            </div>
          )}
        </div>
      </div>

      {/* Information */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-yellow-900 mb-2">Important Notes</h2>
        <ul className="list-disc list-inside space-y-2 text-sm text-yellow-800">
          <li>Syncing may take several minutes depending on the number of orders and products</li>
          <li>All existing data will be updated with the latest information from Shopify</li>
          <li>It's recommended to sync both orders and products before uploading invoices</li>
          <li>You can sync data as often as needed to keep everything up to date</li>
        </ul>
      </div>
    </div>
  );
}
