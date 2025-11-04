'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';

interface InvoiceUpload {
  id: number;
  filename: string;
  upload_date: string;
  processed: boolean;
  row_count_commodity: number | null;
  row_count_freight: number | null;
  notes: string | null;
}

interface InvoiceDetails {
  invoice: InvoiceUpload;
  commodityItems: any[];
  freightItems: any[];
  affectedOrders: any[];
  affectedProducts: any[];
  summary: {
    totalOrders: number;
    totalProducts: number;
    totalCommodityCost: number;
    totalFreightCost: number;
    totalCost: number;
  };
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<number | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<InvoiceDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    fetchInvoices();

    // Check for invoice ID in query params
    const params = new URLSearchParams(window.location.search);
    const invoiceId = params.get('id');
    if (invoiceId) {
      fetchInvoiceDetails(parseInt(invoiceId));
    }
  }, []);

  async function fetchInvoices() {
    try {
      setLoading(true);
      const res = await fetch('/api/invoices');
      const data = await res.json();

      if (data.success) {
        setInvoices(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchInvoiceDetails(id: number) {
    try {
      setLoadingDetails(true);
      setSelectedInvoice(id);
      const res = await fetch(`/api/invoices/${id}`);
      const data = await res.json();

      if (data.success) {
        setInvoiceDetails(data.data);
      }
    } catch (error) {
      console.error('Error fetching invoice details:', error);
    } finally {
      setLoadingDetails(false);
    }
  }

  async function deleteInvoice(id: number, filename: string) {
    if (!confirm(`Are you sure you want to delete "${filename}"?\n\nThis will remove all cost data from this invoice and update your analysis.`)) {
      return;
    }

    try {
      setDeleting(id);
      const res = await fetch(`/api/invoices?id=${id}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (data.success) {
        setInvoices(invoices.filter(inv => inv.id !== id));
        if (selectedInvoice === id) {
          setSelectedInvoice(null);
          setInvoiceDetails(null);
        }
        alert('Invoice deleted successfully! Your analysis has been updated.');
      } else {
        alert('Error deleting invoice: ' + data.error);
      }
    } catch (error: any) {
      console.error('Error deleting invoice:', error);
      alert('Error deleting invoice: ' + error.message);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Invoice Management</h1>
          <p className="mt-2 text-gray-600">
            View and manage your uploaded invoice files
          </p>
        </div>
        <button
          onClick={fetchInvoices}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="mt-2 text-gray-500">No invoices uploaded yet.</p>
            <p className="mt-1 text-sm text-gray-400">
              Go to the Upload page to add your first invoice.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Filename
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Upload Date
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Commodity Items
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Freight Items
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div>
                          <div className="text-sm font-bold text-gray-900">{invoice.filename}</div>
                          <div className="text-xs text-gray-500">ID: {invoice.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {format(new Date(invoice.upload_date), 'MMM d, yyyy h:mm a')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {invoice.row_count_commodity || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        {invoice.row_count_freight || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {invoice.processed ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          ✓ Processed
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          ⏳ Processing
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-3">
                      <button
                        onClick={() => fetchInvoiceDetails(invoice.id)}
                        className="text-blue-600 hover:text-blue-900 font-medium"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => deleteInvoice(invoice.id, invoice.filename)}
                        disabled={deleting === invoice.id}
                        className={`text-red-600 hover:text-red-900 font-medium ${
                          deleting === invoice.id ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {deleting === invoice.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Details Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">
                Invoice Details
              </h2>
              <button
                onClick={() => {
                  setSelectedInvoice(null);
                  setInvoiceDetails(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {loadingDetails ? (
                <div className="text-center py-12 text-gray-500">Loading details...</div>
              ) : invoiceDetails ? (
                <>
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-blue-600">Orders Affected</p>
                      <p className="mt-2 text-3xl font-bold text-blue-700">{invoiceDetails.summary.totalOrders}</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-purple-600">Products Affected</p>
                      <p className="mt-2 text-3xl font-bold text-purple-700">{invoiceDetails.summary.totalProducts}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-green-600">Commodity Cost</p>
                      <p className="mt-2 text-2xl font-bold text-green-700">${invoiceDetails.summary.totalCommodityCost.toFixed(2)}</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-orange-600">Freight Cost</p>
                      <p className="mt-2 text-2xl font-bold text-orange-700">${invoiceDetails.summary.totalFreightCost.toFixed(2)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-gray-600">Total Cost</p>
                      <p className="mt-2 text-2xl font-bold text-gray-900">${invoiceDetails.summary.totalCost.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Affected Orders */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Affected Orders ({invoiceDetails.affectedOrders.length})</h3>
                    {invoiceDetails.affectedOrders.length > 0 ? (
                      <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {invoiceDetails.affectedOrders.map((order, idx) => (
                            <div key={idx} className="bg-white rounded p-3 border border-gray-200">
                              <p className="font-semibold text-gray-900 text-sm">{order.order_name}</p>
                              <p className="text-xs text-gray-500 mt-1">${order.total_price?.toFixed(2)}</p>
                              <p className="text-xs text-gray-400">{order.created_at ? format(new Date(order.created_at), 'MMM d, yyyy') : ''}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">No orders affected</p>
                    )}
                  </div>

                  {/* Commodity Items Details */}
                  {invoiceDetails.commodityItems.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Commodity Items ({invoiceDetails.commodityItems.length})</h3>
                      <div className="bg-blue-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-blue-100 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-blue-900">Order #</th>
                              <th className="px-3 py-2 text-left font-medium text-blue-900">SKU</th>
                              <th className="px-3 py-2 text-right font-medium text-blue-900">Unit Price</th>
                              <th className="px-3 py-2 text-right font-medium text-blue-900">Domestic Freight</th>
                              <th className="px-3 py-2 text-right font-medium text-blue-900">Total (USD)</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-blue-100">
                            {invoiceDetails.commodityItems.map((item, idx) => (
                              <tr key={idx} className="hover:bg-blue-50">
                                <td className="px-3 py-2 font-medium text-gray-900">{item.order_number}</td>
                                <td className="px-3 py-2 text-gray-600">{item.sku || 'N/A'}</td>
                                <td className="px-3 py-2 text-right text-gray-900">${item.price_usd?.toFixed(2)}</td>
                                <td className="px-3 py-2 text-right text-gray-900">${item.domestic_freight_usd?.toFixed(2)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-gray-900">${item.total_usd?.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Freight Items Details */}
                  {invoiceDetails.freightItems.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Freight Items ({invoiceDetails.freightItems.length})</h3>
                      <div className="bg-purple-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-purple-100 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-purple-900">Order #</th>
                              <th className="px-3 py-2 text-right font-medium text-purple-900">Weight</th>
                              <th className="px-3 py-2 text-right font-medium text-purple-900">Int'l Shipping</th>
                              <th className="px-3 py-2 text-right font-medium text-purple-900">Service Fee</th>
                              <th className="px-3 py-2 text-right font-medium text-purple-900">Total (USD)</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-purple-100">
                            {invoiceDetails.freightItems.map((item, idx) => (
                              <tr key={idx} className="hover:bg-purple-50">
                                <td className="px-3 py-2 font-medium text-gray-900">{item.order_number}</td>
                                <td className="px-3 py-2 text-right text-gray-600">{item.weight || 'N/A'}</td>
                                <td className="px-3 py-2 text-right text-gray-900">${item.international_shipping_usd?.toFixed(2)}</td>
                                <td className="px-3 py-2 text-right text-gray-900">${item.service_fee_usd?.toFixed(2)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-gray-900">
                                  ${((item.international_shipping_usd || 0) + (item.service_fee_usd || 0)).toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex">
          <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">Important Information</h3>
            <div className="mt-2 text-sm text-yellow-700">
              <ul className="list-disc list-inside space-y-1">
                <li>Click "View Details" to see which orders and products each invoice affects</li>
                <li>Deleting an invoice will remove all cost data associated with it</li>
                <li>Your order and product analysis will be automatically updated</li>
                <li>Orders without invoice data will show $0 for costs and 0% margin</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600">Total Invoices</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{invoices.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600">Total Commodity Items</p>
            <p className="mt-2 text-3xl font-semibold text-blue-600">
              {invoices.reduce((sum, inv) => sum + (inv.row_count_commodity || 0), 0)}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600">Total Freight Items</p>
            <p className="mt-2 text-3xl font-semibold text-purple-600">
              {invoices.reduce((sum, inv) => sum + (inv.row_count_freight || 0), 0)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
