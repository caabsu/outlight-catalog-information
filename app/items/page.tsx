'use client';

import { useEffect, useState } from 'react';
import { SKUProfitabilitySummary } from '@/lib/types';

type TabType = 'all' | 'high-confidence' | 'profitable' | 'loss-making';
type SortField = 'sku' | 'product_title' | 'total_revenue_usd' | 'avg_estimated_cost_usd' | 'avg_profit_per_unit_usd' | 'avg_profit_margin_pct' | 'total_units_sold' | 'avg_confidence_score';
type SortOrder = 'asc' | 'desc';

export default function ItemsPage() {
  const [items, setItems] = useState<SKUProfitabilitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Filters and pagination
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [sortField, setSortField] = useState<SortField>('total_revenue_usd');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [minConfidence, setMinConfidence] = useState(0);

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    try {
      setLoading(true);
      const res = await fetch('/api/analysis/items');
      const data = await res.json();

      if (data.success) {
        setItems(data.data || []);
        console.log(`✓ Loaded ${data.data?.length || 0} SKUs with cost estimates`);
      }
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setLoading(false);
    }
  }

  const getFilteredItems = () => {
    let filtered = [...items];

    // Tab filter
    switch (activeTab) {
      case 'high-confidence':
        filtered = filtered.filter(i => i.avg_confidence_score >= 70);
        break;
      case 'profitable':
        filtered = filtered.filter(i => i.avg_profit_margin_pct >= 20);
        break;
      case 'loss-making':
        filtered = filtered.filter(i => i.avg_profit_margin_pct < 10);
        break;
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.product_title?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Confidence filter
    if (minConfidence > 0) {
      filtered = filtered.filter(i => i.avg_confidence_score >= minConfidence);
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'sku' || sortField === 'product_title') {
        aVal = String(aVal || '');
        bVal = String(bVal || '');
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      } else {
        aVal = Number(aVal || 0);
        bVal = Number(bVal || 0);
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
    });

    return filtered;
  };

  const filteredItems = getFilteredItems();

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedItems = filteredItems.slice(startIndex, endIndex);

  const getConfidenceColor = (score: number) => {
    if (score >= 85) return 'text-green-700 bg-green-100';
    if (score >= 70) return 'text-blue-700 bg-blue-100';
    if (score >= 50) return 'text-yellow-700 bg-yellow-100';
    return 'text-gray-700 bg-gray-100';
  };

  const getMarginColor = (margin: number) => {
    if (margin >= 30) return 'text-emerald-700 bg-emerald-100';
    if (margin >= 20) return 'text-green-700 bg-green-100';
    if (margin >= 10) return 'text-amber-700 bg-amber-100';
    return 'text-red-700 bg-red-100';
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Item-Level Profitability</h1>
          <p className="mt-2 text-gray-600">
            {filteredItems.length} SKUs • Intelligent cost estimation from invoices and order data
          </p>
        </div>
        <button
          onClick={fetchItems}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">How Cost Estimation Works</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p className="mb-2"><strong>Only items with actual invoice data are shown.</strong> No estimates or fallbacks.</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Direct SKU Match (95% confidence):</strong> Average cost from 3+ invoices with this SKU</li>
                <li><strong>Direct SKU Match (85% confidence):</strong> Average cost from 2 invoices with this SKU</li>
                <li><strong>Direct SKU Match (70% confidence):</strong> Average cost from 1 invoice with this SKU</li>
                <li><strong>Order Allocation (50% confidence):</strong> Order cost divided proportionally when SKU not in invoice</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'all', label: 'All Items', count: items.length },
            { id: 'high-confidence', label: 'High Confidence (70%+)', count: items.filter(i => i.avg_confidence_score >= 70).length },
            { id: 'profitable', label: 'Profitable (20%+ margin)', count: items.filter(i => i.avg_profit_margin_pct >= 20).length },
            { id: 'loss-making', label: 'Low Margin (<10%)', count: items.filter(i => i.avg_profit_margin_pct < 10).length },
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Items</label>
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

          {/* Confidence Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Confidence</label>
            <select
              value={minConfidence}
              onChange={(e) => {
                setMinConfidence(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="0">All (0%+)</option>
              <option value="50">Medium (50%+)</option>
              <option value="70">High (70%+)</option>
              <option value="85">Very High (85%+)</option>
            </select>
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
              <option value="total_revenue_usd-desc">Revenue (High)</option>
              <option value="total_revenue_usd-asc">Revenue (Low)</option>
              <option value="avg_profit_margin_pct-desc">Margin % (High)</option>
              <option value="avg_profit_margin_pct-asc">Margin % (Low)</option>
              <option value="avg_profit_per_unit_usd-desc">Profit/Unit (High)</option>
              <option value="avg_profit_per_unit_usd-asc">Profit/Unit (Low)</option>
              <option value="avg_confidence_score-desc">Confidence (High)</option>
              <option value="avg_confidence_score-asc">Confidence (Low)</option>
              <option value="total_units_sold-desc">Units Sold (High)</option>
              <option value="total_units_sold-asc">Units Sold (Low)</option>
              <option value="sku-asc">SKU (A-Z)</option>
              <option value="sku-desc">SKU (Z-A)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading items...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No items found matching your filters.
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
                      onClick={() => handleColumnSort('total_units_sold')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Units Sold
                        {getSortIcon('total_units_sold')}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleColumnSort('total_revenue_usd')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Revenue
                        {getSortIcon('total_revenue_usd')}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Avg Price
                    </th>
                    <th
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleColumnSort('avg_estimated_cost_usd')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Est. Cost
                        {getSortIcon('avg_estimated_cost_usd')}
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
                    <th
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleColumnSort('avg_profit_margin_pct')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Margin %
                        {getSortIcon('avg_profit_margin_pct')}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleColumnSort('avg_confidence_score')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Confidence
                        {getSortIcon('avg_confidence_score')}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data Source
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedItems.map((item) => (
                    <tr key={item.sku} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-bold text-gray-900">{item.product_title}</div>
                          <div className="text-xs text-gray-500">SKU: {item.sku}</div>
                          <div className="text-xs text-gray-400 mt-1">
                            {item.times_ordered} orders
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-semibold">
                        {item.total_units_sold}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-semibold">
                        ${item.total_revenue_usd.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">
                        ${item.avg_selling_price_usd.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        ${item.avg_estimated_cost_usd.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          item.avg_profit_per_unit_usd >= 0 ? 'text-emerald-700 bg-emerald-100' : 'text-red-700 bg-red-100'
                        }`}>
                          ${item.avg_profit_per_unit_usd.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getMarginColor(item.avg_profit_margin_pct)}`}>
                          {item.avg_profit_margin_pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getConfidenceColor(item.avg_confidence_score)}`}>
                          {item.avg_confidence_score.toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-xs">
                        <div className="space-y-1">
                          {item.instances_with_invoice_data > 0 && (
                            <div className="text-green-600 font-medium">📄 {item.instances_with_invoice_data} direct</div>
                          )}
                          {item.instances_with_order_data > 0 && (
                            <div className="text-blue-600">📦 {item.instances_with_order_data} allocated</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                  <span className="font-medium">{Math.min(endIndex, filteredItems.length)}</span> of{' '}
                  <span className="font-medium">{filteredItems.length}</span> results
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
                    <span className="px-4 py-2 text-sm font-medium text-gray-700">
                      Page {currentPage} of {totalPages}
                    </span>
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
      {filteredItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600">Total SKUs</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{filteredItems.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600">Total Revenue</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">
              ${filteredItems.reduce((sum, i) => sum + i.total_revenue_usd, 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600">Total Estimated Cost</p>
            <p className="mt-2 text-3xl font-semibold text-blue-600">
              ${filteredItems.reduce((sum, i) => sum + i.total_estimated_cost_usd, 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600">Total Profit</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-600">
              ${filteredItems.reduce((sum, i) => sum + i.total_profit_usd, 0).toFixed(2)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
