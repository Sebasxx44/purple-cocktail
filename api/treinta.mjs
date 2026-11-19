// The shop's public storefront reads these endpoints. The store cannot be
// overridden by request parameters and this function only performs GETs.
const storeId = 'd5237746-de82-520b-be7a-f389e54c9e97';
const productsUrl = 'https://tienda.treinta.co/api/storefront/products';
const pageSize = 60;
const productIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function json(body, status = 200, cache = 'no-store') {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' },
  });
}

async function fromStore(url, signal) {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const error = new Error('No se pudo leer la tienda');
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function productDetail(id, signal) {
  const detail = await fromStore(productsUrl + '/' + id + '?storeId=' + storeId, signal);
  if (detail.product?.id !== id) throw new Error('Ficha incompleta');
  return detail.product;
}

async function listing(newest, signal) {
  const url = new URL(productsUrl);
  url.search = new URLSearchParams({
    storeId, storeSlug: 'purpleweb', page: '1', pageSize: String(pageSize),
  }).toString();
  if (newest) {
    url.searchParams.set('sort', 'created_at');
    url.searchParams.set('order', 'desc');
  } else {
    url.searchParams.set('withPriceBands', '1');
  }
  const first = await fromStore(url, signal);
  if (!Number.isInteger(first.total) || first.total < 0 || !Array.isArray(first.products)) {
    throw new Error('Listado incompleto');
  }
  const products = [...first.products];
  const pageCount = Math.ceil(first.total / (first.pageSize || pageSize));
  for (let page = 2; page <= pageCount; page++) {
    url.searchParams.set('page', String(page));
    const next = await fromStore(url, signal);
    products.push(...next.products);
  }
  if (products.length !== first.total || new Set(products.map(product => product.id)).size !== first.total) {
    throw new Error('El catálogo cambió durante la lectura');
  }
  return { ...first, products };
}

async function completeCatalog(signal) {
  const [catalog, newest] = await Promise.all([
    listing(false, signal),
    listing(true, signal).catch(() => null),
  ]);
  const configurable = catalog.products.filter(product => product.hasVariants);
  for (let i = 0; i < configurable.length; i += 5) {
    await Promise.all(configurable.slice(i, i + 5).map(async product => {
      try {
        const detail = await productDetail(product.id, signal);
        if (Array.isArray(detail.variants)) product.variants = detail.variants;
      } catch (error) {
        // A withdrawn product can disappear between its list and detail reads.
        if (error.status === 404) product.available = false;
      }
    }));
  }
  return {
    products: catalog.products,
    categories: catalog.categories,
    priceBands: catalog.priceBands,
    newestIds: newest?.products.map(product => product.id),
    fetchedAt: catalog.fetchedAt,
  };
}

export default {
  async fetch(request) {
    if (request.method !== 'GET') {
      return new Response(null, { status: 405, headers: { Allow: 'GET' } });
    }
    const id = new URL(request.url).searchParams.get('product');
    if (id !== null && !productIdPattern.test(id)) return json({ error: 'ID inválido' }, 400);
    const timeout = AbortSignal.timeout(8500);
    try {
      if (id !== null) return json({ product: await productDetail(id, timeout) });
      return json(await completeCatalog(timeout), 200, 'public, max-age=0, s-maxage=60');
    } catch (error) {
      if (id && error.status === 404) return json({ removedProductId: id }, 404);
      return json({ error: 'Catálogo temporalmente no disponible' }, 503);
    }
  },
};
