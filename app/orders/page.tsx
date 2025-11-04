'use client';

import { useEffect, useState } from 'react';
import { OrderCostAnalysis } from '@/lib/types';
import { format } from 'date-fns';

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderCostAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<any>(null);

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

  const filteredOrders = orders.filter(order =>
    order.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.order_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getProfitColor = (profitPercentage: number) => {
    if (profitPercentage >= 30) return 'text-green-600';
    if (profitPercentage >= 15) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Orders Analysis</h1>
        <p className="mt-2 text-gray-600">
          View detailed cost breakdown and profit margins for each order
        </p>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow p-4">
        <input
          type="text"
          placeholder="Search by order number..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading orders...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No orders found. Please sync Shopify data and upload invoices.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Revenue
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cost
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Profit
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Margin
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredOrders.map((order) => (
                  <tr key={order.order_number} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {order.order_name || order.order_number}
                      </div>
                      <div className="text-sm text-gray-500">
                        {order.item_count} item(s)
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {order.order_date ? format(new Date(order.order_date), 'MMM d, yyyy') : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                      ${order.shopify_total_usd?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      ${order.total_fulfillment_cost_usd?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                      ${order.profit_usd?.toFixed(2) || '0.00'}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-semibold ${getProfitColor(order.profit_percentage || 0)}`}>
                      {order.profit_percentage?.toFixed(1) || '0.0'}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => fetchOrderDetails(order.order_number)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                    <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{item.title}</p>
                        <p className="text-sm text-gray-500">SKU: {item.sku || 'N/A'} • Qty: {item.quantity}</p>
                      </div>
                      <p className="font-semibold text-gray-900">${(item.price * item.quantity).toFixed(2)}</p>
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
                      <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Unit Price:</span>
                          <span className="font-medium">${item.price_usd.toFixed(2)} (¥{item.price_cny.toFixed(2)})</span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                          <span className="text-gray-600">Domestic Freight:</span>
                          <span className="font-medium">${item.domestic_freight_usd.toFixed(2)} (¥{item.domestic_freight_cny.toFixed(2)})</span>
                        </div>
                        <div className="flex justify-between text-sm mt-1 pt-2 border-t border-gray-200">
                          <span className="text-gray-900 font-semibold">Total:</span>
                          <span className="font-semibold">${item.total_usd.toFixed(2)} (¥{item.total_cny.toFixed(2)})</span>
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
                      <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">International Shipping:</span>
                          <span className="font-medium">${item.international_shipping_usd.toFixed(2)} (¥{item.international_shipping_cny.toFixed(2)})</span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                          <span className="text-gray-600">Service Fee:</span>
                          <span className="font-medium">${item.service_fee_usd.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Order Total (Revenue):</span>
                    <span className="font-semibold text-gray-900">${orderDetails.order.total_price.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Total Fulfillment Cost:</span>
                    <span className="font-semibold text-gray-900">
                      ${(
                        orderDetails.commodityItems.reduce((sum: number, item: any) => sum + item.total_usd, 0) +
                        orderDetails.freightItems.reduce((sum: number, item: any) => sum + item.international_shipping_usd + item.service_fee_usd, 0)
                      ).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-lg font-bold pt-2 border-t-2 border-blue-300">
                    <span className="text-gray-900">Net Profit:</span>
                    <span className="text-green-600">
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
