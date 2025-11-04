'use client';

import { useEffect, useState } from 'react';
import { ProductProfitabilitySummary, SKUProfitabilitySummary } from '@/lib/types';

type SortField =
  | 'total_revenue_usd'
  | 'total_profit_usd'
  | 'overall_profit_margin_pct'
  | 'avg_profit_per_unit_usd'
  | 'total_units_sold'
  | 'avg_confidence_score'
  | 'unique_sku_count';

export default function ItemsPage() {
  const [products, setProducts] = useState<ProductProfitabilitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [skuData, setSkuData] = useState<Map<string, SKUProfitabilitySummary[]>>(new Map());
  const [loadingSKUs, setLoadingSKUs] = useState<Set<string>>(new Set());

  // Filtering
  const [activeTab, setActiveTab] = useState<'all' | 'high_confidence' | 'profitable' | 'low_margin'>('all');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('total_revenue_usd');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/analysis/products-summary');
      const result = await response.json();

      if (result.success) {
        setProducts(result.data);
      } else {
        setError(result.error || 'Failed to fetch products');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSKUsForProduct = async (productTitle: string) => {
    if (skuData.has(productTitle)) {
      // Already loaded
      return;
    }

    setLoadingSKUs(prev => new Set(prev).add(productTitle));

    try {
      const response = await fetch(`/api/analysis/product-skus?product_title=${encodeURIComponent(productTitle)}`);
      const result = await response.json();

      if (result.success) {
        setSkuData(prev => new Map(prev).set(productTitle, result.data));
      }
    } catch (err: any) {
      console.error('Error fetching SKUs:', err);
    } finally {
      setLoadingSKUs(prev => {
        const next = new Set(prev);
        next.delete(productTitle);
        return next;
      });
    }
  };

  const toggleProduct = async (productTitle: string) => {
    const isExpanded = expandedProducts.has(productTitle);

    if (isExpanded) {
      // Collapse
      setExpandedProducts(prev => {
        const next = new Set(prev);
        next.delete(productTitle);
        return next;
      });
    } else {
      // Expand
      setExpandedProducts(prev => new Set(prev).add(productTitle));
      await fetchSKUsForProduct(productTitle);
    }
  };

  // Filter products based on active tab
  const filteredProducts = products.filter(product => {
    switch (activeTab) {
      case 'high_confidence':
        return product.avg_confidence_score >= 70;
      case 'profitable':
        return product.overall_profit_margin_pct >= 20;
      case 'low_margin':
        return product.overall_profit_margin_pct < 10;
      default:
        return true;
    }
  });

  // Sort products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];

    if (aVal === null || aVal === undefined) aVal = 0;
    if (bVal === null || bVal === undefined) bVal = 0;

    if (sortDirection === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  // Paginate
  const totalPages = Math.ceil(sortedProducts.length / itemsPerPage);
  const paginatedProducts = sortedProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Calculate summary stats
  const stats = {
    totalProducts: filteredProducts.length,
    totalRevenue: filteredProducts.reduce((sum, p) => sum + p.total_revenue_usd, 0),
    totalProfit: filteredProducts.reduce((sum, p) => sum + p.total_profit_usd, 0),
    avgConfidence: filteredProducts.reduce((sum, p) => sum + p.avg_confidence_score, 0) / (filteredProducts.length || 1),
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const getConfidenceBadge = (score: number) => {
    if (score >= 90) return { label: '100%', color: 'bg-green-100 text-green-800' };
    if (score >= 80) return { label: '80%+', color: 'bg-blue-100 text-blue-800' };
    if (score >= 70) return { label: '70%+', color: 'bg-yellow-100 text-yellow-800' };
    return { label: 'Low', color: 'bg-gray-100 text-gray-800' };
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center">
          <div className="text-lg">Loading product profitability data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold">Error</h3>
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-gray-900">Product Profitability Analysis</h1>
          <button
            onClick={() => fetchProducts()}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <span>{loading ? 'Refreshing...' : '🔄 Refresh Data'}</span>
          </button>
        </div>
        <p className="text-gray-600">
          Grouped by product with collapsible SKU details. Only includes products with clean invoice data (single-SKU orders).
        </p>
        {products.length === 0 && !loading && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-yellow-800 font-semibold">No products found with clean invoice data</p>
            <p className="text-yellow-700 text-sm mt-1">
              This could mean: (1) No invoices uploaded yet, (2) No single-SKU orders with invoice data, or (3) Views need to be created.
              Check the diagnostic SQL below or try uploading invoices.
            </p>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Products</div>
          <div className="text-2xl font-bold text-gray-900">{stats.totalProducts}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Revenue</div>
          <div className="text-2xl font-bold text-green-600">
            ${stats.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Profit</div>
          <div className={`text-2xl font-bold ${stats.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${stats.totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Avg Confidence</div>
          <div className="text-2xl font-bold text-blue-600">
            {stats.avgConfidence.toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex space-x-8">
          <button
            onClick={() => { setActiveTab('all'); setCurrentPage(1); }}
            className={`pb-4 px-2 border-b-2 font-medium ${
              activeTab === 'all'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            All Products ({products.length})
          </button>
          <button
            onClick={() => { setActiveTab('high_confidence'); setCurrentPage(1); }}
            className={`pb-4 px-2 border-b-2 font-medium ${
              activeTab === 'high_confidence'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            High Confidence (70%+)
          </button>
          <button
            onClick={() => { setActiveTab('profitable'); setCurrentPage(1); }}
            className={`pb-4 px-2 border-b-2 font-medium ${
              activeTab === 'profitable'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Profitable (20%+ margin)
          </button>
          <button
            onClick={() => { setActiveTab('low_margin'); setCurrentPage(1); }}
            className={`pb-4 px-2 border-b-2 font-medium ${
              activeTab === 'low_margin'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Low Margin (&lt;10%)
          </button>
        </div>
      </div>

      {/* Sort Controls */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-600">Sort by:</span>
          <select
            value={sortField}
            onChange={(e) => handleSort(e.target.value as SortField)}
            className="border border-gray-300 rounded px-3 py-1 text-sm"
          >
            <option value="total_revenue_usd">Total Revenue</option>
            <option value="total_profit_usd">Total Profit</option>
            <option value="overall_profit_margin_pct">Profit Margin %</option>
            <option value="avg_profit_per_unit_usd">Avg Profit/Unit</option>
            <option value="total_units_sold">Units Sold</option>
            <option value="avg_confidence_score">Confidence</option>
            <option value="unique_sku_count">SKU Count</option>
          </select>
          <button
            onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {sortDirection === 'asc' ? '↑ Ascending' : '↓ Descending'}
          </button>
        </div>
        <div className="text-sm text-gray-600">
          Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, sortedProducts.length)} of {sortedProducts.length}
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-8 px-4 py-3"></th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SKUs
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Units Sold
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Revenue
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg Cost
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Profit
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Margin %
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Confidence
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedProducts.map((product) => {
                const isExpanded = expandedProducts.has(product.product_title);
                const skus = skuData.get(product.product_title) || [];
                const isLoadingSKUs = loadingSKUs.has(product.product_title);
                const confidenceBadge = getConfidenceBadge(product.avg_confidence_score);

                return (
                  <>
                    {/* Product Row */}
                    <tr
                      key={product.product_title}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleProduct(product.product_title)}
                    >
                      <td className="px-4 py-4 text-center">
                        <span className="text-gray-400">
                          {isExpanded ? '▼' : '▶'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{product.product_title}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {product.unique_sku_count} SKU{product.unique_sku_count !== 1 ? 's' : ''}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-gray-900">
                        {product.total_units_sold.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                        ${product.total_revenue_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-gray-600">
                        ${product.avg_estimated_cost_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={`px-6 py-4 text-right text-sm font-medium ${
                        product.total_profit_usd >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        ${product.total_profit_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className={`px-6 py-4 text-right text-sm font-semibold ${
                        product.overall_profit_margin_pct >= 20 ? 'text-green-600' :
                        product.overall_profit_margin_pct >= 10 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {product.overall_profit_margin_pct.toFixed(1)}%
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded ${confidenceBadge.color}`}>
                          {confidenceBadge.label}
                        </span>
                      </td>
                    </tr>

                    {/* Expanded SKU Rows */}
                    {isExpanded && (
                      <>
                        {isLoadingSKUs ? (
                          <tr>
                            <td colSpan={9} className="px-6 py-4 bg-gray-50 text-center text-sm text-gray-500">
                              Loading SKUs...
                            </td>
                          </tr>
                        ) : (
                          <>
                            {skus.length > 0 ? (
                              <>
                                {/* SKU Header Row */}
                                <tr className="bg-blue-50">
                                  <td className="px-4 py-2"></td>
                                  <td className="px-6 py-2 text-xs font-semibold text-gray-700 uppercase">
                                    SKU
                                  </td>
                                  <td className="px-6 py-2 text-xs font-semibold text-gray-700 uppercase">
                                    Orders
                                  </td>
                                  <td className="px-6 py-2 text-right text-xs font-semibold text-gray-700 uppercase">
                                    Units
                                  </td>
                                  <td className="px-6 py-2 text-right text-xs font-semibold text-gray-700 uppercase">
                                    Revenue
                                  </td>
                                  <td className="px-6 py-2 text-right text-xs font-semibold text-gray-700 uppercase">
                                    Cost
                                  </td>
                                  <td className="px-6 py-2 text-right text-xs font-semibold text-gray-700 uppercase">
                                    Profit
                                  </td>
                                  <td className="px-6 py-2 text-right text-xs font-semibold text-gray-700 uppercase">
                                    Margin
                                  </td>
                                  <td className="px-6 py-2 text-center text-xs font-semibold text-gray-700 uppercase">
                                    Conf
                                  </td>
                                </tr>
                                {/* SKU Data Rows */}
                                {skus.map((sku) => {
                                  const skuConfidenceBadge = getConfidenceBadge(sku.avg_confidence_score);
                                  return (
                                    <tr key={sku.sku} className="bg-gray-50">
                                      <td className="px-4 py-3"></td>
                                      <td className="px-6 py-3">
                                        <div className="text-sm text-gray-700 font-mono">{sku.sku}</div>
                                      </td>
                                      <td className="px-6 py-3 text-sm text-gray-600">
                                        {sku.times_ordered}
                                      </td>
                                      <td className="px-6 py-3 text-right text-sm text-gray-700">
                                        {sku.total_units_sold.toLocaleString()}
                                      </td>
                                      <td className="px-6 py-3 text-right text-sm text-gray-700">
                                        ${sku.total_revenue_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </td>
                                      <td className="px-6 py-3 text-right text-sm text-gray-600">
                                        ${sku.avg_estimated_cost_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </td>
                                      <td className={`px-6 py-3 text-right text-sm font-medium ${
                                        sku.total_profit_usd >= 0 ? 'text-green-600' : 'text-red-600'
                                      }`}>
                                        ${sku.total_profit_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </td>
                                      <td className={`px-6 py-3 text-right text-sm ${
                                        sku.avg_profit_margin_pct >= 20 ? 'text-green-600' :
                                        sku.avg_profit_margin_pct >= 10 ? 'text-yellow-600' :
                                        'text-red-600'
                                      }`}>
                                        {sku.avg_profit_margin_pct.toFixed(1)}%
                                      </td>
                                      <td className="px-6 py-3 text-center">
                                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded ${skuConfidenceBadge.color}`}>
                                          {skuConfidenceBadge.label}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </>
                            ) : (
                              <tr>
                                <td colSpan={9} className="px-6 py-4 bg-gray-50 text-center text-sm text-gray-500">
                                  No SKUs found for this product
                                </td>
                              </tr>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-gray-700">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
