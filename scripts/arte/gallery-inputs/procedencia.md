# Dirección de arte de las galerías Purple

`public/showcase/gallery/manifest.json` reúne los quince granizados individuales y las nueve entradas que Treinta clasifica como hamburguesas. American Purple y Mistic Fríes se presentan en sus boles de papas. La Margarita tradicional de 22 onzas aparece en la galería de granizados aunque Treinta deja vacía su categoría.

## Productos enteros

Absolut Crispy, Purple Classic, Infinive, Wendys Smash, American Purple y Mistic Fríes tienen renders de estudio generados individualmente con ImageGen. Las fotos y recetas de Purple guiaron el aspecto de cada plato. La carpeta `platos/` contiene los seis PNG originales transparentes y `generacion.json` recoge los prompts, las referencias y las dimensiones nativas.

Los granizados reutilizan las fotografías y los modelos del configurador. Cuatro grupos de presentaciones comparten fotografías oficiales con los mismos píxeles. Cada SKU conserva su nombre, graduación declarada, tamaño y precio del catálogo. La reconstrucción del granizado sin licor de 22 onzas se documenta en `../granizado-sin-licor-22-onzas.json`. El extremo superior del émbolo que asoma en Todos los toppings se documenta en `../configuration-inputs/plunger-tip.md`.

Los PNG maestros tienen canal alfa y 3840 píxeles en su lado mayor. El exportador amplía las imágenes fuente con interpolación Lanczos y alfa premultiplicado. El WebP de alta densidad comparte las dimensiones del PNG. El modelo de cada plato usa el perfil del render y una textura con coordenadas UV registradas para el giro del visor.

## Fondos y elementos flotantes

`escenas.json` establece el color del escenario, las dos piezas flotantes y la composición de escritorio y móvil para cada SKU. Las seis escenas principales reutilizan las fotografías editoriales del encabezado. Ocho fondos nuevos se generaron con ImageGen integrado a partir de los sabores y de los ingredientes documentados. `fondos.json` y `fondos-extra.json` conservan los textos de generación. Las fotografías fuente se guardan como WebP en esta carpeta. El cítrico seco de las dos Margaritas se generó tomando como referencia la rueda fotografiada por Purple y se documenta en `citrico.json`.

`export_gallery_food.py --mode dishes` prepara las hamburguesas y los dos boles a partir de los renders. `export_gallery.py` prepara los fondos, las piezas secundarias y las texturas de alta densidad. La exportación comparte los archivos grandes cuando dos presentaciones utilizan el mismo maestro.
