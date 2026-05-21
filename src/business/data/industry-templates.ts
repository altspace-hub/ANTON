/**
 * industry-templates.ts — 40 pre-built catalogues a merchant can load
 * with one tap, then edit freely.
 *
 * Each template is a flat list of items grouped into segments (the
 * existing CatalogueItem.category field on the items service).
 *
 * Prices are realistic 2026 Swedish street prices. The merchant edits
 * everything — these are *starting points*, not a recommendation.
 *
 * VAT rates follow Skatteverket's 2026 schedule:
 *   25 % — standard (services, alcohol, retail, beauty, trades)
 *   12 % — restaurant food on-premise, hotel, takeaway food, groceries
 *    6 % — books, newspapers, sports, transport, cultural events
 *    0 % — certain medical / education (not used in any default here)
 *
 * The merchant can change any item's VAT rate after loading the
 * template; the rate column on every item is editable.
 */

export interface TemplateItem {
  name: string;
  priceSek: number;
  vatRate: 0 | 6 | 12 | 25;
  /** Optional SKU / stock code — most service templates leave this blank;
   *  retail templates pre-fill so the merchant can edit. */
  sku?: string;
}

export interface TemplateSegment {
  /** Segment label shown as the category chip / tab. */
  label: string;
  items: TemplateItem[];
}

export interface IndustryTemplate {
  /** Stable id (slug). Used as the key in the picker. */
  id: string;
  /** Human-readable label shown to the merchant. */
  label: string;
  /** Single emoji rendered next to the label in the picker. */
  emoji: string;
  /** Pithy one-liner shown under the label. */
  tagline: string;
  /** "Default" VAT for the industry — the items override per-line, but
   *  this is what new items added afterwards inherit. */
  defaultVatRate: 0 | 6 | 12 | 25;
  /** Group buckets — Food & Drink / Beauty & Wellness / Trades etc. Used
   *  to chunk the picker UI. */
  group:
    | 'food-drink'
    | 'beauty-wellness'
    | 'trades'
    | 'auto-mobility'
    | 'retail'
    | 'professional';
  segments: TemplateSegment[];
}

// ───────────────────────────────────────────────────────────────────────
// FOOD & DRINK (12)
// ───────────────────────────────────────────────────────────────────────

const TEMPLATE_CAFE: IndustryTemplate = {
  id: 'cafe',
  label: 'Café / Coffee shop',
  emoji: '☕',
  tagline: 'Espresso bar, light pastries, lunch sandwiches.',
  defaultVatRate: 12,
  group: 'food-drink',
  segments: [
    {
      label: 'Espresso',
      items: [
        { name: 'Espresso',         priceSek: 28, vatRate: 12 },
        { name: 'Double espresso',  priceSek: 36, vatRate: 12 },
        { name: 'Cappuccino',       priceSek: 42, vatRate: 12 },
        { name: 'Latte',            priceSek: 45, vatRate: 12 },
        { name: 'Americano',        priceSek: 38, vatRate: 12 },
        { name: 'Macchiato',        priceSek: 38, vatRate: 12 },
        { name: 'Flat white',       priceSek: 45, vatRate: 12 },
        { name: 'Cortado',          priceSek: 40, vatRate: 12 },
      ],
    },
    {
      label: 'Other drinks',
      items: [
        { name: 'Tea (pot)',         priceSek: 35, vatRate: 12 },
        { name: 'Hot chocolate',     priceSek: 42, vatRate: 12 },
        { name: 'Iced coffee',       priceSek: 45, vatRate: 12 },
        { name: 'Fresh juice',       priceSek: 48, vatRate: 12 },
        { name: 'Chai latte',        priceSek: 48, vatRate: 12 },
        { name: 'Sparkling water',   priceSek: 28, vatRate: 12 },
      ],
    },
    {
      label: 'Food',
      items: [
        { name: 'Cinnamon bun',      priceSek: 35, vatRate: 12 },
        { name: 'Croissant',         priceSek: 30, vatRate: 12 },
        { name: 'Cake slice',        priceSek: 55, vatRate: 12 },
        { name: 'Sandwich',          priceSek: 75, vatRate: 12 },
        { name: 'Salad bowl',        priceSek: 95, vatRate: 12 },
        { name: 'Soup of the day',   priceSek: 89, vatRate: 12 },
        { name: 'Smörgås',           priceSek: 65, vatRate: 12 },
      ],
    },
  ],
};

const TEMPLATE_BAR: IndustryTemplate = {
  id: 'bar',
  label: 'Bar / Pub',
  emoji: '🍺',
  tagline: 'Beer, wine, cocktails, simple food.',
  defaultVatRate: 25,
  group: 'food-drink',
  segments: [
    {
      label: 'Beer',
      items: [
        { name: 'Lager (40 cl)',     priceSek: 75, vatRate: 25 },
        { name: 'Lager (50 cl)',     priceSek: 89, vatRate: 25 },
        { name: 'IPA (40 cl)',       priceSek: 85, vatRate: 25 },
        { name: 'Stout (40 cl)',     priceSek: 85, vatRate: 25 },
        { name: 'Pilsner (50 cl)',   priceSek: 79, vatRate: 25 },
        { name: 'Non-alc beer',      priceSek: 65, vatRate: 25 },
      ],
    },
    {
      label: 'Wine',
      items: [
        { name: 'House red (glass)',   priceSek: 95,  vatRate: 25 },
        { name: 'House white (glass)', priceSek: 95,  vatRate: 25 },
        { name: 'Bubbly (glass)',      priceSek: 120, vatRate: 25 },
        { name: 'House red (bottle)',  priceSek: 395, vatRate: 25 },
        { name: 'House white (bottle)',priceSek: 395, vatRate: 25 },
      ],
    },
    {
      label: 'Spirits & cocktails',
      items: [
        { name: 'Gin & tonic',       priceSek: 135, vatRate: 25 },
        { name: 'Negroni',           priceSek: 145, vatRate: 25 },
        { name: 'Old fashioned',     priceSek: 155, vatRate: 25 },
        { name: 'Margarita',         priceSek: 145, vatRate: 25 },
        { name: 'Whisky 4 cl',       priceSek: 95,  vatRate: 25 },
        { name: 'Tequila 4 cl',      priceSek: 85,  vatRate: 25 },
      ],
    },
    {
      label: 'Bar food',
      items: [
        { name: 'Nachos',            priceSek: 145, vatRate: 12 },
        { name: 'Fries',             priceSek: 65,  vatRate: 12 },
        { name: 'Burger',            priceSek: 195, vatRate: 12 },
        { name: 'Chicken wings',     priceSek: 145, vatRate: 12 },
        { name: 'Olives',            priceSek: 55,  vatRate: 12 },
      ],
    },
  ],
};

const TEMPLATE_WINE_BAR: IndustryTemplate = {
  id: 'wine-bar',
  label: 'Wine bar',
  emoji: '🍷',
  tagline: 'By-the-glass selection, charcuterie, small plates.',
  defaultVatRate: 25,
  group: 'food-drink',
  segments: [
    {
      label: 'Wine by the glass',
      items: [
        { name: 'Red — light',       priceSek: 95,  vatRate: 25 },
        { name: 'Red — medium',      priceSek: 115, vatRate: 25 },
        { name: 'Red — full',        priceSek: 145, vatRate: 25 },
        { name: 'White — crisp',     priceSek: 95,  vatRate: 25 },
        { name: 'White — oaked',     priceSek: 125, vatRate: 25 },
        { name: 'Orange wine',       priceSek: 135, vatRate: 25 },
        { name: 'Rosé',              priceSek: 95,  vatRate: 25 },
        { name: 'Champagne (glass)', priceSek: 165, vatRate: 25 },
      ],
    },
    {
      label: 'Wine by the bottle',
      items: [
        { name: 'House red',         priceSek: 495,  vatRate: 25 },
        { name: 'House white',       priceSek: 495,  vatRate: 25 },
        { name: 'Sparkling',         priceSek: 645,  vatRate: 25 },
        { name: 'Premium red',       priceSek: 895,  vatRate: 25 },
        { name: 'Premium white',     priceSek: 895,  vatRate: 25 },
      ],
    },
    {
      label: 'Plates',
      items: [
        { name: 'Charcuterie board', priceSek: 245, vatRate: 12 },
        { name: 'Cheese board',      priceSek: 225, vatRate: 12 },
        { name: 'Marinated olives',  priceSek: 65,  vatRate: 12 },
        { name: 'Bread & butter',    priceSek: 45,  vatRate: 12 },
        { name: 'Burrata',           priceSek: 145, vatRate: 12 },
        { name: 'Beef tartare',      priceSek: 195, vatRate: 12 },
      ],
    },
  ],
};

