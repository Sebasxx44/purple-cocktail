// Cada entrada representa una porción de la receta. El orden va de la base a la tapa.
// Repetir carne y queso por separado permite retirar una unidad y conservar la alternancia.
const layers = (...keys) => keys.map(key => ({key, qty: 1}));
const doubleAmerican = ['patty', 'american-cheese', 'patty', 'american-cheese'];

// La ficha y la foto de cada SKU están en public/catalog/catalog.json (sourceUrl, imageSource).
// «optional» reúne ingredientes presentes en otros platos de Purple para solicitar al local.
// Treinta solo publica la jeringa de licor en Adicionales. Cualquier extra de estos platos
// necesita confirmación de disponibilidad y precio por parte de Purple.
export const burgerRecipes = {
  'absolut-crispy': {
    type: 'burger',
    // La carta enumera tres carnes, tres quesos y salsa smash. Purple también menciona doble
    // tocineta y BBQ en su presentación. https://www.instagram.com/purpleburguer_/reel/DfcrD_2xu3o/
    layers: [
      ...layers('bun-bottom', 'smash-sauce', ...doubleAmerican, 'patty', 'american-cheese'),
      {key: 'bacon', qty: 2},
      ...layers('crispy-onion', 'bbq', 'bun-top'),
    ],
    optional: ['pickles', 'cream-cheese'],
  },
  'american-purple': {
    type: 'fries',
    support: 'serving-bowl',
    layers: layers('fries', 'american-cheese-sauce', 'bacon-bits'),
    optional: ['crispy-onion', 'bbq', 'sausage'],
  },
  atlantica: {
    type: 'burger',
    // Debajo de la tapa están la salsa de la casa, los pepinillos y la salsa de tocineta.
    // La marca muestra la preparación en su video. https://www.instagram.com/purpleburguer_/reel/DfC7__ux2EQ/
    layers: layers('bun-bottom', ...doubleAmerican, 'bacon-jam', 'pickles', 'house-sauce', 'bun-top'),
    optional: ['crispy-onion', 'cream-cheese'],
  },
  infinive: {
    type: 'burger',
    // La foto de la pieza individual muestra el queso crema con tocineta picada. El local
    // detalla las hamburguesas del Combo Infinive en https://tienda.treinta.co/purpleweb/producto/9c139c89-e313-5477-ba15-af559ba16c50
    // y usa la misma foto y nombre en https://www.rappi.com.co/restaurantes/900433305-purple-burguer
    note: 'La foto de Infinive y la ficha de su combo en la carta de Purple documentan esta preparación.',
    layers: layers('bun-bottom', ...doubleAmerican, 'cream-cheese', 'bacon-bits', 'house-sauce', 'bun-top'),
    optional: ['crispy-onion', 'pickles'],
  },
  'jack-bacon': {
    type: 'burger',
    // La foto y el reel muestran mozzarella sobre cada carne y queso crema bajo la tapa.
    // https://www.instagram.com/purpleburguer_/reel/Dew4goex8sK/
    layers: layers('bun-bottom', 'house-sauce', 'patty', 'mozzarella', 'patty', 'mozzarella', 'whisky-bacon', 'cream-cheese', 'bun-top'),
    optional: ['crispy-onion', 'pickles'],
  },
  'mistic-fries': {
    type: 'fries',
    support: 'serving-bowl',
    layers: layers('fries', 'cheddar', 'bacon-bits', 'crispy-onion', 'sausage', 'bbq'),
    optional: ['american-cheese-sauce'],
  },
  'purple-classic': {
    type: 'burger',
    // Purple utiliza la misma toma de la hamburguesa con dos fondos diferentes en Treinta
    // (Purple Classic) y en su menú de domicilio (Mistic classic). Se distinguen dos carnes,
    // dos capas de queso, tocineta y salsa. https://www.rappi.com.co/restaurantes/900433305-purple-burguer
    note: 'Base identificada en la foto de Purple y en la descripción de la Classic en su menú de domicilio.',
    layers: layers('bun-bottom', ...doubleAmerican, 'bacon', 'house-sauce', 'bun-top'),
    optional: ['crispy-onion', 'pickles'],
  },
  'purple-crispy': {
    type: 'burger',
    layers: layers('bun-bottom', ...doubleAmerican, 'bacon', 'crispy-onion', 'smash-sauce', 'bun-top'),
    // El Combo Crispy x2 de Purple también menciona BBQ; se puede consultar para la individual.
    optional: ['bbq', 'pickles'],
  },
  'wendys-smash': {
    type: 'burger',
    // La carta de Treinta especifica doble americano; la foto muestra dados de tocineta,
    // cebolla al vino y una salsa bajo el pan que el menú de domicilio llama salsa especial.
    layers: layers('bun-bottom', ...doubleAmerican, 'wine-onion', 'bacon-bits', 'house-sauce', 'bun-top'),
    optional: ['pickles', 'crispy-onion'],
  },
};
