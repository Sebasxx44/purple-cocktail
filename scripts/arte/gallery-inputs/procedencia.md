# Dirección de arte de las galerías Purple

`public/showcase/gallery/manifest.json` reúne los quince granizados individuales y las nueve entradas que Treinta clasifica como hamburguesas. American Purple y Mistic Fríes se presentan en sus boles de papas. La Margarita tradicional de 22 onzas aparece en la galería de granizados aunque Treinta deja vacía su categoría.

## Productos enteros

Las fichas y los enlaces a las fotografías originales se encuentran en los campos `sourceUrl` e `imageSource` de `public/catalog/catalog.json`. Las seis incorporaciones de comida se recortaron de las fotografías del SKU. `contornos.json` conserva los puntos usados para separar el producto de la mesa. El contorno inferior del bol American Purple se trazó sobre el cartón para retirar la mano que lo sostiene.

Los granizados reutilizan las fotografías y los modelos del configurador. Cuatro grupos de presentaciones comparten fotografías oficiales con los mismos píxeles. Cada SKU conserva su nombre, graduación declarada, tamaño y precio del catálogo. La reconstrucción del granizado sin licor de 22 onzas se documenta en `../granizado-sin-licor-22-onzas.json`. El extremo superior del émbolo que asoma en Todos los toppings se documenta en `../configuration-inputs/plunger-tip.md`.

Cada PNG tiene canal alfa y 3840 píxeles en su lado mayor. Los nuevos maestros fotográficos se ampliaron a partir del recorte original con interpolación Lanczos y alfa premultiplicado. El WebP de alta densidad usa la misma silueta y las dos mismas dimensiones que el PNG. Para los modelos se proyecta la vista frontal sobre un volumen redondeado con coordenadas UV. Las texturas mantienen el encuadre de la fotografía durante el giro limitado del visor.

## Fondos y elementos flotantes

`escenas.json` establece el color del escenario, las dos piezas flotantes y la composición de escritorio y móvil para cada SKU. Las seis escenas principales reutilizan las fotografías editoriales del encabezado. Ocho fondos nuevos se generaron con ImageGen integrado a partir de los sabores y de los ingredientes documentados. `fondos.json` y `fondos-extra.json` conservan los textos de generación. Las fotografías fuente se guardan como WebP en esta carpeta. El cítrico seco de las dos Margaritas se generó tomando como referencia la rueda fotografiada por Purple y se documenta en `citrico.json`.

`export_gallery_food.py` prepara los productos enteros desde las fotos de Treinta. `export_gallery.py` prepara las dos orientaciones del fondo, las piezas y el manifiesto con las rutas públicas. La exportación comparte los archivos grandes cuando el SKU utiliza un mismo maestro. Cada fondo recibe su propio encuadre y ajuste de contraste en las zonas de texto.
