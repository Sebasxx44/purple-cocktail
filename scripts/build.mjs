import {access, cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {shell, findArt} from '../web/render.mjs';
import {escape} from '../web/shared.mjs';
import {reels} from '../web/reels-data.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const readJSON = async name => JSON.parse((await readFile(path.join(root,name),'utf8')).replace(/^\uFEFF/,''));
const data = await readJSON('public/catalog/catalog.json');
const draft=process.argv.includes('--draft');
const readStudio=name=>readJSON('public/showcase/'+name+'/manifest.json').catch(error=>{
  if (draft && error.code==='ENOENT') return {};
  throw error;
});
const [optionArt,configurations]=await Promise.all([readStudio('options'),readStudio('configurations')]);
let art = [];
try {
  const manifest = await readJSON('public/showcase/manifest.json');
  art = Array.isArray(manifest) ? manifest : manifest.products;
  if (!Array.isArray(art)) throw new Error('Formato de manifiesto sin productos');
} catch (error) {
  if (!process.argv.includes('--draft')) throw error;
}
if (!process.argv.includes('--draft')) {
  const files=new Set();
  for (const piece of Object.values(optionArt)) {
    for(const key of ['image','imageSmall','master','model']) files.add(piece[key]);
  }
  for (const p of data.products.filter(product=>product.variants?.length)) {
    const base=configurations[p.slug];
    if(!base) throw new Error('Falta el vaso de '+p.slug);
    for(const key of ['image','imageSmall','model']) files.add(base[key]);
    for(const flavor of Object.values(base.flavors||{})) {files.add(flavor.image);files.add(flavor.imageSmall);}
  }
  await Promise.all([...files].map(file=>access(path.join(root,'public',file))));
  for (const reel of reels) {
    await Promise.all([reel.poster,reel.video].map(file=>access(path.join(root,'public',file))));
  }
  for (const slug of data.featured) {
    const product = data.products.find(p=>p.slug===slug), entry=product && findArt(art,product);
    if (!entry?.image || !entry?.master || !entry?.ingredients?.length) throw new Error('Faltan imágenes o ingredientes de '+slug);
    const paths=[entry.image,entry.imageSmall,entry.model,entry.master,'/showcase/backgrounds/'+slug+'-wide.webp','/showcase/backgrounds/'+slug+'-mobile.webp',
      ...entry.ingredients.flatMap(piece=>[piece.image,piece.model,piece.master])];
    await Promise.all(paths.map(file=>access(path.join(root,'public',file))));
  }
}
await mkdir(dist,{recursive:true});
await cp(path.join(root,'public'),dist,{recursive:true});
await cp(path.join(root,'web'),path.join(dist,'web'),{recursive:true});
const first = data.products.find(p=>p.slug===data.featured[0]);
for (const entry of art) {
  const miniature=await readFile(path.join(root,'public/showcase/products',entry.slug+'-preview.webp'));
  entry.preview='data:image/webp;base64,'+miniature.toString('base64');
}
const hero = findArt(art,first);
const portrait = hero.image || first.image;
const payload=JSON.stringify({data,art,optionArt,configurations}).replace(/</g,'\\u003c');
const page = `<!doctype html>
<html lang="es-CO"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Purple · Granizados y hamburguesas</title>
<meta name="description" content="Explora los granizados y hamburguesas de Purple en 3D. Elige sabores y toppings, arma tu carrito y pide por WhatsApp.">
<meta name="theme-color" content="#ad89e5"><meta property="og:title" content="Purple · Granizados y hamburguesas"><meta property="og:description" content="Recorre la selección de Purple, descubre sus ingredientes y arma tu pedido."><meta property="og:locale" content="es_CO"><meta property="og:type" content="website">
<meta property="og:image" content="https://purple-cocktail.vercel.app/catalog/images/arandanos-perlas.webp"><link rel="icon" href="/ui/favicon.svg" type="image/svg+xml">
<link rel="preload" as="font" type="font/woff2" href="/fonts/bebas-neue-latin.woff2" crossorigin><link rel="preload" as="image" fetchpriority="high" href="${escape(portrait)}"${hero.imageSmall?' imagesrcset="'+escape(hero.imageSmall)+' '+hero.smallSize[0]+'w, '+escape(portrait)+' '+hero.imageSize[0]+'w" imagesizes="(max-width: 690px) 64vw, 34vw"':''}>
<link rel="stylesheet" href="/fonts/fonts.css?v=purple-type-2"><link rel="stylesheet" href="/web/style.css"><link rel="stylesheet" href="/web/ingredients-motion.css"><link rel="stylesheet" href="/web/reels.css"><link rel="stylesheet" href="/web/product-detail.css">
<script>document.documentElement.classList.add('js');if(!['#carta','#reels'].includes(location.hash)&&!location.hash.startsWith('#reel-'))document.documentElement.classList.add('in-showcase')</script></head><body>
${shell(data,art,reels)}
<script id="storefront-data" type="application/json">${payload}</script>
<script type="module" src="/web/app.mjs"></script></body></html>`;
await writeFile(path.join(dist,'index.html'),page);
console.log(`Purple: ${data.products.length} productos, ${art.length} escenas. Página generada en dist/.`);