const TEMPLATE_BAKERY: IndustryTemplate = {
  id: 'bakery',
  label: 'Bakery',
  emoji: '🥖',
  tagline: 'Bread, pastries, sandwiches to take away.',
  defaultVatRate: 12,
  group: 'food-drink',
  segments: [
    {
      label: 'Bread',
      items: [
        { name: 'Sourdough loaf',     priceSek: 65, vatRate: 12 },
        { name: 'Rye bread',          priceSek: 55, vatRate: 12 },
        { name: 'Baguette',           priceSek: 35, vatRate: 12 },
        { name: 'Whole-grain loaf',   priceSek: 55, vatRate: 12 },
        { name: 'Tunnbröd',           priceSek: 45, vatRate: 12 },
      ],
    },
    {
      label: 'Pastries',
      items: [
        { name: 'Cinnamon bun',       priceSek: 35, vatRate: 12 },
        { name: 'Cardamom bun',       priceSek: 35, vatRate: 12 },
        { name: 'Croissant',          priceSek: 30, vatRate: 12 },
        { name: 'Pain au chocolat',   priceSek: 35, vatRate: 12 },
        { name: 'Princess cake slice',priceSek: 55, vatRate: 12 },
        { name: 'Semla',              priceSek: 42, vatRate: 12 },
        { name: 'Wienerbröd',         priceSek: 32, vatRate: 12 },
      ],
    },
    {
      label: 'To take away',
      items: [
        { name: 'Sandwich',           priceSek: 75, vatRate: 12 },
        { name: 'Mini quiche',        priceSek: 55, vatRate: 12 },
        { name: 'Coffee to go',       priceSek: 32, vatRate: 12 },
        { name: 'Tea to go',          priceSek: 30, vatRate: 12 },
        { name: 'Cake (whole)',       priceSek: 295,vatRate: 12 },
      ],
    },
  ],
};

const TEMPLATE_PATISSERIE: IndustryTemplate = {
  id: 'patisserie',
  label: 'Patisserie',
  emoji: '🍰',
  tagline: 'Cakes, gateaux, fine pastries, custom orders.',
  defaultVatRate: 12,
  group: 'food-drink',
  segments: [
    {
      label: 'Pastries',
      items: [
        { name: 'Éclair',             priceSek: 55, vatRate: 12 },
        { name: 'Macaron',            priceSek: 28, vatRate: 12 },
        { name: 'Mille-feuille',      priceSek: 65, vatRate: 12 },
        { name: 'Tartlet (fruit)',    priceSek: 65, vatRate: 12 },
        { name: 'Opera slice',        priceSek: 75, vatRate: 12 },
        { name: 'Choux à la crème',   priceSek: 45, vatRate: 12 },
      ],
    },
    {
      label: 'Whole cakes',
      items: [
        { name: 'Birthday cake (6 ppl)',  priceSek: 395, vatRate: 12 },
        { name: 'Birthday cake (10 ppl)', priceSek: 595, vatRate: 12 },
        { name: 'Chocolate gateau',       priceSek: 445, vatRate: 12 },
        { name: 'Fruit tart (large)',     priceSek: 395, vatRate: 12 },
        { name: 'Wedding cake (tier)',    priceSek: 1495,vatRate: 12 },
      ],
    },
    {
      label: 'Chocolates',
      items: [
        { name: 'Truffle box (6)',    priceSek: 145, vatRate: 12 },
        { name: 'Truffle box (12)',   priceSek: 265, vatRate: 12 },
        { name: 'Praline (each)',     priceSek: 18,  vatRate: 12 },
        { name: 'Bonbon assortment',  priceSek: 195, vatRate: 12 },
      ],
    },
  ],
};

const TEMPLATE_ICE_CREAM: IndustryTemplate = {
  id: 'ice-cream',
  label: 'Ice cream shop',
  emoji: '🍦',
  tagline: 'Scoops, sundaes, cones, milkshakes.',
  defaultVatRate: 12,
  group: 'food-drink',
  segments: [
    {
      label: 'Scoops',
      items: [
        { name: '1 scoop',            priceSek: 35, vatRate: 12 },
        { name: '2 scoops',           priceSek: 55, vatRate: 12 },
        { name: '3 scoops',           priceSek: 75, vatRate: 12 },
        { name: 'Cone supplement',    priceSek: 10, vatRate: 12 },
        { name: 'Waffle cone',        priceSek: 15, vatRate: 12 },
      ],
    },
    {
      label: 'Sundaes',
      items: [
        { name: 'Sundae — classic',   priceSek: 75, vatRate: 12 },
        { name: 'Sundae — chocolate', priceSek: 85, vatRate: 12 },
        { name: 'Sundae — banana split', priceSek: 95, vatRate: 12 },
        { name: 'Sundae — kid size',  priceSek: 55, vatRate: 12 },
      ],
    },
    {
      label: 'Drinks',
      items: [
        { name: 'Milkshake',          priceSek: 65, vatRate: 12 },
        { name: 'Iced coffee',        priceSek: 45, vatRate: 12 },
        { name: 'Smoothie',           priceSek: 65, vatRate: 12 },
        { name: 'Bottled water',      priceSek: 25, vatRate: 12 },
      ],
    },
  ],
};

const TEMPLATE_RESTAURANT_CASUAL: IndustryTemplate = {
  id: 'restaurant-casual',
  label: 'Restaurant — casual',
  emoji: '🍽️',
  tagline: 'Bistro / family-style sit-down.',
  defaultVatRate: 12,
  group: 'food-drink',
  segments: [
    {
      label: 'Starters',
      items: [
        { name: 'Soup of the day',    priceSek: 95,  vatRate: 12 },
        { name: 'Mixed salad',        priceSek: 95,  vatRate: 12 },
        { name: 'Bruschetta',         priceSek: 95,  vatRate: 12 },
        { name: 'Goat cheese salad',  priceSek: 145, vatRate: 12 },
      ],
    },
    {
      label: 'Mains',
      items: [
        { name: 'Burger',             priceSek: 195, vatRate: 12 },
        { name: 'Steak (entrecôte)',  priceSek: 345, vatRate: 12 },
        { name: 'Pasta (catch of day)', priceSek: 225, vatRate: 12 },
        { name: 'Salmon',             priceSek: 295, vatRate: 12 },
        { name: 'Chicken breast',     priceSek: 235, vatRate: 12 },
        { name: 'Vegetarian special', priceSek: 195, vatRate: 12 },
      ],
    },
    {
      label: 'Sides',
      items: [
        { name: 'Fries',              priceSek: 55, vatRate: 12 },
        { name: 'Mashed potatoes',    priceSek: 55, vatRate: 12 },
        { name: 'Side salad',         priceSek: 65, vatRate: 12 },
        { name: 'Seasonal vegetables',priceSek: 65, vatRate: 12 },
      ],
    },
    {
      label: 'Desserts',
      items: [
        { name: 'Crème brûlée',       priceSek: 95, vatRate: 12 },
        { name: 'Chocolate fondant',  priceSek: 95, vatRate: 12 },
        { name: 'Ice cream (3 scoops)', priceSek: 75, vatRate: 12 },
        { name: 'Cheese plate',       priceSek: 125, vatRate: 12 },
      ],
    },
    {
      label: 'Drinks',
      items: [
        { name: 'Soft drink',         priceSek: 39, vatRate: 12 },
        { name: 'Beer (50 cl)',       priceSek: 79, vatRate: 25 },
        { name: 'Wine (glass)',       priceSek: 95, vatRate: 25 },
        { name: 'Coffee',             priceSek: 32, vatRate: 12 },
      ],
    },
  ],
};

const TEMPLATE_RESTAURANT_FINE: IndustryTemplate = {
  id: 'restaurant-fine',
  label: 'Restaurant — fine dining',
  emoji: '🍾',
  tagline: 'Tasting menus, sommelier pairings, à la carte.',
  defaultVatRate: 12,
  group: 'food-drink',
  segments: [
    {
      label: 'Tasting menus',
      items: [
        { name: 'Tasting menu — 5 courses',  priceSek: 1495, vatRate: 12 },
        { name: 'Tasting menu — 7 courses',  priceSek: 1995, vatRate: 12 },
        { name: 'Vegetarian tasting',        priceSek: 1495, vatRate: 12 },
        { name: 'Wine pairing — 5 courses',  priceSek: 995,  vatRate: 25 },
        { name: 'Wine pairing — 7 courses',  priceSek: 1395, vatRate: 25 },
      ],
    },
    {
      label: 'À la carte — starters',
      items: [
        { name: 'Amuse-bouche selection',    priceSek: 195, vatRate: 12 },
        { name: 'Tuna tataki',               priceSek: 245, vatRate: 12 },
        { name: 'Foie gras',                 priceSek: 295, vatRate: 12 },
        { name: 'Truffle risotto (starter)', priceSek: 245, vatRate: 12 },
      ],
    },
    {
      label: 'À la carte — mains',
      items: [
        { name: 'Wagyu beef',                priceSek: 695, vatRate: 12 },
        { name: 'Turbot',                    priceSek: 545, vatRate: 12 },
        { name: 'Duck breast',               priceSek: 445, vatRate: 12 },
        { name: 'Lamb rack',                 priceSek: 495, vatRate: 12 },
      ],
    },
    {
      label: 'Desserts',
      items: [
        { name: 'Soufflé',                   priceSek: 145, vatRate: 12 },
        { name: 'Cheese trolley',            priceSek: 195, vatRate: 12 },
        { name: 'Petit fours',               priceSek: 95,  vatRate: 12 },
      ],
    },
  ],
};

