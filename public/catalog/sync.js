const sourceUrl = 'https://tienda.treinta.co/purpleweb';
const money = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
});

async function queryStore(path, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(path, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok && !(response.status === 404 && data.removedProductId)) {
      throw new Error('Catálogo no disponible');
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function stockOrNull(value) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
}

function currentOptions(rawVariants) {
  const groups = new Map();
  const variants = rawVariants.map(raw => {
    if (!raw.id || !Number.isFinite(raw.price) || raw.price < 0) {
      throw new Error('Variante incompleta');
    }
    const stock = stockOrNull(raw.stock);
    const attributes = {};
    for (const { name, value } of raw.attributes ?? []) {
      if (!groups.has(name)) groups.set(name, new Set());
      groups.get(name).add(value);
      attributes[name] = value;
    }
    return {
      id: raw.id, label: raw.name, price: raw.price, stock,
      available: stock !== 0, attributes,
    };
  });
  return {
    variants,
    variantGroups: [...groups].map(([label, options]) => ({ label, options: [...options] })),
  };
}

function currentProduct(raw, previous, isDetail = false) {
  if (!raw.id || typeof raw.name !== 'string' || !Number.isFinite(raw.price) || raw.price < 0) {
    throw new Error('Producto incompleto');
  }
  // The detail endpoint is a projection. In particular, Treinta omits category
  // even for products with a published category in its current listing.
  const listValues = isDetail ? previous : undefined;
  const hasVariants = raw.hasVariants ?? Boolean(listValues?.variants?.length);
  let options = { variants: [], variantGroups: [] };
  if (Array.isArray(raw.variants)) {
    options = currentOptions(raw.variants);
  } else if (hasVariants && previous) {
    options = { variants: previous.variants, variantGroups: previous.variantGroups };
  }
  const { variants } = options;
  const hasOptions = hasVariants || variants.length > 0;
  let stock = stockOrNull(raw.stock === undefined ? listValues?.stock : raw.stock);
  // In a detail response the parent SKU can be zero even when every flavor is in stock.
  if (isDetail && variants.length) {
    stock = variants.some(v => v.stock === null)
      ? null : variants.reduce((total, v) => total + v.stock, 0);
  }
  const available = (raw.available ?? listValues?.available) !== false &&
    (hasOptions ? variants.some(v => v.available) : stock !== 0);
  const photo = raw.imageUrl === undefined ? listValues?.imageSource : raw.imageUrl;
  const imageSource = typeof photo === 'string' && photo.startsWith('https://') ? photo : null;
  const keepLocalImage = Boolean(previous?.cutout) || imageSource === previous?.imageSource;
  const category = raw.category === undefined ? listValues?.category : raw.category;
  const description = raw.description === undefined ? listValues?.description : raw.description;
  return {
    id: raw.id, slug: previous?.slug ?? 'producto-' + raw.id,
    name: raw.name.trim().replace(/\s+/g, ' '),
    category: category || null, price: raw.price, description: description?.trim() ?? '',
    available, stock,
    image: keepLocalImage ? previous.image : imageSource,
    imageSizeOriginal: keepLocalImage ? previous.imageSizeOriginal : null,
    ...(previous?.cutout && {cutout:previous.cutout, thumbnail:previous.thumbnail}),
    imageSource, sourceUrl: sourceUrl + '/producto/' + raw.id,
    rank: previous?.rank ?? 0, newestRank: previous?.newestRank ?? 0,
    ingredients: previous?.ingredients ?? [], ...options,
  };
}

function currentBand(band) {
  const { min, max } = band;
  let label;
  if (min == null) label = 'Hasta ' + money.format(max);
  else if (max == null) label = 'Más de ' + money.format(min);
  else label = money.format(min) + ' a ' + money.format(max);
  return { ...band, label };
}

// Render the bundled catalog immediately. Apply this result asynchronously.
// A failed read returns the exact input object so the caller can keep its state.
export async function refreshCatalog(snapshot) {
  try {
    const data = await queryStore('/api/treinta', 11000);
    if (!Array.isArray(data.products) || !Array.isArray(data.categories) ||
        !Array.isArray(data.priceBands) || !data.fetchedAt) return snapshot;
    const previous = new Map(snapshot.products.map(product => [product.id, product]));
    const newest = new Map((data.newestIds ?? []).map((id, i) => [id, i]));
    const products = data.products.map((raw, rank) => {
      const old = previous.get(raw.id);
      const product = currentProduct(raw, old);
      product.rank = rank;
      product.newestRank = newest.get(raw.id) ?? old?.newestRank ?? rank;
      return product;
    });
    const slugs = new Set(products.map(product => product.slug));
    return {
      ...snapshot, store: { ...snapshot.store, fetchedAt: data.fetchedAt },
      products, categories: data.categories,
      priceBands: data.priceBands.map(currentBand),
      featured: snapshot.featured.filter(slug => slugs.has(slug)),
    };
  } catch {
    return snapshot;
  }
}

// Use when opening a detail and again before handing a cart to WhatsApp.
export async function refreshProduct(product) {
  try {
    const data = await queryStore('/api/treinta?product=' + encodeURIComponent(product.id), 5500);
    if (data.removedProductId === product.id) {
      return { ...product, available: false, stock: 0,
        variants: product.variants.map(v => ({ ...v, available: false, stock: 0 })) };
    }
    if (data.product?.id !== product.id) return product;
    return currentProduct(data.product, product, true);
  } catch {
    return product;
  }
}
