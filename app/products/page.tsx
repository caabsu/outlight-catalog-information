'use client';

import { useEffect, useState } from 'react';
import { ProductCostAnalysis } from '@/lib/types';

type TabType = 'all' | 'high-margin' | 'low-margin' | 'top-sellers';
type SortField = 'sku' | 'product_title' | 'order_count' | 'total_quantity_sold' | 'avg_selling_price_usd' | 'avg_unit_cost_usd' | 'avg_profit_per_unit_usd';
type SortOrder = 'asc' | 'desc';

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductCostAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Filters and pagination
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [sortField, setSortField] = useState<SortField>('total_quantity_sold');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(25);
  const [hideZeroCost, setHideZeroCost] = useState(false);

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

  // Calculate profit margin for filtering
  const getMarginPercentage = (product: ProductCostAnalysis): number => {
    if (!product.avg_selling_price_usd || product.avg_selling_price_usd === 0) return 0;
    const profit = product.avg_profit_per_unit_usd || 0;
    const price = product.avg_selling_price_usd || 0;
    return (profit / price) * 100;
  };

  // Filter products based on active tab and filters
  const getFilteredProducts = () => {
    let filtered = [...products];

    // Tab filter
    switch (activeTab) {
      case 'high-margin':
        filtered = filtered.filter(p => getMarginPercentage(p) >= 30);
        break;
      case 'low-margin':
        filtered = filtered.filter(p => {
          const margin = getMarginPercentage(p);
          return margin > 0 && margin < 15;
        });
        break;
      case 'top-sellers':
        filtered = filtered.filter(p => (p.total_quantity_sold || 0) >= 10);
        break;
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(product =>
        product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.product_title?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Hide zero cost filter
    if (hideZeroCost) {
      filtered = filtered.filter(p => (p.avg_unit_cost_usd || 0) > 0);
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'sku' || sortField === 'product_title') {
        // String comparison
        aVal = String(aVal || '');
        bVal = String(bVal || '');
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      } else {
        // Numeric comparison
        aVal = Number(aVal || 0);
        bVal = Number(bVal || 0);
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
    });

    return filtered;
  };

  const filteredProducts = getFilteredProducts();

  // Pagination
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  const getProfitColor = (profitPerUnit: number) => {
    if (profitPerUnit >= 10) return 'text-emerald-600 bg-emerald-50';
    if (profitPerUnit >= 5) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  const handleColumnSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle sort order if clicking the same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field and default to descending
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    if (sortOrder === 'asc') {
      return (
        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      );
    }
    return (
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Products Analysis</h1>
          <p className="mt-2 text-gray-600">
            {filteredProducts.length} products • {filteredProducts.reduce((sum, p) => sum + (p.total_quantity_sold || 0), 0)} units sold
          </p>
        </div>
        <button
          onClick={fetchProducts}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'all', label: 'All Products', count: products.length },
            { id: 'high-margin', label: 'High Margin (30%+)', count: products.filter(p => getMarginPercentage(p) >= 30).length },
            { id: 'low-margin', label: 'Low Margin (<15%)', count: products.filter(p => {
              const margin = getMarginPercentage(p);
              return margin > 0 && margin < 15;
            }).length },
            { id: 'top-sellers', label: 'Top Sellers (10+ units)', count: products.filter(p => (p.total_quantity_sold || 0) >= 10).length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as TabType);
                setCurrentPage(1);
              }}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {tab.label}
              <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                activeTab === tab.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Products</label>
            <input
              type="text"
              placeholder="Search by SKU or product name..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Sort */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              value={`${sortField}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortField(field as SortField);
                setSortOrder(order as SortOrder);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="total_quantity_sold-desc">Units Sold (High)</option>
              <option value="total_quantity_sold-asc">Units Sold (Low)</option>
              <option value="order_count-desc">Order Count (High)</option>
              <option value="order_count-asc">Order Count (Low)</option>
              <option value="avg_selling_price_usd-desc">Price (High)</option>
              <option value="avg_selling_price_usd-asc">Price (Low)</option>
              <option value="avg_unit_cost_usd-desc">Cost (High)</option>
              <option value="avg_unit_cost_usd-asc">Cost (Low)</option>
              <option value="avg_profit_per_unit_usd-desc">Profit/Unit (High)</option>
              <option value="avg_profit_per_unit_usd-asc">Profit/Unit (Low)</option>
              <option value="sku-asc">SKU (A-Z)</option>
              <option value="sku-desc">SKU (Z-A)</option>
              <option value="product_title-asc">Name (A-Z)</option>
              <option value="product_title-desc">Name (Z-A)</option>
            </select>
          </div>
        </div>

        {/* Hide Zero Cost Toggle */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={hideZeroCost}
              onChange={(e) => {
                setHideZeroCost(e.target.checked);
                setCurrentPage(1);
              }}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="ml-2 text-sm font-medium text-gray-700">
              Hide products with $0 cost (no invoice data)
            </span>
          </label>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading products...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No products found matching your filters.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleColumnSort('product_title')}
                    >
                      <div className="flex items-center gap-1">
                        Product
                        {getSortIcon('product_title')}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleColumnSort('order_count')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Orders
                        {getSortIcon('order_count')}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleColumnSort('total_quantity_sold')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Units Sold
                        {getSortIcon('total_quantity_sold')}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleColumnSort('avg_selling_price_usd')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <div className="text-right">
                          Customer Paid<br />
                          <span className="text-xs font-normal text-gray-400">(after discount)</span>
                        </div>
                        {getSortIcon('avg_selling_price_usd')}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleColumnSort('avg_unit_cost_usd')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <div className="text-right">
                          Unit Cost<br />
                          <span className="text-xs font-normal text-gray-400">(our cost)</span>
                        </div>
                        {getSortIcon('avg_unit_cost_usd')}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleColumnSort('avg_profit_per_unit_usd')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Profit/Unit
                        {getSortIcon('avg_profit_per_unit_usd')}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Margin %
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedProducts.map((product) => {
                    const margin = getMarginPercentage(product);
                    return (
                      <tr key={product.sku} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div>
                              <div className="text-sm font-bold text-gray-900">
                                {product.product_title}
                              </div>
                              <div className="text-sm text-gray-500">
                                SKU: {product.sku}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          {product.order_count || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-semibold">
                          {product.total_quantity_sold || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          <div className="font-semibold">${product.avg_selling_price_usd?.toFixed(2) || '0.00'}</div>
                          {product.avg_listed_price_usd && product.avg_listed_price_usd !== product.avg_selling_price_usd && (
                            <div className="text-xs text-gray-500 line-through">
                              ${product.avg_listed_price_usd.toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          <div className="font-semibold">${product.avg_unit_cost_usd?.toFixed(2) || '0.00'}</div>
                          <div className="text-xs text-gray-500">
                            ¥{product.avg_unit_cost_cny?.toFixed(2) || '0.00'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getProfitColor(product.avg_profit_per_unit_usd || 0)}`}>
                            ${product.avg_profit_per_unit_usd?.toFixed(2) || '0.00'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            margin >= 30 ? 'text-emerald-600 bg-emerald-50' : margin >= 15 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'
                          }`}>
                            {margin.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                  <span className="font-medium">{Math.min(endIndex, filteredProducts.length)}</span> of{' '}
                  <span className="font-medium">{filteredProducts.length}</span> results
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {[...Array(Math.min(5, totalPages))].map((_, i) => {
                      const pageNum = i + 1;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium ${
                            currentPage === pageNum
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    {totalPages > 5 && <span className="px-2 text-gray-500">...</span>}
                  </div>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </>
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
            <p className="mt-2 text-3xl font-semibold text-emerald-600">
              ${(filteredProducts.reduce((sum, p) => sum + (p.avg_profit_per_unit_usd || 0), 0) / filteredProducts.length).toFixed(2)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
