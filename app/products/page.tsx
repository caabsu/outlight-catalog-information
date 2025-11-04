'use client';

import { useEffect, useState } from 'react';
import { ProductCostAnalysis } from '@/lib/types';

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductCostAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    try {
      setLoading(true);
      const res = await fetch('/api/analysis/products');
      const data = await res.json();

      if (data.success) {
        setProducts(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredProducts = products.filter(product =>
    product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.product_title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getProfitColor = (profitPerUnit: number) => {
    if (profitPerUnit >= 10) return 'text-green-600';
    if (profitPerUnit >= 5) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Products Analysis</h1>
        <p className="mt-2 text-gray-600">
          View aggregated cost and profit data by product SKU
        </p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow p-4">
        <input
          type="text"
          placeholder="Search by SKU or product name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading products...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No products found. Please sync Shopify data and upload invoices.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Orders
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Units Sold
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg Selling Price
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg Unit Cost
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg Profit/Unit
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredProducts.map((product) => (
                  <tr key={product.sku} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {product.product_title}
                      </div>
                      <div className="text-sm text-gray-500">
                        SKU: {product.sku}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {product.order_count || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                      {product.total_quantity_sold || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      ${product.avg_selling_price_usd?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      <div>${product.avg_unit_cost_usd?.toFixed(2) || '0.00'}</div>
                      <div className="text-xs text-gray-500">
                        ¥{product.avg_unit_cost_cny?.toFixed(2) || '0.00'}
                      </div>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-semibold ${getProfitColor(product.avg_profit_per_unit_usd || 0)}`}>
                      ${product.avg_profit_per_unit_usd?.toFixed(2) || '0.00'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {filteredProducts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600">Total Products</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">
              {filteredProducts.length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600">Total Units Sold</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">
              {filteredProducts.reduce((sum, p) => sum + (p.total_quantity_sold || 0), 0)}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600">Avg Selling Price</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">
              ${(filteredProducts.reduce((sum, p) => sum + (p.avg_selling_price_usd || 0), 0) / filteredProducts.length).toFixed(2)}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600">Avg Profit/Unit</p>
            <p className="mt-2 text-3xl font-semibold text-green-600">
              ${(filteredProducts.reduce((sum, p) => sum + (p.avg_profit_per_unit_usd || 0), 0) / filteredProducts.length).toFixed(2)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