const TEMPLATE_PIZZERIA: IndustryTemplate = {
  id: 'pizzeria',
  label: 'Pizzeria',
  emoji: '🍕',
  tagline: 'Pizza, antipasti, salads, takeaway-friendly.',
  defaultVatRate: 12,
  group: 'food-drink',
  segments: [
    {
      label: 'Pizza — classic',
      items: [
        { name: 'Margherita',         priceSek: 119, vatRate: 12 },
        { name: 'Capricciosa',        priceSek: 139, vatRate: 12 },
        { name: 'Vesuvio',            priceSek: 129, vatRate: 12 },
        { name: 'Hawaii',             priceSek: 135, vatRate: 12 },
        { name: 'Quattro stagioni',   priceSek: 149, vatRate: 12 },
        { name: 'Marinara',           priceSek: 109, vatRate: 12 },
      ],
    },
    {
      label: 'Pizza — specials',
      items: [
        { name: 'Parma & rucola',     priceSek: 165, vatRate: 12 },
        { name: 'Truffle',            priceSek: 195, vatRate: 12 },
        { name: 'Veggie',             priceSek: 139, vatRate: 12 },
        { name: 'Calzone',            priceSek: 155, vatRate: 12 },
      ],
    },
    {
      label: 'Other',
      items: [
        { name: 'House salad',        priceSek: 95,  vatRate: 12 },
        { name: 'Garlic bread',       priceSek: 49,  vatRate: 12 },
        { name: 'Tiramisu',           priceSek: 75,  vatRate: 12 },
        { name: 'Soft drink',         priceSek: 35,  vatRate: 12 },
        { name: 'Beer (33 cl)',       priceSek: 65,  vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_FOOD_TRUCK: IndustryTemplate = {
  id: 'food-truck',
  label: 'Food truck',
  emoji: '🚚',
  tagline: 'Street food, single handout window.',
  defaultVatRate: 12,
  group: 'food-drink',
  segments: [
    {
      label: 'Mains',
      items: [
        { name: 'Burger',             priceSek: 145, vatRate: 12 },
        { name: 'Cheeseburger',       priceSek: 165, vatRate: 12 },
        { name: 'Veggie burger',      priceSek: 145, vatRate: 12 },
        { name: 'Pulled pork bun',    priceSek: 135, vatRate: 12 },
        { name: 'Hot dog (classic)',  priceSek: 65,  vatRate: 12 },
        { name: 'Hot dog (special)',  priceSek: 95,  vatRate: 12 },
        { name: 'Wrap',               priceSek: 125, vatRate: 12 },
        { name: 'Loaded fries',       priceSek: 95,  vatRate: 12 },
      ],
    },
    {
      label: 'Sides',
      items: [
        { name: 'Fries (small)',      priceSek: 45, vatRate: 12 },
        { name: 'Fries (large)',      priceSek: 65, vatRate: 12 },
        { name: 'Onion rings',        priceSek: 55, vatRate: 12 },
      ],
    },
    {
      label: 'Drinks',
      items: [
        { name: 'Soft drink',         priceSek: 35, vatRate: 12 },
        { name: 'Water',              priceSek: 25, vatRate: 12 },
        { name: 'Iced tea',           priceSek: 35, vatRate: 12 },
        { name: 'Coffee',             priceSek: 32, vatRate: 12 },
      ],
    },
  ],
};

const TEMPLATE_CATERING: IndustryTemplate = {
  id: 'catering',
  label: 'Catering',
  emoji: '🥘',
  tagline: 'Per-person packages, drop-off & full service.',
  defaultVatRate: 12,
  group: 'food-drink',
  segments: [
    {
      label: 'Buffet packages (per person)',
      items: [
        { name: 'Lunch buffet — basic',     priceSek: 195, vatRate: 12 },
        { name: 'Lunch buffet — premium',   priceSek: 295, vatRate: 12 },
        { name: 'Dinner buffet — basic',    priceSek: 295, vatRate: 12 },
        { name: 'Dinner buffet — premium',  priceSek: 495, vatRate: 12 },
        { name: 'Vegetarian package',       priceSek: 245, vatRate: 12 },
      ],
    },
    {
      label: 'Drop-off catering',
      items: [
        { name: 'Sandwich platter (10 ppl)',priceSek: 595, vatRate: 12 },
        { name: 'Salad platter (10 ppl)',   priceSek: 495, vatRate: 12 },
        { name: 'Mezze platter',            priceSek: 695, vatRate: 12 },
        { name: 'Cheese board (large)',     priceSek: 595, vatRate: 12 },
        { name: 'Fika package (10 ppl)',    priceSek: 395, vatRate: 12 },
      ],
    },
    {
      label: 'Service add-ons',
      items: [
        { name: 'Server (per hour)',        priceSek: 395, vatRate: 25 },
        { name: 'Chef on-site (per hour)',  priceSek: 595, vatRate: 25 },
        { name: 'Bartender (per hour)',     priceSek: 495, vatRate: 25 },
        { name: 'Setup & breakdown',        priceSek: 1495,vatRate: 25 },
        { name: 'Equipment rental',         priceSek: 995, vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_JUICE_BAR: IndustryTemplate = {
  id: 'juice-bar',
  label: 'Juice / smoothie bar',
  emoji: '🥤',
  tagline: 'Pressed juice, smoothies, açai bowls.',
  defaultVatRate: 12,
  group: 'food-drink',
  segments: [
    {
      label: 'Smoothies',
      items: [
        { name: 'Green smoothie',     priceSek: 75, vatRate: 12 },
        { name: 'Berry smoothie',     priceSek: 75, vatRate: 12 },
        { name: 'Tropical smoothie',  priceSek: 75, vatRate: 12 },
        { name: 'Protein smoothie',   priceSek: 95, vatRate: 12 },
        { name: 'Custom smoothie',    priceSek: 89, vatRate: 12 },
      ],
    },
    {
      label: 'Cold-pressed juice',
      items: [
        { name: 'Carrot–ginger',      priceSek: 65, vatRate: 12 },
        { name: 'Beet–apple',         priceSek: 65, vatRate: 12 },
        { name: 'Citrus blend',       priceSek: 65, vatRate: 12 },
        { name: 'Green juice',        priceSek: 75, vatRate: 12 },
        { name: 'Wellness shot',      priceSek: 35, vatRate: 12 },
      ],
    },
    {
      label: 'Bowls & food',
      items: [
        { name: 'Açai bowl',          priceSek: 95,  vatRate: 12 },
        { name: 'Smoothie bowl',      priceSek: 95,  vatRate: 12 },
        { name: 'Granola cup',        priceSek: 55,  vatRate: 12 },
        { name: 'Energy ball',        priceSek: 28,  vatRate: 12 },
      ],
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────
// BEAUTY & WELLNESS (8)
// ───────────────────────────────────────────────────────────────────────

const TEMPLATE_HAIRDRESSER: IndustryTemplate = {
  id: 'hairdresser',
  label: 'Hairdresser / Salon',
  emoji: '💇',
  tagline: 'Cuts, colour, styling, treatments.',
  defaultVatRate: 25,
  group: 'beauty-wellness',
  segments: [
    {
      label: 'Cuts',
      items: [
        { name: 'Cut — women',        priceSek: 695, vatRate: 25 },
        { name: 'Cut — men',          priceSek: 495, vatRate: 25 },
        { name: 'Cut — kids (<12)',   priceSek: 295, vatRate: 25 },
        { name: 'Cut & blow-dry',     priceSek: 895, vatRate: 25 },
        { name: 'Trim only',          priceSek: 395, vatRate: 25 },
      ],
    },
    {
      label: 'Colour',
      items: [
        { name: 'Roots only',         priceSek: 895,  vatRate: 25 },
        { name: 'Full colour',        priceSek: 1495, vatRate: 25 },
        { name: 'Highlights — partial',priceSek: 1295,vatRate: 25 },
        { name: 'Highlights — full',  priceSek: 1995, vatRate: 25 },
        { name: 'Balayage',           priceSek: 2495, vatRate: 25 },
        { name: 'Toner / gloss',      priceSek: 495,  vatRate: 25 },
      ],
    },
    {
      label: 'Styling & treatments',
      items: [
        { name: 'Blow-dry',           priceSek: 495,  vatRate: 25 },
        { name: 'Updo',               priceSek: 895,  vatRate: 25 },
        { name: 'Deep conditioning',  priceSek: 295,  vatRate: 25 },
        { name: 'Keratin treatment',  priceSek: 2495, vatRate: 25 },
        { name: 'Scalp treatment',    priceSek: 395,  vatRate: 25 },
      ],
    },
    {
      label: 'Products',
      items: [
        { name: 'Shampoo (250 ml)',   priceSek: 245, vatRate: 25 },
        { name: 'Conditioner (250 ml)',priceSek: 245,vatRate: 25 },
        { name: 'Hair oil',           priceSek: 295, vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_BARBERSHOP: IndustryTemplate = {
  id: 'barbershop',
  label: 'Barbershop',
  emoji: '💈',
  tagline: 'Men\'s cuts, beard trim, shaves.',
  defaultVatRate: 25,
  group: 'beauty-wellness',
  segments: [
    {
      label: 'Cuts',
      items: [
        { name: 'Haircut',            priceSek: 395, vatRate: 25 },
        { name: 'Haircut & wash',     priceSek: 445, vatRate: 25 },
        { name: 'Haircut — kids',     priceSek: 275, vatRate: 25 },
        { name: 'Haircut — senior',   priceSek: 295, vatRate: 25 },
        { name: 'Skin fade',          priceSek: 445, vatRate: 25 },
      ],
    },
    {
      label: 'Beard',
      items: [
        { name: 'Beard trim',         priceSek: 195, vatRate: 25 },
        { name: 'Beard shape',        priceSek: 245, vatRate: 25 },
        { name: 'Hot-towel shave',    priceSek: 395, vatRate: 25 },
        { name: 'Royal shave',        priceSek: 495, vatRate: 25 },
      ],
    },
    {
      label: 'Combos & products',
      items: [
        { name: 'Cut + beard combo',  priceSek: 545, vatRate: 25 },
        { name: 'Beard oil',          priceSek: 245, vatRate: 25 },
        { name: 'Pomade',             priceSek: 195, vatRate: 25 },
        { name: 'Aftershave',         priceSek: 295, vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_NAIL_SALON: IndustryTemplate = {
  id: 'nail-salon',
  label: 'Nail salon',
  emoji: '💅',
  tagline: 'Manicure, pedicure, gel, nail art.',
  defaultVatRate: 25,
  group: 'beauty-wellness',
  segments: [
    {
      label: 'Manicure',
      items: [
        { name: 'Classic manicure',   priceSek: 395, vatRate: 25 },
        { name: 'Gel manicure',       priceSek: 495, vatRate: 25 },
        { name: 'Gel removal',        priceSek: 195, vatRate: 25 },
        { name: 'French manicure',    priceSek: 545, vatRate: 25 },
        { name: 'Nail repair',        priceSek: 95,  vatRate: 25 },
      ],
    },
    {
      label: 'Pedicure',
      items: [
        { name: 'Classic pedicure',   priceSek: 495, vatRate: 25 },
        { name: 'Spa pedicure',       priceSek: 645, vatRate: 25 },
        { name: 'Gel pedicure',       priceSek: 595, vatRate: 25 },
      ],
    },
    {
      label: 'Add-ons',
      items: [
        { name: 'Nail art (per nail)',priceSek: 35,  vatRate: 25 },
        { name: 'Paraffin treatment', priceSek: 195, vatRate: 25 },
        { name: 'Hand massage',       priceSek: 145, vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_BEAUTY_SPA: IndustryTemplate = {
  id: 'beauty-spa',
  label: 'Beauty spa / Facials',
  emoji: '🧖',
  tagline: 'Facials, peels, waxing, lash & brow.',
  defaultVatRate: 25,
  group: 'beauty-wellness',
  segments: [
    {
      label: 'Facials',
      items: [
        { name: 'Classic facial',     priceSek: 895,  vatRate: 25 },
        { name: 'Deep-cleanse facial',priceSek: 1095, vatRate: 25 },
        { name: 'Anti-age facial',    priceSek: 1495, vatRate: 25 },
        { name: 'Chemical peel',      priceSek: 1295, vatRate: 25 },
        { name: 'Express facial (30m)', priceSek: 595,vatRate: 25 },
      ],
    },
    {
      label: 'Waxing',
      items: [
        { name: 'Eyebrow shape',      priceSek: 145, vatRate: 25 },
        { name: 'Upper lip',          priceSek: 95,  vatRate: 25 },
        { name: 'Full leg',           priceSek: 595, vatRate: 25 },
        { name: 'Half leg',           priceSek: 395, vatRate: 25 },
        { name: 'Brazilian',          priceSek: 545, vatRate: 25 },
        { name: 'Bikini',             priceSek: 395, vatRate: 25 },
      ],
    },
    {
      label: 'Lash & brow',
      items: [
        { name: 'Lash lift',          priceSek: 595, vatRate: 25 },
        { name: 'Lash tint',          priceSek: 295, vatRate: 25 },
        { name: 'Brow tint',          priceSek: 195, vatRate: 25 },
        { name: 'Lash extensions (full)',priceSek:1295,vatRate:25 },
        { name: 'Lash refill',        priceSek: 545, vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_MASSAGE: IndustryTemplate = {
  id: 'massage',
  label: 'Massage therapist',
  emoji: '💆',
  tagline: 'Swedish, deep tissue, sports, prenatal.',
  defaultVatRate: 25,
  group: 'beauty-wellness',
  segments: [
    {
      label: 'Standard massages',
      items: [
        { name: 'Swedish — 30 min',   priceSek: 495,  vatRate: 25 },
        { name: 'Swedish — 60 min',   priceSek: 895,  vatRate: 25 },
        { name: 'Swedish — 90 min',   priceSek: 1295, vatRate: 25 },
        { name: 'Deep tissue — 60 min',priceSek: 995, vatRate: 25 },
        { name: 'Deep tissue — 90 min',priceSek: 1395,vatRate: 25 },
      ],
    },
    {
      label: 'Specialty',
      items: [
        { name: 'Sports massage',     priceSek: 1095, vatRate: 25 },
        { name: 'Prenatal',           priceSek: 995,  vatRate: 25 },
        { name: 'Hot stone',          priceSek: 1195, vatRate: 25 },
        { name: 'Aromatherapy',       priceSek: 995,  vatRate: 25 },
        { name: 'Chair massage (15m)',priceSek: 295,  vatRate: 25 },
      ],
    },
    {
      label: 'Packages',
      items: [
        { name: '5-pack (60 min)',    priceSek: 3995, vatRate: 25 },
        { name: '10-pack (60 min)',   priceSek: 7495, vatRate: 25 },
        { name: 'Gift card — 60 min', priceSek: 895,  vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_TATTOO: IndustryTemplate = {
  id: 'tattoo',
  label: 'Tattoo studio',
  emoji: '🎨',
  tagline: 'Small to large pieces, consultation.',
  defaultVatRate: 25,
  group: 'beauty-wellness',
  segments: [
    {
      label: 'Tattoos',
      items: [
        { name: 'Small piece (<5 cm)',  priceSek: 1495, vatRate: 25 },
        { name: 'Medium piece',         priceSek: 2995, vatRate: 25 },
        { name: 'Large piece',          priceSek: 5995, vatRate: 25 },
        { name: 'Sleeve (per session)', priceSek: 3995, vatRate: 25 },
        { name: 'Touch-up',             priceSek: 495,  vatRate: 25 },
        { name: 'Cover-up',             priceSek: 2495, vatRate: 25 },
      ],
    },
    {
      label: 'Other services',
      items: [
        { name: 'Consultation',         priceSek: 295, vatRate: 25 },
        { name: 'Custom design fee',    priceSek: 695, vatRate: 25 },
        { name: 'Piercing — ear',       priceSek: 395, vatRate: 25 },
        { name: 'Piercing — body',      priceSek: 595, vatRate: 25 },
      ],
    },
    {
      label: 'Aftercare',
      items: [
        { name: 'Aftercare cream',      priceSek: 195, vatRate: 25 },
        { name: 'Healing balm',         priceSek: 245, vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_YOGA_STUDIO: IndustryTemplate = {
  id: 'yoga-studio',
  label: 'Yoga / Pilates studio',
  emoji: '🧘',
  tagline: 'Drop-in classes, class packs, memberships, private sessions.',
  defaultVatRate: 6,
  group: 'beauty-wellness',
  segments: [
    {
      label: 'Drop-in & packs',
      items: [
        { name: 'Drop-in class',      priceSek: 195,  vatRate: 6 },
        { name: 'Trial week',         priceSek: 295,  vatRate: 6 },
        { name: '10-class pack',      priceSek: 1495, vatRate: 6 },
        { name: '20-class pack',      priceSek: 2795, vatRate: 6 },
      ],
    },
    {
      label: 'Memberships',
      items: [
        { name: 'Monthly unlimited',  priceSek: 995,  vatRate: 6 },
        { name: 'Annual unlimited',   priceSek: 9495, vatRate: 6 },
        { name: 'Student monthly',    priceSek: 695,  vatRate: 6 },
      ],
    },
    {
      label: 'Private',
      items: [
        { name: 'Private session — 60 min',  priceSek: 1295, vatRate: 6 },
        { name: 'Private session — 90 min',  priceSek: 1695, vatRate: 6 },
        { name: 'Small-group private (3 ppl)', priceSek: 1995, vatRate: 6 },
      ],
    },
    {
      label: 'Retail',
      items: [
        { name: 'Yoga mat',           priceSek: 595, vatRate: 25 },
        { name: 'Yoga block',         priceSek: 145, vatRate: 25 },
        { name: 'Yoga strap',         priceSek: 95,  vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_GYM: IndustryTemplate = {
  id: 'gym',
  label: 'Personal trainer / Gym',
  emoji: '💪',
  tagline: 'PT sessions, memberships, classes.',
  defaultVatRate: 6,
  group: 'beauty-wellness',
  segments: [
    {
      label: 'Personal training',
      items: [
        { name: 'PT session — single', priceSek: 895,  vatRate: 25 },
        { name: 'PT 5-pack',           priceSek: 4195, vatRate: 25 },
        { name: 'PT 10-pack',          priceSek: 7995, vatRate: 25 },
        { name: 'Online PT — monthly', priceSek: 1495, vatRate: 25 },
      ],
    },
    {
      label: 'Memberships',
      items: [
        { name: 'Day pass',           priceSek: 195,  vatRate: 6 },
        { name: 'Monthly membership', priceSek: 595,  vatRate: 6 },
        { name: 'Annual membership',  priceSek: 5495, vatRate: 6 },
        { name: 'Student monthly',    priceSek: 395,  vatRate: 6 },
      ],
    },
    {
      label: 'Classes & extras',
      items: [
        { name: 'Group class — drop in',priceSek: 145,vatRate: 6 },
        { name: 'Class 10-pack',      priceSek: 1195, vatRate: 6 },
        { name: 'Body composition scan',priceSek: 295,vatRate: 6 },
        { name: 'Locker rental — monthly',priceSek: 95,vatRate: 25 },
      ],
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────
// TRADES (6)
// ───────────────────────────────────────────────────────────────────────

const TEMPLATE_PLUMBER: IndustryTemplate = {
  id: 'plumber',
  label: 'Plumber',
  emoji: '🔧',
  tagline: 'Call-outs, installs, emergency.',
  defaultVatRate: 25,
  group: 'trades',
  segments: [
    {
      label: 'Call-out & labour',
      items: [
        { name: 'Call-out fee',       priceSek: 695,  vatRate: 25 },
        { name: 'Labour — per hour',  priceSek: 795,  vatRate: 25 },
        { name: 'Emergency call-out', priceSek: 1495, vatRate: 25 },
        { name: 'Weekend surcharge',  priceSek: 495,  vatRate: 25 },
      ],
    },
    {
      label: 'Common jobs',
      items: [
        { name: 'Tap replacement',    priceSek: 995,  vatRate: 25 },
        { name: 'Toilet repair',      priceSek: 1495, vatRate: 25 },
        { name: 'Toilet install',     priceSek: 2495, vatRate: 25 },
        { name: 'Drain unblock',      priceSek: 1295, vatRate: 25 },
        { name: 'Boiler service',     priceSek: 1795, vatRate: 25 },
        { name: 'Pipe replacement',   priceSek: 2495, vatRate: 25 },
      ],
    },
    {
      label: 'Materials',
      items: [
        { name: 'Tap (standard)',     priceSek: 695,  vatRate: 25 },
        { name: 'Tap (premium)',      priceSek: 1495, vatRate: 25 },
        { name: 'Pipe length (1 m)',  priceSek: 145,  vatRate: 25 },
        { name: 'Seal kit',           priceSek: 95,   vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_ELECTRICIAN: IndustryTemplate = {
  id: 'electrician',
  label: 'Electrician',
  emoji: '⚡',
  tagline: 'Wiring, outlets, lighting, electrical safety.',
  defaultVatRate: 25,
  group: 'trades',
  segments: [
    {
      label: 'Call-out & labour',
      items: [
        { name: 'Call-out fee',       priceSek: 695,  vatRate: 25 },
        { name: 'Labour — per hour',  priceSek: 795,  vatRate: 25 },
        { name: 'Emergency call-out', priceSek: 1495, vatRate: 25 },
      ],
    },
    {
      label: 'Common jobs',
      items: [
        { name: 'Outlet install',     priceSek: 595, vatRate: 25 },
        { name: 'Light fixture install',priceSek: 895,vatRate: 25 },
        { name: 'Ceiling fan install',priceSek: 1295,vatRate: 25 },
        { name: 'Fuse box upgrade',   priceSek: 3995,vatRate: 25 },
        { name: 'Smoke alarm install',priceSek: 495, vatRate: 25 },
        { name: 'EV charger install', priceSek: 7995,vatRate: 25 },
        { name: 'Electrical inspection',priceSek: 1495,vatRate: 25 },
      ],
    },
    {
      label: 'Materials',
      items: [
        { name: 'Outlet (standard)',  priceSek: 95,  vatRate: 25 },
        { name: 'Switch (standard)',  priceSek: 95,  vatRate: 25 },
        { name: 'Cable (per metre)',  priceSek: 35,  vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_HANDYMAN: IndustryTemplate = {
  id: 'handyman',
  label: 'Carpenter / Handyman',
  emoji: '🔨',
  tagline: 'Furniture assembly, small repairs, installs.',
  defaultVatRate: 25,
  group: 'trades',
  segments: [
    {
      label: 'Labour',
      items: [
        { name: 'Hourly rate',        priceSek: 595, vatRate: 25 },
        { name: 'Call-out fee',       priceSek: 395, vatRate: 25 },
        { name: 'Half day',           priceSek: 2495,vatRate: 25 },
        { name: 'Full day',           priceSek: 4495,vatRate: 25 },
      ],
    },
    {
      label: 'Common jobs',
      items: [
        { name: 'Furniture assembly', priceSek: 695, vatRate: 25 },
        { name: 'Shelf install',      priceSek: 495, vatRate: 25 },
        { name: 'Door rehang',        priceSek: 895, vatRate: 25 },
        { name: 'TV wall mount',      priceSek: 795, vatRate: 25 },
        { name: 'Kitchen unit install',priceSek: 2495,vatRate: 25 },
        { name: 'Window seal repair', priceSek: 695, vatRate: 25 },
        { name: 'Floor sanding (sq m)',priceSek: 295,vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_PAINTER: IndustryTemplate = {
  id: 'painter',
  label: 'Painter / Decorator',
  emoji: '🎨',
  tagline: 'Interior, exterior, wallpaper.',
  defaultVatRate: 25,
  group: 'trades',
  segments: [
    {
      label: 'Labour',
      items: [
        { name: 'Hourly rate',        priceSek: 595, vatRate: 25 },
        { name: 'Per sq m — interior',priceSek: 195, vatRate: 25 },
        { name: 'Per sq m — exterior',priceSek: 295, vatRate: 25 },
        { name: 'Wallpaper hang (sq m)',priceSek:245,vatRate: 25 },
      ],
    },
    {
      label: 'Jobs',
      items: [
        { name: 'Single room',        priceSek: 4495, vatRate: 25 },
        { name: 'Two-bedroom apartment',priceSek: 12495,vatRate: 25 },
        { name: 'Ceiling only',       priceSek: 1995, vatRate: 25 },
        { name: 'Front door',         priceSek: 1495, vatRate: 25 },
        { name: 'Touch-ups (per hour)',priceSek: 495, vatRate: 25 },
      ],
    },
    {
      label: 'Materials',
      items: [
        { name: 'Paint (premium, L)', priceSek: 395, vatRate: 25 },
        { name: 'Paint (standard, L)',priceSek: 245, vatRate: 25 },
        { name: 'Primer (L)',         priceSek: 195, vatRate: 25 },
        { name: 'Wallpaper (roll)',   priceSek: 695, vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_LOCKSMITH: IndustryTemplate = {
  id: 'locksmith',
  label: 'Locksmith',
  emoji: '🔐',
  tagline: 'Lockouts, lock changes, security upgrades.',
  defaultVatRate: 25,
  group: 'trades',
  segments: [
    {
      label: 'Emergency',
      items: [
        { name: 'Lockout — daytime',  priceSek: 1495, vatRate: 25 },
        { name: 'Lockout — night',    priceSek: 2495, vatRate: 25 },
        { name: 'Lockout — weekend',  priceSek: 1995, vatRate: 25 },
      ],
    },
    {
      label: 'Standard jobs',
      items: [
        { name: 'Lock change',        priceSek: 1295, vatRate: 25 },
        { name: 'Cylinder replacement',priceSek: 895, vatRate: 25 },
        { name: 'Door lock install',  priceSek: 1495, vatRate: 25 },
        { name: 'Key duplication',    priceSek: 195,  vatRate: 25 },
        { name: 'Smart-lock install', priceSek: 2495, vatRate: 25 },
        { name: 'Safe opening',       priceSek: 1995, vatRate: 25 },
      ],
    },
    {
      label: 'Hardware',
      items: [
        { name: 'Standard lock cylinder',priceSek: 495,vatRate: 25 },
        { name: 'High-security cylinder',priceSek: 1295,vatRate: 25 },
        { name: 'Smart lock (entry)', priceSek: 2495, vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_CLEANING: IndustryTemplate = {
  id: 'cleaning',
  label: 'Cleaning service',
  emoji: '🧹',
  tagline: 'Home, office, move-in/out, deep clean.',
  defaultVatRate: 25,
  group: 'trades',
  segments: [
    {
      label: 'Hourly',
      items: [
        { name: 'Hourly — standard',  priceSek: 395, vatRate: 25 },
        { name: 'Hourly — deep clean',priceSek: 495, vatRate: 25 },
        { name: 'Hourly — RUT after deduction', priceSek: 198, vatRate: 25 },
      ],
    },
    {
      label: 'Fixed packages',
      items: [
        { name: 'Apt cleaning (1 BR)',priceSek: 895, vatRate: 25 },
        { name: 'Apt cleaning (2 BR)',priceSek: 1195,vatRate: 25 },
        { name: 'Apt cleaning (3 BR)',priceSek: 1495,vatRate: 25 },
        { name: 'Move-out clean (1 BR)',priceSek: 1995,vatRate: 25 },
        { name: 'Move-out clean (2 BR)',priceSek: 2995,vatRate: 25 },
        { name: 'Window cleaning',    priceSek: 595, vatRate: 25 },
        { name: 'Office cleaning (small)',priceSek: 995,vatRate: 25 },
      ],
    },
    {
      label: 'Add-ons',
      items: [
        { name: 'Oven cleaning',      priceSek: 495, vatRate: 25 },
        { name: 'Fridge cleaning',    priceSek: 395, vatRate: 25 },
        { name: 'Ironing — per hour', priceSek: 295, vatRate: 25 },
      ],
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────
// AUTO & MOBILITY (3)
// ───────────────────────────────────────────────────────────────────────

const TEMPLATE_BIKE_SHOP: IndustryTemplate = {
  id: 'bike-shop',
  label: 'Bike shop / repair',
  emoji: '🚲',
  tagline: 'Service, parts, accessories, rental.',
  defaultVatRate: 25,
  group: 'auto-mobility',
  segments: [
    {
      label: 'Service',
      items: [
        { name: 'Basic service',      priceSek: 595,  vatRate: 25 },
        { name: 'Full service',       priceSek: 1295, vatRate: 25 },
        { name: 'Premium service',    priceSek: 1995, vatRate: 25 },
        { name: 'Puncture repair',    priceSek: 195,  vatRate: 25 },
        { name: 'Brake adjustment',   priceSek: 295,  vatRate: 25 },
        { name: 'Wheel truing',       priceSek: 395,  vatRate: 25 },
      ],
    },
    {
      label: 'Parts',
      items: [
        { name: 'Inner tube',         priceSek: 95,  vatRate: 25 },
        { name: 'Tyre (standard)',    priceSek: 395, vatRate: 25 },
        { name: 'Tyre (premium)',     priceSek: 695, vatRate: 25 },
        { name: 'Chain',              priceSek: 295, vatRate: 25 },
        { name: 'Brake pads (pair)',  priceSek: 195, vatRate: 25 },
        { name: 'Cassette',           priceSek: 695, vatRate: 25 },
      ],
    },
    {
      label: 'Accessories & rental',
      items: [
        { name: 'Helmet',             priceSek: 695, vatRate: 25 },
        { name: 'Lock',               priceSek: 295, vatRate: 25 },
        { name: 'Lights (set)',       priceSek: 395, vatRate: 25 },
        { name: 'Rental — half day',  priceSek: 195, vatRate: 25 },
        { name: 'Rental — full day',  priceSek: 295, vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_AUTO_MECHANIC: IndustryTemplate = {
  id: 'auto-mechanic',
  label: 'Auto mechanic',
  emoji: '🔧',
  tagline: 'Service, MOT, tyres, repairs.',
  defaultVatRate: 25,
  group: 'auto-mobility',
  segments: [
    {
      label: 'Service',
      items: [
        { name: 'Basic service',      priceSek: 1995, vatRate: 25 },
        { name: 'Full service',       priceSek: 3995, vatRate: 25 },
        { name: 'Oil change',         priceSek: 695,  vatRate: 25 },
        { name: 'Brake service',      priceSek: 2495, vatRate: 25 },
        { name: 'Cam belt change',    priceSek: 5995, vatRate: 25 },
      ],
    },
    {
      label: 'Tyres & wheels',
      items: [
        { name: 'Tyre change (per tyre)',priceSek: 295, vatRate: 25 },
        { name: 'Wheel balancing',    priceSek: 195, vatRate: 25 },
        { name: 'Wheel alignment',    priceSek: 995, vatRate: 25 },
        { name: 'Seasonal tyre swap', priceSek: 595, vatRate: 25 },
      ],
    },
    {
      label: 'Inspection & misc',
      items: [
        { name: 'Pre-purchase inspection',priceSek: 1495,vatRate: 25 },
        { name: 'Diagnostic check',   priceSek: 695, vatRate: 25 },
        { name: 'Hourly labour',      priceSek: 895, vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_CAR_WASH: IndustryTemplate = {
  id: 'car-wash',
  label: 'Car wash',
  emoji: '🚗',
  tagline: 'Wash packages, detailing, monthly plans.',
  defaultVatRate: 25,
  group: 'auto-mobility',
  segments: [
    {
      label: 'Wash',
      items: [
        { name: 'Express wash',       priceSek: 95,  vatRate: 25 },
        { name: 'Standard wash',      priceSek: 145, vatRate: 25 },
        { name: 'Premium wash',       priceSek: 195, vatRate: 25 },
        { name: 'Hand wash',          priceSek: 295, vatRate: 25 },
      ],
    },
    {
      label: 'Detailing',
      items: [
        { name: 'Interior vacuum',    priceSek: 195, vatRate: 25 },
        { name: 'Full interior detail',priceSek: 995,vatRate: 25 },
        { name: 'Exterior wax',       priceSek: 595, vatRate: 25 },
        { name: 'Full detail',        priceSek: 1995,vatRate: 25 },
      ],
    },
    {
      label: 'Monthly',
      items: [
        { name: 'Monthly unlimited — express',priceSek: 295, vatRate: 25 },
        { name: 'Monthly unlimited — premium',priceSek: 495, vatRate: 25 },
      ],
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────
// RETAIL (7)
// ───────────────────────────────────────────────────────────────────────

const TEMPLATE_FLORIST: IndustryTemplate = {
  id: 'florist',
  label: 'Florist',
  emoji: '💐',
  tagline: 'Bouquets, arrangements, weddings, funerals.',
  defaultVatRate: 25,
  group: 'retail',
  segments: [
    {
      label: 'Bouquets',
      items: [
        { name: 'Small bouquet',      priceSek: 295,  vatRate: 25 },
        { name: 'Medium bouquet',     priceSek: 495,  vatRate: 25 },
        { name: 'Large bouquet',      priceSek: 795,  vatRate: 25 },
        { name: 'Premium bouquet',    priceSek: 1495, vatRate: 25 },
        { name: 'Seasonal special',   priceSek: 595,  vatRate: 25 },
      ],
    },
    {
      label: 'Arrangements',
      items: [
        { name: 'Table arrangement',  priceSek: 695,  vatRate: 25 },
        { name: 'Wedding centrepiece',priceSek: 1295, vatRate: 25 },
        { name: 'Funeral wreath',     priceSek: 1495, vatRate: 25 },
        { name: 'Event decor (per piece)',priceSek: 495,vatRate: 25 },
      ],
    },
    {
      label: 'Plants & extras',
      items: [
        { name: 'Pot plant (small)',  priceSek: 195, vatRate: 25 },
        { name: 'Pot plant (large)',  priceSek: 495, vatRate: 25 },
        { name: 'Vase',               priceSek: 245, vatRate: 25 },
        { name: 'Card',               priceSek: 35,  vatRate: 25 },
        { name: 'Delivery — local',   priceSek: 95,  vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_BOOKSTORE: IndustryTemplate = {
  id: 'bookstore',
  label: 'Bookstore',
  emoji: '📚',
  tagline: 'Books, magazines, stationery.',
  defaultVatRate: 6,
  group: 'retail',
  segments: [
    {
      label: 'Books',
      items: [
        { name: 'Paperback — fiction',priceSek: 195, vatRate: 6 },
        { name: 'Hardback — fiction', priceSek: 295, vatRate: 6 },
        { name: 'Non-fiction',        priceSek: 295, vatRate: 6 },
        { name: 'Children\'s book',   priceSek: 145, vatRate: 6 },
        { name: 'Cookbook',           priceSek: 395, vatRate: 6 },
        { name: 'Art book',           priceSek: 595, vatRate: 6 },
        { name: 'Travel guide',       priceSek: 295, vatRate: 6 },
      ],
    },
    {
      label: 'Periodicals',
      items: [
        { name: 'Magazine',           priceSek: 65,  vatRate: 6 },
        { name: 'Newspaper',          priceSek: 35,  vatRate: 6 },
        { name: 'Comic book',         priceSek: 95,  vatRate: 6 },
      ],
    },
    {
      label: 'Stationery',
      items: [
        { name: 'Notebook',           priceSek: 95,  vatRate: 25 },
        { name: 'Pen (premium)',      priceSek: 195, vatRate: 25 },
        { name: 'Greeting card',      priceSek: 45,  vatRate: 25 },
        { name: 'Bookmark',           priceSek: 35,  vatRate: 25 },
        { name: 'Gift wrap',          priceSek: 25,  vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_CLOTHING: IndustryTemplate = {
  id: 'clothing',
  label: 'Clothing boutique',
  emoji: '👔',
  tagline: 'Apparel, accessories, footwear.',
  defaultVatRate: 25,
  group: 'retail',
  segments: [
    {
      label: 'Tops',
      items: [
        { name: 'T-shirt',            priceSek: 295,  vatRate: 25 },
        { name: 'Shirt',              priceSek: 595,  vatRate: 25 },
        { name: 'Sweater',            priceSek: 895,  vatRate: 25 },
        { name: 'Blouse',             priceSek: 795,  vatRate: 25 },
      ],
    },
    {
      label: 'Bottoms',
      items: [
        { name: 'Jeans',              priceSek: 995,  vatRate: 25 },
        { name: 'Trousers',           priceSek: 895,  vatRate: 25 },
        { name: 'Skirt',              priceSek: 695,  vatRate: 25 },
        { name: 'Shorts',             priceSek: 495,  vatRate: 25 },
      ],
    },
    {
      label: 'Outerwear & footwear',
      items: [
        { name: 'Jacket',             priceSek: 1995, vatRate: 25 },
        { name: 'Coat',               priceSek: 2995, vatRate: 25 },
        { name: 'Dress',              priceSek: 1495, vatRate: 25 },
        { name: 'Sneakers',           priceSek: 1295, vatRate: 25 },
        { name: 'Boots',              priceSek: 1995, vatRate: 25 },
      ],
    },
    {
      label: 'Accessories',
      items: [
        { name: 'Scarf',              priceSek: 395, vatRate: 25 },
        { name: 'Belt',               priceSek: 495, vatRate: 25 },
        { name: 'Hat',                priceSek: 395, vatRate: 25 },
        { name: 'Sunglasses',         priceSek: 795, vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_JEWELRY: IndustryTemplate = {
  id: 'jewelry',
  label: 'Jewelry shop',
  emoji: '💎',
  tagline: 'Earrings, rings, necklaces, repairs.',
  defaultVatRate: 25,
  group: 'retail',
  segments: [
    {
      label: 'Earrings & necklaces',
      items: [
        { name: 'Stud earrings',      priceSek: 495,  vatRate: 25 },
        { name: 'Drop earrings',      priceSek: 895,  vatRate: 25 },
        { name: 'Silver necklace',    priceSek: 1495, vatRate: 25 },
        { name: 'Gold necklace',      priceSek: 4995, vatRate: 25 },
        { name: 'Pendant',            priceSek: 1995, vatRate: 25 },
      ],
    },
    {
      label: 'Rings',
      items: [
        { name: 'Silver ring',        priceSek: 995,  vatRate: 25 },
        { name: 'Gold ring',          priceSek: 4995, vatRate: 25 },
        { name: 'Engagement ring',    priceSek: 19995,vatRate: 25 },
        { name: 'Wedding band',       priceSek: 5995, vatRate: 25 },
      ],
    },
    {
      label: 'Watches',
      items: [
        { name: 'Casual watch',       priceSek: 1995, vatRate: 25 },
        { name: 'Premium watch',      priceSek: 9995, vatRate: 25 },
        { name: 'Watch battery change',priceSek: 295, vatRate: 25 },
        { name: 'Watch strap',        priceSek: 495,  vatRate: 25 },
      ],
    },
    {
      label: 'Services',
      items: [
        { name: 'Ring resize',        priceSek: 495,  vatRate: 25 },
        { name: 'Repair (basic)',     priceSek: 495,  vatRate: 25 },
        { name: 'Cleaning & polish',  priceSek: 295,  vatRate: 25 },
        { name: 'Engraving',          priceSek: 395,  vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_ANTIQUE: IndustryTemplate = {
  id: 'antique',
  label: 'Antique / Vintage shop',
  emoji: '🪑',
  tagline: 'Curated items — each priced individually.',
  defaultVatRate: 25,
  group: 'retail',
  segments: [
    {
      label: 'Price tiers (edit per piece)',
      items: [
        { name: 'Small piece',        priceSek: 295,  vatRate: 25 },
        { name: 'Medium piece',       priceSek: 1495, vatRate: 25 },
        { name: 'Large piece',        priceSek: 4995, vatRate: 25 },
        { name: 'Premium piece',      priceSek: 14995,vatRate: 25 },
      ],
    },
    {
      label: 'Categories',
      items: [
        { name: 'Furniture',          priceSek: 2995, vatRate: 25 },
        { name: 'Lamp / lighting',    priceSek: 995,  vatRate: 25 },
        { name: 'Painting',           priceSek: 3995, vatRate: 25 },
        { name: 'Ceramics',           priceSek: 595,  vatRate: 25 },
        { name: 'Silverware',         priceSek: 1495, vatRate: 25 },
        { name: 'Book — antique',     priceSek: 495,  vatRate: 25 },
        { name: 'Vintage clothing',   priceSek: 695,  vatRate: 25 },
      ],
    },
    {
      label: 'Services',
      items: [
        { name: 'Appraisal',          priceSek: 695, vatRate: 25 },
        { name: 'Delivery (local)',   priceSek: 495, vatRate: 25 },
        { name: 'Restoration consult',priceSek: 495, vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_MUSIC_STORE: IndustryTemplate = {
  id: 'music-store',
  label: 'Music store',
  emoji: '🎸',
  tagline: 'Instruments, accessories, lessons, repairs.',
  defaultVatRate: 25,
  group: 'retail',
  segments: [
    {
      label: 'Instruments',
      items: [
        { name: 'Acoustic guitar',    priceSek: 2995, vatRate: 25 },
        { name: 'Electric guitar',    priceSek: 4995, vatRate: 25 },
        { name: 'Bass guitar',        priceSek: 4995, vatRate: 25 },
        { name: 'Keyboard',           priceSek: 3995, vatRate: 25 },
        { name: 'Ukulele',            priceSek: 995,  vatRate: 25 },
        { name: 'Drumsticks (pair)',  priceSek: 195,  vatRate: 25 },
      ],
    },
    {
      label: 'Accessories',
      items: [
        { name: 'Guitar strings',     priceSek: 195, vatRate: 25 },
        { name: 'Guitar capo',        priceSek: 195, vatRate: 25 },
        { name: 'Strap',              priceSek: 295, vatRate: 25 },
        { name: 'Tuner',              priceSek: 295, vatRate: 25 },
        { name: 'Picks (pack)',       priceSek: 65,  vatRate: 25 },
        { name: 'Cable (3 m)',        priceSek: 195, vatRate: 25 },
      ],
    },
    {
      label: 'Lessons & repair',
      items: [
        { name: 'Lesson — 30 min',    priceSek: 395, vatRate: 25 },
        { name: 'Lesson — 60 min',    priceSek: 695, vatRate: 25 },
        { name: 'Restring',           priceSek: 245, vatRate: 25 },
        { name: 'Setup / intonation', priceSek: 595, vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_PET_SHOP: IndustryTemplate = {
  id: 'pet-shop',
  label: 'Pet shop / Grooming',
  emoji: '🐾',
  tagline: 'Food, accessories, grooming services.',
  defaultVatRate: 25,
  group: 'retail',
  segments: [
    {
      label: 'Food',
      items: [
        { name: 'Dog food (5 kg)',    priceSek: 395, vatRate: 12 },
        { name: 'Dog food (15 kg)',   priceSek: 895, vatRate: 12 },
        { name: 'Cat food (3 kg)',    priceSek: 295, vatRate: 12 },
        { name: 'Cat food (10 kg)',   priceSek: 695, vatRate: 12 },
        { name: 'Treats',             priceSek: 95,  vatRate: 12 },
      ],
    },
    {
      label: 'Accessories',
      items: [
        { name: 'Collar',             priceSek: 195, vatRate: 25 },
        { name: 'Leash',              priceSek: 295, vatRate: 25 },
        { name: 'Toy',                priceSek: 95,  vatRate: 25 },
        { name: 'Bed (small)',        priceSek: 495, vatRate: 25 },
        { name: 'Bed (large)',        priceSek: 995, vatRate: 25 },
        { name: 'Litter (10 L)',      priceSek: 195, vatRate: 25 },
      ],
    },
    {
      label: 'Grooming',
      items: [
        { name: 'Dog wash — small',   priceSek: 395,  vatRate: 25 },
        { name: 'Dog wash — medium',  priceSek: 595,  vatRate: 25 },
        { name: 'Dog wash — large',   priceSek: 795,  vatRate: 25 },
        { name: 'Full groom — small', priceSek: 695,  vatRate: 25 },
        { name: 'Full groom — large', priceSek: 1295, vatRate: 25 },
        { name: 'Nail clip',          priceSek: 195,  vatRate: 25 },
      ],
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────
// PROFESSIONAL SERVICES (4)
// ───────────────────────────────────────────────────────────────────────

const TEMPLATE_LAWYER: IndustryTemplate = {
  id: 'lawyer',
  label: 'Lawyer / Legal',
  emoji: '⚖️',
  tagline: 'Consultations, contracts, court representation.',
  defaultVatRate: 25,
  group: 'professional',
  segments: [
    {
      label: 'Consultations',
      items: [
        { name: 'Initial consultation (30 min)', priceSek: 995,  vatRate: 25 },
        { name: 'Full consultation (60 min)',    priceSek: 1995, vatRate: 25 },
        { name: 'Phone consultation (15 min)',   priceSek: 595,  vatRate: 25 },
        { name: 'Follow-up consultation',        priceSek: 1495, vatRate: 25 },
      ],
    },
    {
      label: 'Hourly',
      items: [
        { name: 'Partner — per hour',  priceSek: 3495, vatRate: 25 },
        { name: 'Associate — per hour',priceSek: 1995, vatRate: 25 },
        { name: 'Paralegal — per hour',priceSek: 995,  vatRate: 25 },
      ],
    },
    {
      label: 'Fixed-fee work',
      items: [
        { name: 'Contract review',     priceSek: 4995, vatRate: 25 },
        { name: 'Will drafting',       priceSek: 5995, vatRate: 25 },
        { name: 'Power of attorney',   priceSek: 1995, vatRate: 25 },
        { name: 'Property conveyance', priceSek: 14995,vatRate: 25 },
        { name: 'Trademark filing',    priceSek: 7995, vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_ACCOUNTANT: IndustryTemplate = {
  id: 'accountant',
  label: 'Accountant / Bookkeeper',
  emoji: '📊',
  tagline: 'Bookkeeping, tax returns, payroll.',
  defaultVatRate: 25,
  group: 'professional',
  segments: [
    {
      label: 'Bookkeeping',
      items: [
        { name: 'Monthly bookkeeping — small biz',priceSek: 2995,vatRate: 25 },
        { name: 'Monthly bookkeeping — medium',  priceSek: 5995,vatRate: 25 },
        { name: 'Annual bookkeeping',            priceSek: 14995,vatRate: 25 },
        { name: 'SIE 4 import / clean-up',       priceSek: 1495,vatRate: 25 },
      ],
    },
    {
      label: 'Tax & VAT',
      items: [
        { name: 'VAT return',          priceSek: 1495,  vatRate: 25 },
        { name: 'Annual tax return — individual',priceSek: 2995,vatRate: 25 },
        { name: 'Annual tax return — company',   priceSek: 9995,vatRate: 25 },
        { name: 'Tax planning consult',priceSek: 1995,  vatRate: 25 },
      ],
    },
    {
      label: 'Other',
      items: [
        { name: 'Payroll — per employee/month',  priceSek: 295,  vatRate: 25 },
        { name: 'Year-end financials',           priceSek: 4995, vatRate: 25 },
        { name: 'Hourly rate',                   priceSek: 1295, vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_IT_CONSULTANT: IndustryTemplate = {
  id: 'it-consultant',
  label: 'IT consultant / Freelancer',
  emoji: '💻',
  tagline: 'Development, sysadmin, support.',
  defaultVatRate: 25,
  group: 'professional',
  segments: [
    {
      label: 'Hourly',
      items: [
        { name: 'Senior dev — per hour',    priceSek: 1495, vatRate: 25 },
        { name: 'Mid dev — per hour',       priceSek: 995,  vatRate: 25 },
        { name: 'Sysadmin — per hour',      priceSek: 895,  vatRate: 25 },
        { name: 'Support — per hour',       priceSek: 595,  vatRate: 25 },
      ],
    },
    {
      label: 'Daily / project',
      items: [
        { name: 'Day rate — senior',        priceSek: 9995,  vatRate: 25 },
        { name: 'Day rate — mid',           priceSek: 6995,  vatRate: 25 },
        { name: 'Sprint (2 weeks)',         priceSek: 79995, vatRate: 25 },
        { name: 'Project — small website',  priceSek: 24995, vatRate: 25 },
      ],
    },
    {
      label: 'Retainers & support',
      items: [
        { name: 'Monthly retainer — 10 h',  priceSek: 14995, vatRate: 25 },
        { name: 'Monthly retainer — 20 h',  priceSek: 27995, vatRate: 25 },
        { name: 'Emergency call-out',       priceSek: 2495,  vatRate: 25 },
        { name: 'Hosting management — mo.', priceSek: 1495,  vatRate: 25 },
      ],
    },
  ],
};

const TEMPLATE_PHOTOGRAPHER: IndustryTemplate = {
  id: 'photographer',
  label: 'Photographer',
  emoji: '📸',
  tagline: 'Portraits, weddings, events, commercial.',
  defaultVatRate: 25,
  group: 'professional',
  segments: [
    {
      label: 'Sessions',
      items: [
        { name: 'Portrait session (1 h)',  priceSek: 2495, vatRate: 25 },
        { name: 'Family session',          priceSek: 3495, vatRate: 25 },
        { name: 'Headshot session',        priceSek: 1995, vatRate: 25 },
        { name: 'Boudoir session',         priceSek: 4495, vatRate: 25 },
      ],
    },
    {
      label: 'Events',
      items: [
        { name: 'Wedding — half day',      priceSek: 14995, vatRate: 25 },
        { name: 'Wedding — full day',      priceSek: 27995, vatRate: 25 },
        { name: 'Event coverage (4 h)',    priceSek: 7995,  vatRate: 25 },
        { name: 'Corporate event (8 h)',   priceSek: 14995, vatRate: 25 },
      ],
    },
    {
      label: 'Products',
      items: [
        { name: 'Digital gallery',         priceSek: 1995, vatRate: 25 },
        { name: 'Printed album',           priceSek: 4995, vatRate: 25 },
        { name: 'Wall print (large)',      priceSek: 1495, vatRate: 25 },
        { name: 'Additional edit',         priceSek: 295,  vatRate: 25 },
      ],
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────
// EXPORT — the master list (40 entries, in display order)
// ───────────────────────────────────────────────────────────────────────

export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  // Food & Drink (12)
  TEMPLATE_CAFE,
  TEMPLATE_BAR,
  TEMPLATE_WINE_BAR,
  TEMPLATE_BAKERY,
  TEMPLATE_PATISSERIE,
  TEMPLATE_ICE_CREAM,
  TEMPLATE_RESTAURANT_CASUAL,
  TEMPLATE_RESTAURANT_FINE,
  TEMPLATE_PIZZERIA,
  TEMPLATE_FOOD_TRUCK,
  TEMPLATE_CATERING,
  TEMPLATE_JUICE_BAR,
  // Beauty & Wellness (8)
  TEMPLATE_HAIRDRESSER,
  TEMPLATE_BARBERSHOP,
  TEMPLATE_NAIL_SALON,
  TEMPLATE_BEAUTY_SPA,
  TEMPLATE_MASSAGE,
  TEMPLATE_TATTOO,
  TEMPLATE_YOGA_STUDIO,
  TEMPLATE_GYM,
  // Trades (6)
  TEMPLATE_PLUMBER,
  TEMPLATE_ELECTRICIAN,
  TEMPLATE_HANDYMAN,
  TEMPLATE_PAINTER,
  TEMPLATE_LOCKSMITH,
  TEMPLATE_CLEANING,
  // Auto & mobility (3)
  TEMPLATE_BIKE_SHOP,
  TEMPLATE_AUTO_MECHANIC,
  TEMPLATE_CAR_WASH,
  // Retail (7)
  TEMPLATE_FLORIST,
  TEMPLATE_BOOKSTORE,
  TEMPLATE_CLOTHING,
  TEMPLATE_JEWELRY,
  TEMPLATE_ANTIQUE,
  TEMPLATE_MUSIC_STORE,
  TEMPLATE_PET_SHOP,
  // Professional (4)
  TEMPLATE_LAWYER,
  TEMPLATE_ACCOUNTANT,
  TEMPLATE_IT_CONSULTANT,
  TEMPLATE_PHOTOGRAPHER,
];

export const TEMPLATE_GROUPS: Array<{
  id: IndustryTemplate['group'];
  label: string;
  emoji: string;
}> = [
  { id: 'food-drink',       label: 'Food & Drink',      emoji: '🍽️' },
  { id: 'beauty-wellness',  label: 'Beauty & Wellness', emoji: '💆' },
  { id: 'trades',           label: 'Trades',            emoji: '🔧' },
  { id: 'auto-mobility',    label: 'Auto & Mobility',   emoji: '🚗' },
  { id: 'retail',           label: 'Retail',            emoji: '🛍️' },
  { id: 'professional',     label: 'Professional',      emoji: '💼' },
];

/** Look up a template by id; null when missing. */
export function getTemplate(id: string): IndustryTemplate | null {
  return INDUSTRY_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** Total item count across all templates — useful in the picker UI. */
export function totalItemsAcrossAllTemplates(): number {
  return INDUSTRY_TEMPLATES.reduce(
    (n, t) => n + t.segments.reduce((m, s) => m + s.items.length, 0),
    0,
  );
}
