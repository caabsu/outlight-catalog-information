'use client';

import { useEffect, useState } from 'react';
import { ProductCostAnalysis, SKUProfitabilitySummary } from '@/lib/types';

type TabType = 'all' | 'high-margin' | 'low-margin' | 'top-sellers' | 'no-data';
type SortField = 'sku' | 'product_title' | 'order_count' | 'total_quantity_sold' | 'total_revenue' | 'avg_selling_price_usd' | 'avg_unit_cost_usd' | 'total_profit' | 'avg_profit_per_unit_usd' | 'profit_margin';
type SortOrder = 'asc' | 'desc';

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductCostAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSKUs, setExpandedSKUs] = useState<Set<string>>(new Set());
  const [skuDetails, setSkuDetails] = useState<Map<string, any[]>>(new Map());
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());

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

  async function fetchSKUDetails(sku: string) {
    if (skuDetails.has(sku)) return;

    setLoadingDetails(prev => new Set(prev).add(sku));

    try {
      const res = await fetch(`/api/analysis/items?sku=${encodeURIComponent(sku)}`);
      const data = await res.json();

      if (data.success && data.data?.items) {
        setSkuDetails(prev => new Map(prev).set(sku, data.data.items));
      }
    } catch (error) {
      console.error('Error fetching SKU details:', error);
    } finally {
      setLoadingDetails(prev => {
        const next = new Set(prev);
        next.delete(sku);
        return next;
      });
    }
  }

  function toggleSKUExpand(sku: string) {
    const isExpanded = expandedSKUs.has(sku);

    if (isExpanded) {
      setExpandedSKUs(prev => {
        const next = new Set(prev);
        next.delete(sku);
        return next;
      });
    } else {
      setExpandedSKUs(prev => new Set(prev).add(sku));
      fetchSKUDetails(sku);
    }
  }

  // Calculate profit margin for filtering
  const getMarginPercentage = (product: ProductCostAnalysis): number => {
    if (!product.avg_selling_price_usd || product.avg_selling_price_usd === 0) return 0;
    const profit = product.avg_profit_per_unit_usd || 0;
    const price = product.avg_selling_price_usd || 0;
    return (profit / price) * 100;
  };

  const getTotalRevenue = (product: ProductCostAnalysis): number => {
    return (product.avg_selling_price_usd || 0) * (product.total_quantity_sold || 0);
  };

  const getTotalProfit = (product: ProductCostAnalysis): number => {
    return (product.avg_profit_per_unit_usd || 0) * (product.total_quantity_sold || 0);
  };

  const getTotalCost = (product: ProductCostAnalysis): number => {
    return (product.avg_unit_cost_usd || 0) * (product.total_quantity_sold || 0);
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
      case 'no-data':
        filtered = filtered.filter(p => (p.avg_unit_cost_usd || 0) === 0);
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
      let aVal: any, bVal: any;

      switch (sortField) {
        case 'total_revenue':
          aVal = getTotalRevenue(a);
          bVal = getTotalRevenue(b);
          break;
        case 'total_profit':
          aVal = getTotalProfit(a);
          bVal = getTotalProfit(b);
          break;
        case 'profit_margin':
          aVal = getMarginPercentage(a);
          bVal = getMarginPercentage(b);
          break;
        case 'sku':
        case 'product_title':
          aVal = String(a[sortField] || '');
          bVal = String(b[sortField] || '');
          return sortOrder === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        default:
          aVal = Number(a[sortField] || 0);
          bVal = Number(b[sortField] || 0);
      }

      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return filtered;
  };

  const filteredProducts = getFilteredProducts();

  // Pagination
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  // Summary calculations
  const totalUnits = filteredProducts.reduce((sum, p) => sum + (p.total_quantity_sold || 0), 0);
  const totalRevenue = filteredProducts.reduce((sum, p) => sum + getTotalRevenue(p), 0);
  const totalCosts = filteredProducts.reduce((sum, p) => sum + getTotalCost(p), 0);
  const totalProfit = filteredProducts.reduce((sum, p) => sum + getTotalProfit(p), 0);
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const getProfitColor = (profitPerUnit: number) => {
    if (profitPerUnit >= 10) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (profitPerUnit >= 5) return 'text-amber-600 bg-amber-50 border-amber-200';
    if (profitPerUnit >= 0) return 'text-blue-600 bg-blue-50 border-blue-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

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
          <p className="mt-2 text-gray-700">
            {filteredProducts.length} products • {totalUnits.toLocaleString()} units sold • ${totalRevenue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} revenue
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
            {filteredProducts.length}
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
            { id: 'all', label: 'All Products', count: products.length, icon: '📦' },
            { id: 'high-margin', label: 'High Margin (≥30%)', count: products.filter(p => getMarginPercentage(p) >= 30).length, icon: '🎯' },
            { id: 'low-margin', label: 'Low Margin (<15%)', count: products.filter(p => {
              const margin = getMarginPercentage(p);
              return margin > 0 && margin < 15;
            }).length, icon: '⚠️' },
            { id: 'top-sellers', label: 'Top Sellers (10+)', count: products.filter(p => (p.total_quantity_sold || 0) >= 10).length, icon: '⭐' },
            { id: 'no-data', label: 'Missing Data', count: products.filter(p => (p.avg_unit_cost_usd || 0) === 0).length, icon: '❓' },
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
              placeholder="Search by SKU or product name..."
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
              <option value="avg_selling_price_usd-desc">💵 Price (High to Low)</option>
              <option value="avg_selling_price_usd-asc">💵 Price (Low to High)</option>
              <option value="avg_unit_cost_usd-desc">🏷️ Cost (High to Low)</option>
              <option value="avg_unit_cost_usd-asc">🏷️ Cost (Low to High)</option>
              <option value="sku-asc">🔤 SKU (A-Z)</option>
              <option value="sku-desc">🔤 SKU (Z-A)</option>
              <option value="product_title-asc">📝 Name (A-Z)</option>
              <option value="product_title-desc">📝 Name (Z-A)</option>
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
        ) : filteredProducts.length === 0 ? (
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
                    <th
                      className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition-colors"
                      onClick={() => handleColumnSort('avg_selling_price_usd')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        <span>Price/Unit</span>
                        {getSortIcon('avg_selling_price_usd')}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition-colors"
                      onClick={() => handleColumnSort('avg_unit_cost_usd')}
                    >
                      <div className="flex items-center justify-end gap-2">
                        <span>Cost/Unit</span>
                        {getSortIcon('avg_unit_cost_usd')}
                      </div>
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
                  {paginatedProducts.map((product) => {
                    const margin = getMarginPercentage(product);
                    const revenue = getTotalRevenue(product);
                    const profit = getTotalProfit(product);
                    const cost = getTotalCost(product);
                    const isExpanded = expandedSKUs.has(product.sku);
                    const details = skuDetails.get(product.sku) || [];
                    const isLoadingDetails = loadingDetails.has(product.sku);
                    const hasData = (product.avg_unit_cost_usd || 0) > 0;

                    return (
                      <>
                        <tr
                          key={product.sku}
                          className={`hover:bg-blue-50 transition-colors cursor-pointer ${!hasData ? 'bg-gray-50' : ''}`}
                          onClick={() => toggleSKUExpand(product.sku)}
                        >
                          <td className="px-4 py-4 text-center">
                            <span className="text-gray-500 font-bold">
                              {isExpanded ? '▼' : '▶'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-start">
                              <div>
                                <div className="text-sm font-bold text-gray-900">
                                  {product.product_title}
                                </div>
                                <div className="text-xs text-gray-600 mt-1 font-mono bg-gray-100 px-2 py-1 rounded inline-block">
                                  SKU: {product.sku}
                                </div>
                                {!hasData && (
                                  <div className="text-xs text-red-600 mt-1 font-semibold">
                                    ⚠️ Missing invoice data
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                            {product.order_count || 0}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-bold">
                            {(product.total_quantity_sold || 0).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="text-sm font-bold text-emerald-700">
                              ${revenue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              {((revenue / totalRevenue) * 100).toFixed(1)}% of total
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="text-sm font-bold text-gray-900">
                              ${product.avg_selling_price_usd?.toFixed(2) || '0.00'}
                            </div>
                            {product.avg_listed_price_usd && product.avg_listed_price_usd !== product.avg_selling_price_usd && (
                              <div className="text-xs text-gray-500 line-through mt-1">
                                ${product.avg_listed_price_usd.toFixed(2)}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="text-sm font-bold text-gray-900">
                              ${product.avg_unit_cost_usd?.toFixed(2) || '0.00'}
                            </div>
                            <div className="text-xs space-y-0.5 mt-1">
                              {product.avg_unit_cost_cny && product.avg_unit_cost_cny > 0 ? (
                                <div className="text-gray-600">
                                  ¥{product.avg_unit_cost_cny.toFixed(2)}
                                </div>
                              ) : (
                                <div className="text-red-600 font-semibold">
                                  No data
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className={`text-sm font-bold ${profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              ${profit.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </div>
                            <div className={`text-xs mt-1 ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ${(product.avg_profit_per_unit_usd || 0).toFixed(2)}/unit
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold border-2 ${getMarginColor(margin)}`}>
                              {margin.toFixed(1)}%
                            </span>
                          </td>
                        </tr>

                        {/* Expanded Details Row */}
                        {isExpanded && (
                          <tr className="bg-gray-50">
                            <td colSpan={9} className="px-6 py-6">
                              {isLoadingDetails ? (
                                <div className="text-center py-8">
                                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                  <p className="mt-3 text-gray-600 text-sm">Loading order details...</p>
                                </div>
                              ) : details.length > 0 ? (
                                <div className="space-y-4">
                                  <h4 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <span>📋</span>
                                    Order Details for {product.sku}
                                    <span className="text-sm font-normal text-gray-600">({details.length} orders)</span>
                                  </h4>
                                  <div className="bg-white rounded-lg border-2 border-gray-200 overflow-hidden">
                                    <table className="min-w-full text-sm">
                                      <thead className="bg-gradient-to-r from-blue-50 to-indigo-50">
                                        <tr>
                                          <th className="px-4 py-3 text-left font-bold text-gray-700">Order #</th>
                                          <th className="px-4 py-3 text-left font-bold text-gray-700">Date</th>
                                          <th className="px-4 py-3 text-right font-bold text-gray-700">Qty</th>
                                          <th className="px-4 py-3 text-right font-bold text-gray-700">Revenue</th>
                                          <th className="px-4 py-3 text-right font-bold text-gray-700">Cost</th>
                                          <th className="px-4 py-3 text-right font-bold text-gray-700">Profit</th>
                                          <th className="px-4 py-3 text-right font-bold text-gray-700">Margin</th>
                                          <th className="px-4 py-3 text-left font-bold text-gray-700">Invoice Sources</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-200">
                                        {details.map((order, idx) => {
                                          const orderProfit = order.total_line_profit_usd || 0;
                                          const orderMargin = order.profit_margin_percentage || 0;
                                          return (
                                            <tr key={idx} className="hover:bg-blue-50 transition-colors">
                                              <td className="px-4 py-3 font-mono text-xs font-bold text-gray-900">
                                                {order.order_name || order.order_number}
                                              </td>
                                              <td className="px-4 py-3 text-gray-700">
                                                {order.order_date ? new Date(order.order_date).toLocaleDateString() : 'N/A'}
                                              </td>
                                              <td className="px-4 py-3 text-right font-semibold text-gray-900">
                                                {order.quantity}
                                              </td>
                                              <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                                                ${order.line_total_revenue?.toFixed(2) || '0.00'}
                                              </td>
                                              <td className="px-4 py-3 text-right font-semibold text-red-700">
                                                ${order.estimated_unit_cost_usd ? (order.estimated_unit_cost_usd * order.quantity).toFixed(2) : '0.00'}
                                              </td>
                                              <td className={`px-4 py-3 text-right font-bold ${orderProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                                ${orderProfit.toFixed(2)}
                                              </td>
                                              <td className="px-4 py-3 text-right">
                                                <span className={`inline-flex px-2 py-1 rounded font-semibold text-xs ${getMarginColor(orderMargin)}`}>
                                                  {orderMargin.toFixed(1)}%
                                                </span>
                                              </td>
                                              <td className="px-4 py-3">
                                                <div className="space-y-1 text-xs">
                                                  {order.commodity_invoice_files && order.commodity_invoice_files.length > 0 && (
                                                    <div>
                                                      <span className="font-bold text-blue-800">📦 Commodity: </span>
                                                      <span className="text-blue-600 font-medium">
                                                        {order.commodity_invoice_files[0]}
                                                      </span>
                                                    </div>
                                                  )}
                                                  {order.freight_invoice_files && order.freight_invoice_files.length > 0 && (
                                                    <div>
                                                      <span className="font-bold text-purple-800">✈️ Freight: </span>
                                                      <span className="text-purple-600 font-medium">
                                                        {order.freight_invoice_files[0]}
                                                      </span>
                                                    </div>
                                                  )}
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-center py-8 text-gray-600">
                                  <p className="text-lg font-medium">No detailed order data available for this SKU</p>
                                  <p className="text-sm mt-2">This product may not have complete invoice data yet.</p>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
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
                  <span className="font-bold text-gray-900">{Math.min(endIndex, filteredProducts.length)}</span> of{' '}
                  <span className="font-bold text-gray-900">{filteredProducts.length}</span> results
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
    </div>
  );
}
