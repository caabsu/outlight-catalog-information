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

// Helper function to make REST API calls with pagination support
export async function shopifyRestRequest(endpoint: string, method: string = 'GET', body?: any): Promise<{ data: any; linkHeader: string | null }> {
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

  const data = await response.json();
  const linkHeader = response.headers.get('link');

  return { data, linkHeader };
}

// Fetch all orders with pagination
export async function fetchAllOrders(limit: number = 250) {
  let allOrders: any[] = [];
  let nextPageUrl: string | null = null;
  let pageCount = 0;

  console.log('Starting to fetch all orders from Shopify...');

  while (true) {
    pageCount++;
    const endpoint = nextPageUrl || `/orders.json?limit=${limit}&status=any`;

    console.log(`Fetching page ${pageCount}...`);
    const { data, linkHeader } = await shopifyRestRequest(endpoint);

    if (data.orders && data.orders.length > 0) {
      allOrders = allOrders.concat(data.orders);
      console.log(`Page ${pageCount}: Got ${data.orders.length} orders. Total so far: ${allOrders.length}`);

      // Parse Link header for next page
      if (linkHeader) {
        const links = linkHeader.split(',');
        const nextLink = links.find(link => link.includes('rel="next"'));

        if (nextLink) {
          // Extract URL from <url>; rel="next"
          const urlMatch = nextLink.match(/<([^>]+)>/);
          if (urlMatch && urlMatch[1]) {
            // Extract just the path and query from the full URL
            const fullUrl = urlMatch[1];
            const pathMatch = fullUrl.match(/\/admin\/api\/[^/]+(.+)/);
            nextPageUrl = pathMatch ? pathMatch[1] : null;
          } else {
            nextPageUrl = null;
          }
        } else {
          nextPageUrl = null;
        }
      } else {
        nextPageUrl = null;
      }

      // If no more pages or we got fewer results than the limit, we're done
      if (!nextPageUrl || data.orders.length < limit) {
        break;
      }
    } else {
      console.log('No more orders found.');
      break;
    }

    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`Finished fetching all orders. Total: ${allOrders.length}`);
  return allOrders;
}

// Fetch all products with pagination
export async function fetchAllProducts(limit: number = 250) {
  let allProducts: any[] = [];
  let nextPageUrl: string | null = null;
  let pageCount = 0;

  console.log('Starting to fetch all products from Shopify...');

  while (true) {
    pageCount++;
    const endpoint = nextPageUrl || `/products.json?limit=${limit}`;

    console.log(`Fetching page ${pageCount}...`);
    const { data, linkHeader } = await shopifyRestRequest(endpoint);

    if (data.products && data.products.length > 0) {
      allProducts = allProducts.concat(data.products);
      console.log(`Page ${pageCount}: Got ${data.products.length} products. Total so far: ${allProducts.length}`);

      // Parse Link header for next page
      if (linkHeader) {
        const links = linkHeader.split(',');
        const nextLink = links.find(link => link.includes('rel="next"'));

        if (nextLink) {
          const urlMatch = nextLink.match(/<([^>]+)>/);
          if (urlMatch && urlMatch[1]) {
            const fullUrl = urlMatch[1];
            const pathMatch = fullUrl.match(/\/admin\/api\/[^/]+(.+)/);
            nextPageUrl = pathMatch ? pathMatch[1] : null;
          } else {
            nextPageUrl = null;
          }
        } else {
          nextPageUrl = null;
        }
      } else {
        nextPageUrl = null;
      }

      if (!nextPageUrl || data.products.length < limit) {
        break;
      }
    } else {
      console.log('No more products found.');
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`Finished fetching all products. Total: ${allProducts.length}`);
  return allProducts;
}

// Fetch a single order by order number
export async function fetchOrderByNumber(orderNumber: string) {
  try {
    const { data } = await shopifyRestRequest(`/orders.json?name=${encodeURIComponent(orderNumber)}&status=any`);
    return data.orders && data.orders.length > 0 ? data.orders[0] : null;
  } catch (error) {
    console.error(`Error fetching order ${orderNumber}:`, error);
    return null;
  }
}

export { shopify };
