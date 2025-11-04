'use client';

import { useEffect, useState } from 'react';
import { OrderCostAnalysis } from '@/lib/types';
import { format } from 'date-fns';

type TabType = 'all' | 'profitable' | 'low-margin' | 'recent';
type SortField = 'order_date' | 'profit_percentage' | 'total_fulfillment_cost_usd' | 'shopify_total_usd' | 'profit_usd' | 'order_number';
type SortOrder = 'asc' | 'desc';

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderCostAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<any>(null);

  // Filters and pagination
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [sortField, setSortField] = useState<SortField>('order_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(25);
  const [dateFilter, setDateFilter] = useState<string>('all'); // all, today, week, month
  const [hideZeroCost, setHideZeroCost] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  async function fetchOrders() {
    try {
      setLoading(true);
      const res = await fetch('/api/analysis/orders');
      const data = await res.json();

      if (data.success) {
        setOrders(data.data || []);
        console.log('📊 Orders API Debug Info:', {
          ordersReceived: data.data?.length || 0,
          apiCount: data.count,
          debugInfo: data.debug
        });
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchOrderDetails(orderNumber: string) {
    try {
      const res = await fetch(`/api/analysis/order-details?order_number=${orderNumber}`);
      const data = await res.json();

      if (data.success) {
        setOrderDetails(data.data);
        setSelectedOrder(orderNumber);
      }
    } catch (error) {
      console.error('Error fetching order details:', error);
    }
  }

  // Filter orders based on active tab
  const getFilteredOrders = () => {
    let filtered = [...orders];

    // Tab filter
    switch (activeTab) {
      case 'profitable':
        filtered = filtered.filter(o => (o.profit_percentage || 0) >= 30);
        break;
      case 'low-margin':
        filtered = filtered.filter(o => (o.profit_percentage || 0) < 15);
        break;
      case 'recent':
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        filtered = filtered.filter(o => new Date(o.order_date) >= sevenDaysAgo);
        break;
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const filterDate = new Date();

      switch (dateFilter) {
        case 'today':
          filterDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          filterDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          filterDate.setMonth(now.getMonth() - 1);
          break;
      }

      filtered = filtered.filter(o => new Date(o.order_date) >= filterDate);
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(order =>
        order.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.order_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Hide zero cost filter
    if (hideZeroCost) {
      filtered = filtered.filter(o => (o.total_fulfillment_cost_usd || 0) > 0);
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      // Handle different field types
      if (sortField === 'order_date') {
        return sortOrder === 'asc'
          ? new Date(aVal || 0).getTime() - new Date(bVal || 0).getTime()
          : new Date(bVal || 0).getTime() - new Date(aVal || 0).getTime();
      } else if (sortField === 'order_number') {
        // String comparison for order numbers
        aVal = String(aVal || '');
        bVal = String(bVal || '');
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      } else {
        // Numeric comparison for all other fields
        aVal = Number(aVal || 0);
        bVal = Number(bVal || 0);
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
    });

    return filtered;
  };

  const filteredOrders = getFilteredOrders();

  // Pagination
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  const getProfitColor = (profitPercentage: number) => {
    if (profitPercentage >= 30) return 'text-emerald-600 bg-emerald-50';
    if (profitPercentage >= 15) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  const getProfitBadge = (profitPercentage: number) => {
    if (profitPercentage >= 30) return { label: 'High', color: 'bg-emerald-500' };
    if (profitPercentage >= 15) return { label: 'Medium', color: 'bg-amber-500' };
    return { label: 'Low', color: 'bg-red-500' };
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
          <h1 className="text-3xl font-bold text-gray-900">Orders Analysis</h1>
          <p className="mt-2 text-gray-600">
            {filteredOrders.length} orders • ${filteredOrders.reduce((sum, o) => sum + (o.shopify_total_usd || 0), 0).toFixed(2)} total revenue
          </p>
        </div>
        <button
          onClick={fetchOrders}
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
            { id: 'all', label: 'All Orders', count: orders.length },
            { id: 'profitable', label: 'High Profit (30%+)', count: orders.filter(o => (o.profit_percentage || 0) >= 30).length },
            { id: 'low-margin', label: 'Low Margin (<15%)', count: orders.filter(o => (o.profit_percentage || 0) < 15).length },
            { id: 'recent', label: 'Last 7 Days', count: orders.filter(o => {
              const sevenDaysAgo = new Date();
              sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
              return new Date(o.order_date) >= sevenDaysAgo;
            }).length },
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Orders</label>
            <input
              type="text"
              placeholder="Search by order number..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Date Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
            <select
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
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
              <option value="order_date-desc">Date (Newest)</option>
              <option value="order_date-asc">Date (Oldest)</option>
              <option value="order_number-asc">Order # (A-Z)</option>
              <option value="order_number-desc">Order # (Z-A)</option>
              <option value="shopify_total_usd-desc">Revenue (High)</option>
              <option value="shopify_total_usd-asc">Revenue (Low)</option>
              <option value="total_fulfillment_cost_usd-desc">Cost (High)</option>
              <option value="total_fulfillment_cost_usd-asc">Cost (Low)</option>
              <option value="profit_usd-desc">Profit $ (High)</option>
              <option value="profit_usd-asc">Profit $ (Low)</option>
              <option value="profit_percentage-desc">Margin % (High)</option>
              <option value="profit_percentage-asc">Margin % (Low)</option>
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
              Hide orders with $0 cost (no invoice data)
            </span>
          </label>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading orders...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No orders found matching your filters.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleColumnSort('order_number')}
                    >
                      <div className="flex items-center gap-1">
                        Order
                        {getSortIcon('order_number')}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleColumnSort('order_date')}
                    >
                      <div className="flex items-center gap-1">
                        Date
                        {getSortIcon('order_date')}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleColumnSort('shopify_total_usd')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Revenue
                        {getSortIcon('shopify_total_usd')}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleColumnSort('total_fulfillment_cost_usd')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Cost
                        {getSortIcon('total_fulfillment_cost_usd')}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleColumnSort('profit_usd')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Profit
                        {getSortIcon('profit_usd')}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleColumnSort('profit_percentage')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Margin
                        {getSortIcon('profit_percentage')}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedOrders.map((order) => {
                    const badge = getProfitBadge(order.profit_percentage || 0);
                    return (
                      <tr key={order.order_number} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div>
                              <div className="text-sm font-bold text-gray-900">
                                {order.order_name || order.order_number}
                              </div>
                              <div className="text-sm text-gray-500">
                                {order.item_count} item(s)
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {order.order_date ? format(new Date(order.order_date), 'MMM d, yyyy') : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-semibold">
                          ${order.shopify_total_usd?.toFixed(2) || '0.00'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">
                          ${order.total_fulfillment_cost_usd?.toFixed(2) || '0.00'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                          <span className={`font-semibold ${order.profit_usd >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            ${order.profit_usd?.toFixed(2) || '0.00'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getProfitColor(order.profit_percentage || 0)}`}>
                            {order.profit_percentage?.toFixed(1) || '0.0'}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <button
                            onClick={() => fetchOrderDetails(order.order_number)}
                            className="text-blue-600 hover:text-blue-900 font-medium"
                          >
                            View Details →
                          </button>
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
                  <span className="font-medium">{Math.min(endIndex, filteredOrders.length)}</span> of{' '}
                  <span className="font-medium">{filteredOrders.length}</span> results
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

      {/* Order Details Modal */}
      {selectedOrder && orderDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">
                Order {orderDetails.order.order_name}
              </h2>
              <button
                onClick={() => {
                  setSelectedOrder(null);
                  setOrderDetails(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Line Items */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Products</h3>
                <div className="space-y-2">
                  {orderDetails.lineItems.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                      <div>
                        <p className="font-bold text-gray-900 text-lg">{item.title}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          <span className="font-medium">SKU:</span> {item.sku || 'N/A'} •
                          <span className="font-medium ml-2">Qty:</span> {item.quantity}
                        </p>
                      </div>
                      <p className="font-bold text-gray-900 text-xl">${(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Commodity Costs */}
              {orderDetails.commodityItems.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Unit & Domestic Shipping Costs</h3>
                  <div className="space-y-2">
                    {orderDetails.commodityItems.map((item: any, idx: number) => (
                      <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Unit Price:</span>
                          <span className="font-medium">${item.price_usd.toFixed(2)} <span className="text-gray-500">(¥{item.price_cny.toFixed(2)})</span></span>
                        </div>
                        <div className="flex justify-between text-sm mt-2">
                          <span className="text-gray-600">Domestic Freight:</span>
                          <span className="font-medium">${item.domestic_freight_usd.toFixed(2)} <span className="text-gray-500">(¥{item.domestic_freight_cny.toFixed(2)})</span></span>
                        </div>
                        <div className="flex justify-between text-sm mt-2 pt-2 border-t border-gray-300">
                          <span className="text-gray-900 font-semibold">Total:</span>
                          <span className="font-bold text-gray-900">${item.total_usd.toFixed(2)} <span className="text-gray-600">(¥{item.total_cny.toFixed(2)})</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Freight Costs */}
              {orderDetails.freightItems.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">International Shipping & Fees</h3>
                  <div className="space-y-2">
                    {orderDetails.freightItems.map((item: any, idx: number) => (
                      <div key={idx} className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">International Shipping:</span>
                          <span className="font-medium">${item.international_shipping_usd.toFixed(2)} <span className="text-gray-500">(¥{item.international_shipping_cny.toFixed(2)})</span></span>
                        </div>
                        <div className="flex justify-between text-sm mt-2">
                          <span className="text-gray-600">Service Fee:</span>
                          <span className="font-medium">${item.service_fee_usd.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Order Total (Revenue):</span>
                    <span className="font-bold text-gray-900 text-lg">${orderDetails.order.total_price.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Total Fulfillment Cost:</span>
                    <span className="font-bold text-gray-900 text-lg">
                      ${(
                        orderDetails.commodityItems.reduce((sum: number, item: any) => sum + item.total_usd, 0) +
                        orderDetails.freightItems.reduce((sum: number, item: any) => sum + item.international_shipping_usd + item.service_fee_usd, 0)
                      ).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-lg font-bold pt-3 border-t-2 border-green-300">
                    <span className="text-gray-900">Net Profit:</span>
                    <span className="text-emerald-600 text-2xl">
                      ${(
                        orderDetails.order.total_price -
                        orderDetails.commodityItems.reduce((sum: number, item: any) => sum + item.total_usd, 0) -
                        orderDetails.freightItems.reduce((sum: number, item: any) => sum + item.international_shipping_usd + item.service_fee_usd, 0)
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
