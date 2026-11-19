# Purple Cocktail

Tienda de granizados y hamburguesas de Purple. La portada presenta seis productos con fotografía, ingredientes independientes y modelos de giro corto. La carta conserva las categorías, rangos de precio y opciones de orden de la tienda original. El cliente elige variantes, arma su carrito y abre su pedido en el WhatsApp de Purple. [Tienda publicada](https://purple-cocktail.vercel.app/) · [Catálogo original](https://tienda.treinta.co/purpleweb)

## Desarrollo local

Con Node.js 22 o posterior, ejecuta estos comandos desde la raíz del proyecto.

```sh
node scripts/build.mjs
node scripts/serve.mjs
```

La vista previa se abre en el puerto 4781. Vercel ejecuta la misma compilación, publica la carpeta `dist` y sirve la función de consulta del catálogo.

## Catálogo y pedidos

La primera carga usa `public/catalog/catalog.json`. La función `api/treinta.mjs` actualiza el catálogo desde la tienda pública de Purple. La ficha consulta las variantes del producto y el carrito vuelve a verificar los precios y las existencias al preparar el mensaje de WhatsApp. El pedido se guarda en el navegador del cliente.

## Fotografías y modelos

Los seis maestros PNG tienen transparencia y 3840 píxeles en el lado mayor. La tienda sirve versiones WebP adaptadas al tamaño de la pantalla. Las mallas GLB de los productos y los ingredientes se cargan bajo demanda y conservan la fotografía como alternativa. El manifiesto registra las dimensiones originales, las ampliaciones y las rutas de cada archivo. [Manifiesto visual](public/showcase/manifest.json) · [Maestros PNG](public/showcase/masters) · [Procedencia de las imágenes](scripts/arte/procedencia.json)

Cada escena tiene una composición horizontal y otra vertical para su fondo decorativo. El enlace a una escena usa el identificador del producto como fragmento de la dirección. [Fresa vodka](https://purple-cocktail.vercel.app/#fresa-vodka)
