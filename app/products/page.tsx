'use client';

import { useEffect, useState } from 'react';
import { ProductCostAnalysis } from '@/lib/types';

type TabType = 'all' | 'high-margin' | 'low-margin' | 'top-sellers' | 'no-data';
type SortField = 'product_title' | 'total_revenue' | 'total_profit' | 'profit_margin' | 'total_quantity_sold' | 'order_count';
type SortOrder = 'asc' | 'desc';

interface ProductGroup {
  product_title: string;
  skus: ProductCostAnalysis[];
  total_quantity_sold: number;
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  avg_margin: number;
  order_count: number;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductCostAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [skuDetails, setSkuDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Filters and pagination
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [sortField, setSortField] = useState<SortField>('total_revenue');
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

  async function fetchSkuDetails(sku: string) {
    try {
      setLoadingDetails(true);
      setSelectedSku(sku);
      const res = await fetch(`/api/analysis/product-details?sku=${encodeURIComponent(sku)}`);
      const data = await res.json();

      if (data.success) {
        setSkuDetails(data.data);
      }
    } catch (error) {
      console.error('Error fetching SKU details:', error);
    } finally {
      setLoadingDetails(false);
    }
  }

  function toggleProductExpand(productTitle: string) {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productTitle)) {
        next.delete(productTitle);
      } else {
        next.add(productTitle);
      }
      return next;
    });
  }

  // Group products by product_title
  const groupProductsByTitle = (productsList: ProductCostAnalysis[]): ProductGroup[] => {
    const grouped = new Map<string, ProductCostAnalysis[]>();

    productsList.forEach(product => {
      if (!grouped.has(product.product_title)) {
        grouped.set(product.product_title, []);
      }
      grouped.get(product.product_title)!.push(product);
    });

    return Array.from(grouped.entries()).map(([product_title, skus]) => {
      const total_quantity_sold = skus.reduce((sum, p) => sum + (p.total_quantity_sold || 0), 0);
      const total_revenue = skus.reduce((sum, p) => sum + (p.total_revenue_usd || 0), 0);
      const total_cost = skus.reduce((sum, p) => sum + ((p.avg_unit_cost_usd || 0) * (p.total_quantity_sold || 0)), 0);
      const total_profit = skus.reduce((sum, p) => sum + ((p.avg_profit_per_unit_usd || 0) * (p.total_quantity_sold || 0)), 0);
      const avg_margin = total_revenue > 0 ? (total_profit / total_revenue) * 100 : 0;
      const order_count = skus.reduce((sum, p) => sum + (p.order_count || 0), 0);

      return {
        product_title,
        skus,
        total_quantity_sold,
        total_revenue,
        total_cost,
        total_profit,
        avg_margin,
        order_count,
      };
    });
  };

  // Filter product groups
  const getFilteredProductGroups = () => {
    let filtered = [...products];

    // Hide zero cost filter
    if (hideZeroCost) {
      filtered = filtered.filter(p => (p.avg_unit_cost_usd || 0) > 0);
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(product =>
        product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.product_title?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Group by product title
    let groups = groupProductsByTitle(filtered);

    // Tab filter (applied to groups)
    switch (activeTab) {
      case 'high-margin':
        groups = groups.filter(g => g.avg_margin >= 30);
        break;
      case 'low-margin':
        groups = groups.filter(g => g.avg_margin > 0 && g.avg_margin < 15);
        break;
      case 'top-sellers':
        groups = groups.filter(g => g.total_quantity_sold >= 10);
        break;
      case 'no-data':
        groups = groups.filter(g => g.total_cost === 0);
        break;
    }

    // Sort groups
    groups.sort((a, b) => {
      let aVal: any, bVal: any;

      switch (sortField) {
        case 'product_title':
          aVal = a.product_title;
          bVal = b.product_title;
          return sortOrder === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        case 'total_revenue':
          aVal = a.total_revenue;
          bVal = b.total_revenue;
          break;
        case 'total_profit':
          aVal = a.total_profit;
          bVal = b.total_profit;
          break;
        case 'profit_margin':
          aVal = a.avg_margin;
          bVal = b.avg_margin;
          break;
        case 'total_quantity_sold':
          aVal = a.total_quantity_sold;
          bVal = b.total_quantity_sold;
          break;
        case 'order_count':
          aVal = a.order_count;
          bVal = b.order_count;
          break;
        default:
          aVal = 0;
          bVal = 0;
      }

      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return groups;
  };

  const filteredProductGroups = getFilteredProductGroups();

  // Pagination
  const totalPages = Math.ceil(filteredProductGroups.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedGroups = filteredProductGroups.slice(startIndex, endIndex);

  // Summary calculations
  const totalUnits = filteredProductGroups.reduce((sum, g) => sum + g.total_quantity_sold, 0);
  const totalRevenue = filteredProductGroups.reduce((sum, g) => sum + g.total_revenue, 0);
  const totalCosts = filteredProductGroups.reduce((sum, g) => sum + g.total_cost, 0);
  const totalProfit = filteredProductGroups.reduce((sum, g) => sum + g.total_profit, 0);
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const getMarginColor = (margin: number) => {
    if (margin >= 30) return 'text-emerald-700 bg-emerald-100 border-emerald-300';
    if (margin >= 15) return 'text-amber-700 bg-amber-100 border-amber-300';
    if (margin > 0) return 'text-orange-700 bg-orange-100 border-orange-300';
    return 'text-red-700 bg-red-100 border-red-300';
  };

  const handleColumnSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
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
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Product Profitability Analysis</h1>
          <p className="mt-2 text-gray-700 font-medium">
            {filteredProductGroups.length} products • {totalUnits.toLocaleString()} units sold • ${totalRevenue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} revenue
          </p>
        </div>
        <button
          onClick={fetchProducts}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm"
          disabled={loading}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow-md p-6 border border-blue-200">
          <p className="text-sm font-semibold text-blue-900 uppercase tracking-wide">Products</p>
          <p className="mt-2 text-4xl font-bold text-blue-900">
            {filteredProductGroups.length}
          </p>
          <p className="mt-1 text-xs text-blue-700">{totalUnits.toLocaleString()} units total</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg shadow-md p-6 border border-emerald-200">
          <p className="text-sm font-semibold text-emerald-900 uppercase tracking-wide">Total Revenue</p>
          <p className="mt-2 text-4xl font-bold text-emerald-900">
            ${(totalRevenue / 1000).toFixed(1)}k
          </p>
          <p className="mt-1 text-xs text-emerald-700">${totalRevenue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg shadow-md p-6 border border-red-200">
          <p className="text-sm font-semibold text-red-900 uppercase tracking-wide">Total Costs</p>
          <p className="mt-2 text-4xl font-bold text-red-900">
            ${(totalCosts / 1000).toFixed(1)}k
          </p>
          <p className="mt-1 text-xs text-red-700">${totalCosts.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
        </div>
        <div className={`bg-gradient-to-br rounded-lg shadow-md p-6 border ${totalProfit >= 0 ? 'from-green-50 to-green-100 border-green-200' : 'from-red-50 to-red-100 border-red-200'}`}>
          <p className={`text-sm font-semibold uppercase tracking-wide ${totalProfit >= 0 ? 'text-green-900' : 'text-red-900'}`}>Total Profit</p>
          <p className={`mt-2 text-4xl font-bold ${totalProfit >= 0 ? 'text-green-900' : 'text-red-900'}`}>
            ${(totalProfit / 1000).toFixed(1)}k
          </p>
          <p className={`mt-1 text-xs ${totalProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>${totalProfit.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg shadow-md p-6 border border-purple-200">
          <p className="text-sm font-semibold text-purple-900 uppercase tracking-wide">Avg Margin</p>
          <p className="mt-2 text-4xl font-bold text-purple-900">
            {overallMargin.toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-purple-700">across all products</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white rounded-t-lg shadow-sm">
        <nav className="-mb-px flex space-x-8 px-6">
          {[
            { id: 'all', label: 'All Products', count: groupProductsByTitle(products).length, icon: '📦' },
            { id: 'high-margin', label: 'High Margin (≥30%)', count: groupProductsByTitle(products).filter(g => g.avg_margin >= 30).length, icon: '🎯' },
            { id: 'low-margin', label: 'Low Margin (<15%)', count: groupProductsByTitle(products).filter(g => {
              return g.avg_margin > 0 && g.avg_margin < 15;
            }).length, icon: '⚠️' },
            { id: 'top-sellers', label: 'Top Sellers (10+)', count: groupProductsByTitle(products).filter(g => g.total_quantity_sold >= 10).length, icon: '⭐' },
            { id: 'no-data', label: 'Missing Data', count: groupProductsByTitle(products).filter(g => g.total_cost === 0).length, icon: '❓' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as TabType);
                setCurrentPage(1);
              }}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap
                ${activeTab === tab.id
                  ? 'border-blue-500 text-blue-700'
                  : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
                }
              `}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
              <span className={`ml-2 py-0.5 px-2 rounded-full text-xs font-semibold ${
                activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">🔍 Search Products</label>
            <input
              type="text"
              placeholder="Search by product name or SKU..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
            />
          </div>

          {/* Sort */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">📊 Sort By</label>
            <select
              value={`${sortField}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortField(field as SortField);
                setSortOrder(order as SortOrder);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
            >
              <option value="total_revenue-desc">💰 Total Revenue (High to Low)</option>
              <option value="total_revenue-asc">💰 Total Revenue (Low to High)</option>
              <option value="total_profit-desc">✨ Total Profit (High to Low)</option>
              <option value="total_profit-asc">✨ Total Profit (Low to High)</option>
              <option value="profit_margin-desc">📈 Margin % (High to Low)</option>
              <option value="profit_margin-asc">📈 Margin % (Low to High)</option>
              <option value="total_quantity_sold-desc">📦 Units Sold (High to Low)</option>
              <option value="total_quantity_sold-asc">📦 Units Sold (Low to High)</option>
              <option value="order_count-desc">🛒 Order Count (High to Low)</option>
              <option value="order_count-asc">🛒 Order Count (Low to High)</option>
              <option value="product_title-asc">🔤 Product Name (A-Z)</option>
              <option value="product_title-desc">🔤 Product Name (Z-A)</option>
            </select>
          </div>
        </div>

        {/* Filter Toggle */}
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
            <span className="ml-2 text-sm font-semibold text-gray-900">
              ✓ Only show products with complete invoice data
            </span>
            <span className="ml-2 text-xs text-gray-600">(hides products missing cost information)</span>
          </label>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600 font-medium">Loading products...</p>
          </div>
        ) : filteredProductGroups.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-600 text-lg font-medium">No products found matching your filters.</p>
            <p className="text-gray-500 text-sm mt-2">Try adjusting your search or filter criteria.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <tr>
                    <th className="w-8 px-4 py-3"></th>
                    <th
                      className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition-colors"
                      onClick={() => handleColumnSort('product_title')}
                    >
                      <div className="flex items-center gap-2">
                        <span>Product</span>
                        {getSortIcon('product_title')}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition-colors"
                      onClick={() => handleColumnSort('order_count')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        <span>Orders</span>
                        {getSortIcon('order_count')}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition-colors"
                      onClick={() => handleColumnSort('total_quantity_sold')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        <span>Units</span>
                        {getSortIcon('total_quantity_sold')}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition-colors"
                      onClick={() => handleColumnSort('total_revenue')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        <span>Revenue</span>
                        {getSortIcon('total_revenue')}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Avg Cost/Unit
                    </th>
                    <th
                      className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition-colors"
                      onClick={() => handleColumnSort('total_profit')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        <span>Profit</span>
                        {getSortIcon('total_profit')}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition-colors"
                      onClick={() => handleColumnSort('profit_margin')}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span>Margin %</span>
                        {getSortIcon('profit_margin')}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedGroups.map((group) => {
                    const isExpanded = expandedProducts.has(group.product_title);
                    const avgCostPerUnit = group.total_quantity_sold > 0 ? group.total_cost / group.total_quantity_sold : 0;

                    return (
                      <>
                        {/* Product Group Row */}
                        <tr
                          key={group.product_title}
                          onClick={() => toggleProductExpand(group.product_title)}
                          className="hover:bg-blue-50 transition-colors cursor-pointer border-l-4 border-blue-500"
                        >
                          <td className="px-4 py-4 text-center">
                            <span className="text-blue-600 font-bold text-lg">
                              {isExpanded ? '▼' : '▶'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-start">
                              <div>
                                <div className="text-sm font-bold text-gray-900">
                                  {group.product_title}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">
                                  {group.skus.length} SKU{group.skus.length !== 1 ? 's' : ''}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                            {group.order_count}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-bold">
                            {group.total_quantity_sold.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="text-sm font-bold text-emerald-700">
                              ${group.total_revenue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              {totalRevenue > 0 ? ((group.total_revenue / totalRevenue) * 100).toFixed(1) : '0'}% of total
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="text-sm font-bold text-gray-900">
                              ${avgCostPerUnit.toFixed(2)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className={`text-sm font-bold ${group.total_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              ${group.total_profit.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold border-2 ${getMarginColor(group.avg_margin)}`}>
                              {group.avg_margin.toFixed(1)}%
                            </span>
                          </td>
                        </tr>

                        {/* Expanded SKU Rows */}
                        {isExpanded && group.skus.map((sku) => (
                          <tr key={sku.sku} className="bg-gray-50 border-l-4 border-gray-300">
                            <td className="px-4 py-3"></td>
                            <td className="px-6 py-3">
                              <div className="pl-4 flex items-center justify-between">
                                <div className="text-sm text-gray-700 font-medium">↳ {sku.sku}</div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    fetchSkuDetails(sku.sku);
                                  }}
                                  className="ml-2 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded transition-colors"
                                >
                                  View Details →
                                </button>
                              </div>
                            </td>
                            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-700 text-right">
                              {sku.order_count || 0}
                            </td>
                            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-700 text-right font-semibold">
                              {(sku.total_quantity_sold || 0).toLocaleString()}
                            </td>
                            <td className="px-6 py-3 whitespace-nowrap text-right">
                              <div className="text-sm font-semibold text-emerald-600">
                                ${(sku.total_revenue_usd || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </div>
                            </td>
                            <td className="px-6 py-3 whitespace-nowrap text-right">
                              <div className="text-sm font-semibold text-gray-700">
                                ${(sku.avg_unit_cost_usd || 0).toFixed(2)}
                              </div>
                              {sku.avg_item_cost_usd && sku.avg_shipping_cost_usd && (
                                <div className="text-xs text-blue-700 font-medium mt-1">
                                  🏷️ ${sku.avg_item_cost_usd.toFixed(2)} + 🚛 ${sku.avg_shipping_cost_usd.toFixed(2)}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-3 whitespace-nowrap text-right">
                              <div className={`text-sm font-semibold ${((sku.avg_profit_per_unit_usd || 0) * (sku.total_quantity_sold || 0)) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ${(((sku.avg_profit_per_unit_usd || 0) * (sku.total_quantity_sold || 0))).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </div>
                            </td>
                            <td className="px-6 py-3 whitespace-nowrap text-center">
                              <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${getMarginColor(sku.avg_profit_margin_pct || 0)}`}>
                                {(sku.avg_profit_margin_pct || 0).toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-t-2 border-gray-300">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700 font-medium">
                  Showing <span className="font-bold text-gray-900">{startIndex + 1}</span> to{' '}
                  <span className="font-bold text-gray-900">{Math.min(endIndex, filteredProductGroups.length)}</span> of{' '}
                  <span className="font-bold text-gray-900">{filteredProductGroups.length}</span> products
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 border-2 border-gray-300 rounded-lg text-sm font-bold text-gray-700 hover:bg-white hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    ← Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {[...Array(Math.min(5, totalPages))].map((_, i) => {
                      const pageNum = i + 1;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                            currentPage === pageNum
                              ? 'bg-blue-600 text-white shadow-md'
                              : 'text-gray-700 hover:bg-white border border-gray-300'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    {totalPages > 5 && <span className="px-2 text-gray-500 font-bold">...</span>}
                  </div>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 border-2 border-gray-300 rounded-lg text-sm font-bold text-gray-700 hover:bg-white hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Next →
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* SKU Details Modal */}
      {selectedSku && skuDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-5 flex justify-between items-center rounded-t-xl">
              <div>
                <h2 className="text-2xl font-bold">SKU: {selectedSku}</h2>
                <p className="text-sm text-indigo-100 mt-1">
                  Invoice-Level Cost Analysis
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedSku(null);
                  setSkuDetails(null);
                }}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                  <p className="text-xs font-semibold text-blue-900 uppercase">Total Orders</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1">{skuDetails.summary.totalOrders}</p>
                  <p className="text-xs text-blue-600 mt-1">
                    {skuDetails.summary.ordersWithInvoices} with invoices
                  </p>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200">
                  <p className="text-xs font-semibold text-emerald-900 uppercase">Revenue</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">
                    ${skuDetails.summary.totalRevenue.toFixed(2)}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
                  <p className="text-xs font-semibold text-red-900 uppercase">Total Cost</p>
                  <p className="text-2xl font-bold text-red-700 mt-1">
                    ${skuDetails.summary.totalCost.toFixed(2)}
                  </p>
                  <p className="text-xs text-red-600 mt-1">
                    ${skuDetails.summary.totalCommodityCost.toFixed(2)} + ${skuDetails.summary.totalFreightCost.toFixed(2)}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                  <p className="text-xs font-semibold text-green-900 uppercase">Net Profit</p>
                  <p className="text-2xl font-bold text-green-700 mt-1">
                    ${skuDetails.summary.totalProfit.toFixed(2)}
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    {skuDetails.summary.avgMargin.toFixed(1)}% margin
                  </p>
                </div>
              </div>

              {/* Orders List */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  📋 All Orders with Invoice Details
                </h3>
                <div className="space-y-4">
                  {skuDetails.orders.map((orderData: any, idx: number) => {
                    const lineTotal = (orderData.orderItem.price * orderData.orderItem.quantity) - orderData.orderItem.total_discount;
                    const commodityTotal = orderData.commodityItems.reduce((sum: number, c: any) => sum + (c.total_usd || 0), 0);
                    const freightTotal = orderData.freightItems.reduce((sum: number, f: any) => sum + (f.international_shipping_usd || 0) + (f.service_fee_usd || 0), 0);
                    const totalCost = commodityTotal + freightTotal;
                    const profit = lineTotal - totalCost;
                    const margin = lineTotal > 0 ? (profit / lineTotal * 100) : 0;

                    return (
                      <div key={idx} className={`border-2 rounded-lg p-4 ${orderData.hasInvoiceData ? 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-300' : 'bg-gray-100 border-gray-300'}`}>
                        {/* Order Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="font-bold text-gray-900 text-lg">
                              Order {orderData.order.order_name}
                            </h4>
                            <p className="text-sm text-gray-600 mt-1">
                              {new Date(orderData.order.created_at).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-600">Quantity</div>
                            <div className="text-xl font-bold text-gray-900">{orderData.orderItem.quantity} units</div>
                          </div>
                        </div>

                        {!orderData.hasInvoiceData ? (
                          <div className="bg-yellow-50 border border-yellow-300 rounded p-3 text-center">
                            <p className="text-yellow-800 font-semibold">⚠️ No invoice data available for this order</p>
                          </div>
                        ) : (
                          <>
                            {/* Revenue Section */}
                            <div className="bg-white rounded-lg p-3 mb-3 border border-emerald-200">
                              <div className="text-xs font-semibold text-gray-600 uppercase mb-2">💰 Revenue</div>
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <p className="text-gray-600">Unit Price:</p>
                                  <p className="font-bold text-gray-900">${orderData.orderItem.price.toFixed(2)}</p>
                                </div>
                                <div>
                                  <p className="text-gray-600">Discount:</p>
                                  <p className="font-bold text-red-600">-${orderData.orderItem.total_discount.toFixed(2)}</p>
                                </div>
                              </div>
                              <div className="mt-2 pt-2 border-t border-emerald-200">
                                <p className="text-gray-700 font-semibold">Line Total: <span className="text-emerald-600 text-lg">${lineTotal.toFixed(2)}</span></p>
                              </div>
                            </div>

                            {/* Invoice Data Section */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                              {/* Commodity Invoices */}
                              <div className="bg-white rounded-lg p-3 border border-gray-300">
                                <div className="text-xs font-semibold text-gray-600 uppercase mb-2 flex items-center justify-between">
                                  <span>📦 Commodity Invoices</span>
                                  <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{orderData.commodityItems.length}</span>
                                </div>
                                <div className="space-y-2">
                                  {orderData.commodityItems.map((item: any, i: number) => (
                                    <div key={i} className="bg-gray-50 rounded p-2 text-xs">
                                      <div className="flex justify-between items-start mb-1">
                                        <span className="font-semibold text-gray-700">Invoice #{item.id}</span>
                                        <span className="text-gray-500">Upload #{item.upload_id}</span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2 mt-2">
                                        <div>
                                          <p className="text-gray-600">Product Cost:</p>
                                          <p className="font-bold text-gray-900">${item.price_usd.toFixed(2)}</p>
                                          <p className="text-gray-500">¥{item.price_cny.toFixed(2)}</p>
                                        </div>
                                        <div>
                                          <p className="text-gray-600">Domestic Freight:</p>
                                          <p className="font-bold text-gray-900">${item.domestic_freight_usd.toFixed(2)}</p>
                                          <p className="text-gray-500">¥{item.domestic_freight_cny.toFixed(2)}</p>
                                        </div>
                                      </div>
                                      <div className="mt-2 pt-2 border-t border-gray-300">
                                        <p className="font-bold text-red-700">Total: ${item.total_usd.toFixed(2)} <span className="text-gray-500 font-normal">(¥{item.total_cny.toFixed(2)})</span></p>
                                      </div>
                                    </div>
                                  ))}
                                  <div className="bg-red-100 rounded p-2 border border-red-300">
                                    <p className="font-bold text-red-900">Commodity Total: ${commodityTotal.toFixed(2)}</p>
                                  </div>
                                </div>
                              </div>

                              {/* Freight Invoices */}
                              <div className="bg-white rounded-lg p-3 border border-gray-300">
                                <div className="text-xs font-semibold text-gray-600 uppercase mb-2 flex items-center justify-between">
                                  <span>✈️ Freight Invoices</span>
                                  <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded">{orderData.freightItems.length}</span>
                                </div>
                                <div className="space-y-2">
                                  {orderData.freightItems.map((item: any, i: number) => (
                                    <div key={i} className="bg-gray-50 rounded p-2 text-xs">
                                      <div className="flex justify-between items-start mb-1">
                                        <span className="font-semibold text-gray-700">Invoice #{item.id}</span>
                                        <span className="text-gray-500">Upload #{item.upload_id}</span>
                                      </div>
                                      {item.weight && (
                                        <div className="text-gray-600 mb-2">Weight: <span className="font-semibold">{item.weight}kg</span></div>
                                      )}
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <p className="text-gray-600">International:</p>
                                          <p className="font-bold text-gray-900">${item.international_shipping_usd.toFixed(2)}</p>
                                          <p className="text-gray-500">¥{item.international_shipping_cny.toFixed(2)}</p>
                                        </div>
                                        <div>
                                          <p className="text-gray-600">Service Fee:</p>
                                          <p className="font-bold text-gray-900">${item.service_fee_usd.toFixed(2)}</p>
                                        </div>
                                      </div>
                                      <div className="mt-2 pt-2 border-t border-gray-300">
                                        <p className="font-bold text-amber-700">Total: ${(item.international_shipping_usd + item.service_fee_usd).toFixed(2)}</p>
                                      </div>
                                    </div>
                                  ))}
                                  <div className="bg-amber-100 rounded p-2 border border-amber-300">
                                    <p className="font-bold text-amber-900">Freight Total: ${freightTotal.toFixed(2)}</p>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Profitability Summary */}
                            <div className="bg-gradient-to-r from-green-100 to-emerald-100 rounded-lg p-4 border-2 border-green-300">
                              <div className="grid grid-cols-3 gap-4 text-center">
                                <div>
                                  <p className="text-xs text-green-800 font-semibold uppercase">Total Cost</p>
                                  <p className="text-xl font-bold text-red-700 mt-1">${totalCost.toFixed(2)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-green-800 font-semibold uppercase">Net Profit</p>
                                  <p className={`text-xl font-bold mt-1 ${profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                    ${profit.toFixed(2)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-green-800 font-semibold uppercase">Margin</p>
                                  <p className={`text-xl font-bold mt-1 ${margin >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                    {margin.toFixed(1)}%
                                  </p>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
