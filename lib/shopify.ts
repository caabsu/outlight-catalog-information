import '@shopify/shopify-api/adapters/node';
import { shopifyApi } from '@shopify/shopify-api';

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: ['read_orders', 'read_products'],
  hostName: process.env.SHOPIFY_STORE_DOMAIN!.replace('.myshopify.com', ''),
  apiVersion: (process.env.SHOPIFY_API_VERSION || '2025-10') as any,
  isEmbeddedApp: false,
});

// Helper function to make REST API calls
export async function shopifyRestRequest(endpoint: string, method: string = 'GET', body?: any) {
  const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${process.env.SHOPIFY_API_VERSION}${endpoint}`;

  const headers: HeadersInit = {
    'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!,
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Fetch all orders with pagination
export async function fetchAllOrders(limit: number = 250) {
  let allOrders: any[] = [];
  let hasNextPage = true;
  let pageInfo: string | null = null;

  while (hasNextPage) {
    const endpoint = pageInfo
      ? `/orders.json?limit=${limit}&page_info=${pageInfo}`
      : `/orders.json?limit=${limit}&status=any`;

    const data = await shopifyRestRequest(endpoint);

    if (data.orders && data.orders.length > 0) {
      allOrders = allOrders.concat(data.orders);

      // Check if there's a next page
      const linkHeader = data.link;
      if (linkHeader && linkHeader.includes('rel="next"')) {
        // Extract page_info from link header
        const nextMatch = linkHeader.match(/page_info=([^&>]+)/);
        pageInfo = nextMatch ? nextMatch[1] : null;
        hasNextPage = !!pageInfo;
      } else {
        hasNextPage = false;
      }
    } else {
      hasNextPage = false;
    }
  }

  return allOrders;
}

// Fetch all products with pagination
export async function fetchAllProducts(limit: number = 250) {
  let allProducts: any[] = [];
  let hasNextPage = true;
  let pageInfo: string | null = null;

  while (hasNextPage) {
    const endpoint = pageInfo
      ? `/products.json?limit=${limit}&page_info=${pageInfo}`
      : `/products.json?limit=${limit}`;

    const data = await shopifyRestRequest(endpoint);

    if (data.products && data.products.length > 0) {
      allProducts = allProducts.concat(data.products);

      // Check if there's a next page
      const linkHeader = data.link;
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextMatch = linkHeader.match(/page_info=([^&>]+)/);
        pageInfo = nextMatch ? nextMatch[1] : null;
        hasNextPage = !!pageInfo;
      } else {
        hasNextPage = false;
      }
    } else {
      hasNextPage = false;
    }
  }

  return allProducts;
}

// Fetch a single order by order number
export async function fetchOrderByNumber(orderNumber: string) {
  try {
    const data = await shopifyRestRequest(`/orders.json?name=${encodeURIComponent(orderNumber)}&status=any`);
    return data.orders && data.orders.length > 0 ? data.orders[0] : null;
  } catch (error) {
    console.error(`Error fetching order ${orderNumber}:`, error);
    return null;
  }
}

export { shopify };
