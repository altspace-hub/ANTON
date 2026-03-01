/**
 * seed-kitchenbox.ts
 *
 * Seeds a standalone SQLite database (test-data/kitchenbox.sqlite) with
 * KitchenBox EU AB test data: products, customers, orders, and order items.
 *
 * Usage:
 *   cd test-data
 *   npx tsx seed-kitchenbox.ts
 *
 * Requires: better-sqlite3 (already in project devDependencies)
 * Output:   test-data/kitchenbox.sqlite
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'kitchenbox.sqlite');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log(`\n🏭 KitchenBox EU AB — Database Seeder`);
console.log(`   Output: ${DB_PATH}\n`);

// ─── SCHEMA ─────────────────────────────────────────────────────────────────

db.exec(`
  DROP TABLE IF EXISTS order_items;
  DROP TABLE IF EXISTS orders;
  DROP TABLE IF EXISTS customers;
  DROP TABLE IF EXISTS products;
  DROP TABLE IF EXISTS suppliers;

  CREATE TABLE suppliers (
    supplier_id   TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    country_code  TEXT NOT NULL,
    country       TEXT NOT NULL,
    city          TEXT NOT NULL,
    contact_name  TEXT,
    contact_email TEXT,
    payment_terms TEXT,
    lead_time_weeks_min INTEGER,
    lead_time_weeks_max INTEGER,
    annual_cost_2024_eur REAL
  );

  CREATE TABLE products (
    sku           TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    ean           TEXT UNIQUE,
    category      TEXT NOT NULL,
    price_eur     REAL NOT NULL,
    cost_eur      REAL NOT NULL,
    margin_pct    REAL NOT NULL,
    origin_country TEXT,
    brand         TEXT,
    supplier_id   TEXT REFERENCES suppliers(supplier_id),
    stock_units   INTEGER DEFAULT 0,
    active        INTEGER DEFAULT 1
  );

  CREATE TABLE customers (
    customer_id       TEXT PRIMARY KEY,
    first_name        TEXT,
    last_name         TEXT,
    email             TEXT UNIQUE,
    phone             TEXT,
    date_of_birth     TEXT,
    customer_type     TEXT NOT NULL CHECK(customer_type IN ('B2C','B2B')),
    company_name      TEXT,
    vat_number        TEXT,
    street            TEXT,
    city              TEXT,
    postcode          TEXT,
    country_code      TEXT NOT NULL,
    country           TEXT NOT NULL,
    registered_date   TEXT NOT NULL,
    total_orders      INTEGER DEFAULT 0,
    total_spent_eur   REAL DEFAULT 0,
    last_order_date   TEXT,
    marketing_consent INTEGER DEFAULT 0,
    gdpr_basis        TEXT NOT NULL
  );

  CREATE TABLE orders (
    order_id          TEXT PRIMARY KEY,
    customer_id       TEXT NOT NULL REFERENCES customers(customer_id),
    order_date        TEXT NOT NULL,
    status            TEXT NOT NULL,
    payment_method    TEXT,
    carrier           TEXT,
    tracking_number   TEXT,
    shipping_cost_eur REAL DEFAULT 0,
    subtotal_eur      REAL NOT NULL,
    discount_eur      REAL DEFAULT 0,
    total_eur         REAL NOT NULL,
    is_return         INTEGER DEFAULT 0,
    return_date       TEXT,
    notes             TEXT
  );

  CREATE TABLE order_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id      TEXT NOT NULL REFERENCES orders(order_id),
    sku           TEXT NOT NULL REFERENCES products(sku),
    product_name  TEXT NOT NULL,
    quantity      INTEGER NOT NULL DEFAULT 1,
    unit_price_eur REAL NOT NULL,
    line_total_eur REAL NOT NULL
  );

  CREATE INDEX idx_orders_customer ON orders(customer_id);
  CREATE INDEX idx_orders_date     ON orders(order_date);
  CREATE INDEX idx_items_order     ON order_items(order_id);
  CREATE INDEX idx_items_sku       ON order_items(sku);
`);

console.log('✅ Schema created');

// ─── SUPPLIERS ──────────────────────────────────────────────────────────────

const insertSupplier = db.prepare(`
  INSERT INTO suppliers VALUES (?,?,?,?,?,?,?,?,?,?,?)
`);

const suppliers = [
  ['SUP-001', 'Güter Stahl GmbH',         'DE', 'Germany',     'Solingen',   'Klaus Hartmann',  'k.hartmann@gueterstahl.de',        'Net 45', 4,  6,  312000],
  ['SUP-002', 'Tanaka Pro Industries',     'JP', 'Japan',       'Seki City',  'Yuki Tanaka',     'export@tanakapro.jp',               '50% prepay + BL', 10, 14, 68000],
  ['SUP-003', 'Casa Verde Lda.',           'PT', 'Portugal',    'Aveiro',     'Ana Ferreira',    'comercial@casaverde.pt',            'Net 30', 5,  7,  198000],
  ['SUP-004', 'Acciaio Pro S.r.l.',        'IT', 'Italy',       'Brescia',    'Marco Colombo',   'm.colombo@acciaiopro.it',           'Net 30', 4,  5,  84000],
  ['SUP-005', 'Fonte Royale SAS',          'FR', 'France',      'Alsace',     'Pierre Dubois',   'export@fonteroyale.fr',             'Net 45', 6,  8,  46000],
  ['SUP-006', 'BakePro B.V.',              'NL', 'Netherlands', 'Eindhoven',  'Sanne van den Heuvel', 's.vdenheuvel@bakepro.nl',    'Net 30', 2,  3,  118000],
  ['SUP-007', 'NordicStore AB',            'SE', 'Sweden',      'Helsingborg','Ingrid Larsson',  'i.larsson@nordicstore.se',          'Net 30', 1,  2,  156000],
  ['SUP-008', 'Holzwerk GmbH & Co. KG',   'DE', 'Germany',     'Baden-Baden','Thomas Becker',   'export@holzwerk-gmbh.de',           'Net 30', 3,  4,  28000],
  ['SUP-009', 'Präzision Technik GmbH',   'DE', 'Germany',     'Stuttgart',  'Sabine Hoffmann', 's.hoffmann@praezision-technik.de',  'Net 30', 3,  5,  26000],
  ['SUP-010', 'Pietra e Arte S.r.l.',      'IT', 'Italy',       'Carrara',    'Lucia Moretti',   'export@pietraarte.it',              'Net 45', 7,  10, 62000],
];

for (const s of suppliers) insertSupplier.run(...s);
console.log(`✅ ${suppliers.length} suppliers inserted`);

// ─── PRODUCTS ───────────────────────────────────────────────────────────────

const insertProduct = db.prepare(`
  INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?,1)
`);

const products = [
  // Kitchen Knives
  ['KB-KN-001', "Chef's Knife 20cm — Professional Series", '7350123400011', 'Kitchen Knives',    89.00, 31.50, 64.6, 'Germany',     'Güter Stahl',  'SUP-001', 142],
  ['KB-KN-002', 'Bread Knife 23cm — Serrated',              '7350123400028', 'Kitchen Knives',    59.00, 19.80, 66.4, 'Germany',     'Güter Stahl',  'SUP-001', 184],
  ['KB-KN-003', 'Paring Knife 9cm',                         '7350123400035', 'Kitchen Knives',    29.00,  9.20, 68.3, 'Germany',     'Güter Stahl',  'SUP-001', 210],
  ['KB-KN-004', 'Santoku Knife 18cm — Japanese Steel',      '7350123400042', 'Kitchen Knives',   129.00, 54.00, 58.1, 'Japan',       'Tanaka Pro',   'SUP-002',  88],
  ['KB-KN-005', 'Knife Block Set — 5 Pieces',               '7350123400059', 'Kitchen Knives',   219.00, 82.00, 62.6, 'Germany',     'Güter Stahl',  'SUP-001',  74],
  ['KB-KN-006', 'Honing Steel 25cm',                        '7350123400066', 'Kitchen Knives',    34.00, 10.50, 69.1, 'Germany',     'Güter Stahl',  'SUP-001', 144],
  // Cookware
  ['KB-CW-001', 'Non-stick Frying Pan 24cm',                '7350123401018', 'Cookware',          49.00, 15.20, 69.0, 'Portugal',    'Casa Verde',   'SUP-003', 196],
  ['KB-CW-002', 'Non-stick Frying Pan 28cm',                '7350123401025', 'Cookware',          59.00, 18.40, 68.8, 'Portugal',    'Casa Verde',   'SUP-003', 168],
  ['KB-CW-003', 'Stainless Steel Stockpot 6L',              '7350123401032', 'Cookware',          79.00, 28.50, 63.9, 'Italy',       'Acciaio Pro',  'SUP-004', 122],
  ['KB-CW-004', 'Cast Iron Skillet 26cm',                   '7350123401049', 'Cookware',          89.00, 32.00, 64.0, 'France',      'Fonte Royale', 'SUP-005',  86],
  ['KB-CW-005', 'Sauté Pan 28cm with Lid',                  '7350123401056', 'Cookware',          99.00, 36.00, 63.6, 'Portugal',    'Casa Verde',   'SUP-003', 104],
  ['KB-CW-006', 'Wok 32cm — Carbon Steel',                  '7350123401063', 'Cookware',          69.00, 22.00, 68.1, 'Germany',     'Güter Stahl',  'SUP-001', 152],
  ['KB-CW-007', 'Cookware Set 5-piece — Non-stick',         '7350123401070', 'Cookware',         189.00, 68.00, 64.0, 'Portugal',    'Casa Verde',   'SUP-003', 276],
  // Bakeware
  ['KB-BW-001', 'Non-stick Loaf Pan 30cm',                  '7350123402015', 'Bakeware',          24.00,  7.20, 70.0, 'Netherlands', 'BakePro',      'SUP-006', 162],
  ['KB-BW-002', 'Springform Cake Tin 24cm',                 '7350123402022', 'Bakeware',          29.00,  8.80, 69.7, 'Netherlands', 'BakePro',      'SUP-006', 148],
  ['KB-BW-003', 'Muffin Tin 12-cup',                        '7350123402039', 'Bakeware',          22.00,  6.50, 70.5, 'Netherlands', 'BakePro',      'SUP-006', 178],
  ['KB-BW-004', 'Baking Sheet 40x30cm — Set of 2',          '7350123402046', 'Bakeware',          32.00,  9.60, 70.0, 'Netherlands', 'BakePro',      'SUP-006', 122],
  ['KB-BW-005', 'Roasting Tin with Rack 38cm',              '7350123402053', 'Bakeware',          44.00, 14.00, 68.2, 'Netherlands', 'BakePro',      'SUP-006',  78],
  // Food Storage
  ['KB-FS-001', 'Glass Storage Set — 6 containers',         '7350123403012', 'Food Storage',      49.00, 16.50, 66.3, 'Sweden',      'NordicStore',  'SUP-007', 142],
  ['KB-FS-002', 'Vacuum Container Set — 4 pieces',          '7350123403029', 'Food Storage',      59.00, 20.00, 66.1, 'Sweden',      'NordicStore',  'SUP-007', 118],
  ['KB-FS-003', 'Airtight Container — 1.2L',                '7350123403036', 'Food Storage',      14.00,  4.20, 70.0, 'Sweden',      'NordicStore',  'SUP-007', 136],
  ['KB-FS-004', 'Airtight Container — 2.5L',                '7350123403043', 'Food Storage',      19.00,  5.80, 69.5, 'Sweden',      'NordicStore',  'SUP-007', 116],
  // Gadgets & Tools
  ['KB-GT-001', 'Bamboo Cutting Board — Large 40x25cm',     '7350123404019', 'Gadgets & Tools',   34.00,  9.80, 71.2, 'Germany',     'Holzwerk',     'SUP-008', 164],
  ['KB-GT-002', 'Marble Pastry Board 50x35cm',              '7350123404026', 'Gadgets & Tools',   69.00, 24.00, 65.2, 'Italy',       'Pietra',       'SUP-010',  88],
  ['KB-GT-003', 'Kitchen Scale — Digital 5kg',              '7350123404033', 'Gadgets & Tools',   29.00,  8.50, 70.7, 'Germany',     'Präzision',    'SUP-009', 122],
  ['KB-GT-004', 'Box Grater — 4-sided Stainless',           '7350123404040', 'Gadgets & Tools',   24.00,  7.00, 70.8, 'Germany',     'Güter Stahl',  'SUP-001', 196],
  ['KB-GT-005', 'Colander — Stainless 24cm',                '7350123404057', 'Gadgets & Tools',   29.00,  8.80, 69.7, 'Italy',       'Acciaio Pro',  'SUP-004', 144],
  ['KB-GT-006', 'Silicone Spatula Set — 3 piece',           '7350123404064', 'Gadgets & Tools',   19.00,  5.50, 71.1, 'Sweden',      'NordicStore',  'SUP-007', 188],
  ['KB-GT-007', 'Whisk Set — 3 sizes',                      '7350123404071', 'Gadgets & Tools',   24.00,  7.20, 70.0, 'Germany',     'Güter Stahl',  'SUP-001', 164],
  ['KB-GT-008', 'Mortar & Pestle — Granite 15cm',           '7350123404088', 'Gadgets & Tools',   44.00, 14.50, 67.0, 'Italy',       'Pietra',       'SUP-010', 102],
  ['KB-GT-009', 'Mandoline Slicer — Adjustable',            '7350123404095', 'Gadgets & Tools',   54.00, 18.00, 66.7, 'Germany',     'Güter Stahl',  'SUP-001',  96],
  ['KB-GT-010', 'Measuring Cups & Spoons Set',              '7350123404101', 'Gadgets & Tools',   22.00,  6.20, 71.8, 'Sweden',      'NordicStore',  'SUP-007', 176],
];

for (const p of products) insertProduct.run(...p);
console.log(`✅ ${products.length} products inserted`);

// ─── CUSTOMERS ──────────────────────────────────────────────────────────────

const insertCustomer = db.prepare(`
  INSERT INTO customers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);

const customers = [
  ['CUST-0001','Anna','Eriksson','anna.eriksson@gmail.com','+46701234567','1985-03-12','B2C',null,null,'Kungsgatan 14','Stockholm','111 35','SE','Sweden','2021-04-18',8,612.50,'2024-11-22',1,'consent'],
  ['CUST-0002','Thomas','Müller','thomas.mueller@web.de','+4917612345678','1978-09-24','B2C',null,null,'Berliner Str. 42','Berlin','10115','DE','Germany','2021-07-03',5,389.00,'2024-10-15',1,'consent'],
  ['CUST-0003','Sophie','Dubois','sophie.dubois@orange.fr','+33612345678','1992-06-15','B2C',null,null,'Rue de Rivoli 88','Paris','75001','FR','France','2022-01-11',3,247.00,'2024-09-08',0,'legitimate_interest'],
  ['CUST-0004','Pieter','de Vries','p.devries@ziggo.nl','+31612345678','1969-11-30','B2C',null,null,'Keizersgracht 112','Amsterdam','1015 CW','NL','Netherlands','2021-09-22',12,1040.00,'2024-12-01',1,'consent'],
  ['CUST-0005','Maria','Korhonen','maria.korhonen@hotmail.fi','+358401234567','1988-02-07','B2C',null,null,'Mannerheimintie 55','Helsinki','00250','FI','Finland','2022-03-14',4,318.00,'2024-08-20',1,'consent'],
  ['CUST-0006','Lars','Andersen','lars.andersen@gmail.com','+4520123456','1975-05-19','B2C',null,null,'Strøget 8','Copenhagen','1158','DK','Denmark','2021-11-08',7,542.00,'2024-11-10',1,'consent'],
  ['CUST-0007','Emma','Johansson','emma.johansson@telia.se','+46731234567','1995-08-28','B2C',null,null,'Vasagatan 22','Gothenburg','411 24','SE','Sweden','2023-01-05',2,148.00,'2024-07-14',1,'consent'],
  ['CUST-0008','Marco','Rossi','marco.rossi@libero.it','+393312345678','1982-12-03','B2C',null,null,'Via Roma 31','Milan','20121','IT','Italy','2022-06-30',1,89.00,'2022-06-30',0,'consent'],
  ['CUST-0009','Annelies','van den Berg','annelies.vdberg@gmail.com','+31623456789','1970-04-16','B2C',null,null,'Prinsengracht 220','Amsterdam','1016 HB','NL','Netherlands','2021-10-02',9,724.50,'2024-12-08',1,'consent'],
  ['CUST-0010','Björn','Lindqvist','bjorn.lindqvist@hotmail.se','+46761234567','1963-07-22','B2C',null,null,'Storgatan 5','Malmö','211 22','SE','Sweden','2022-05-17',6,498.00,'2024-10-28',0,'legitimate_interest'],
  ['CUST-0011',null,null,'info@goudenlevel.nl','+31104567890',null,'B2B','Restaurant De Gouden Lepel','NL820394819','Wijnhaven 77','Rotterdam','3011 WH','NL','Netherlands','2022-08-01',15,4280.00,'2024-12-12',1,'contract'],
  ['CUST-0012','Hannah','Schmidt','hannah.schmidt@gmx.de','+4915112345678','1990-01-25','B2C',null,null,'Hauptstraße 67','Munich','80331','DE','Germany','2022-02-28',4,312.00,'2024-09-30',1,'consent'],
  ['CUST-0013',null,null,null,'+46812345678',null,'B2B','Culinary Academy Stockholm','SE556789234501','Östermalmsplan 3','Stockholm','114 42','SE','Sweden','2021-12-01',22,8640.00,'2024-12-01',1,'contract'],
  ['CUST-0014','Julie','Martin','julie.martin@sfr.fr','+33712345678','1987-10-11','B2C',null,null,'Avenue des Champs-Élysées 120','Paris','75008','FR','France','2023-04-19',2,178.00,'2024-11-05',1,'consent'],
  ['CUST-0015','Erik','Svensson','erik.svensson@outlook.se','+46791234567','1980-03-04','B2C',null,null,'Drottninggatan 14','Malmö','211 27','SE','Sweden','2021-06-15',10,810.00,'2024-12-15',1,'consent'],
  ['CUST-0016','Fiona',"O'Brien",'fiona.obrien@gmail.com','+353861234567','1993-09-17','B2C',null,null,'Grafton Street 45','Dublin','D02 XH35','IE','Ireland','2023-07-22',1,59.00,'2023-07-22',0,'consent'],
  ['CUST-0017','Klaus','Wagner','k.wagner@t-online.de','+4916312345678','1955-06-08','B2C',null,null,'Goethestraße 12','Frankfurt','60313','DE','Germany','2022-10-14',3,267.00,'2024-06-20',0,'legitimate_interest'],
  ['CUST-0018','Sofie','Peeters','sofie.peeters@telenet.be','+32472123456','1989-04-29','B2C',null,null,'Meir 78','Antwerp','2000','BE','Belgium','2023-02-08',3,224.00,'2024-10-01',1,'consent'],
  ['CUST-0019',null,null,null,'+3250123456',null,'B2B','Hotel Gastronome Brugge NV','BE0682394157','Markt 12','Brugge','8000','BE','Belgium','2023-05-15',8,2940.00,'2024-11-28',1,'contract'],
  ['CUST-0020','Mikael','Haapala','mikael.haapala@gmail.com','+358501234567','1977-08-13','B2C',null,null,'Aleksanterinkatu 18','Helsinki','00100','FI','Finland','2022-09-03',5,406.00,'2024-08-30',1,'consent'],
];

for (const c of customers) insertCustomer.run(...c);
console.log(`✅ ${customers.length} customers inserted`);

// ─── ORDERS & ORDER ITEMS ────────────────────────────────────────────────────

const insertOrder = db.prepare(`
  INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);

const insertItem = db.prepare(`
  INSERT INTO order_items (order_id, sku, product_name, quantity, unit_price_eur, line_total_eur)
  VALUES (?,?,?,?,?,?)
`);

interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  price: number;
}

interface OrderData {
  orderId: string;
  customerId: string;
  date: string;
  status: string;
  payment: string;
  carrier: string;
  tracking: string;
  shipping: number;
  discount: number;
  isReturn: number;
  returnDate: string | null;
  notes: string | null;
  items: OrderItem[];
}

const orders: OrderData[] = [
  {
    orderId: 'KB-2024-0001', customerId: 'CUST-0013', date: '2024-01-08',
    status: 'delivered', payment: 'invoice', carrier: 'DHL', tracking: 'DHL-SE2401-0001',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: 'B2B — bulk restock January',
    items: [
      { sku: 'KB-KN-001', name: "Chef's Knife 20cm — Professional Series", qty: 5, price: 89.00 },
      { sku: 'KB-CW-001', name: 'Non-stick Frying Pan 24cm', qty: 8, price: 49.00 },
      { sku: 'KB-GT-003', name: 'Kitchen Scale — Digital 5kg', qty: 3, price: 29.00 },
    ],
  },
  {
    orderId: 'KB-2024-0002', customerId: 'CUST-0001', date: '2024-01-14',
    status: 'delivered', payment: 'card', carrier: 'PostNord', tracking: 'SE2024-PNL-00412',
    shipping: 5.90, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-KN-003', name: 'Paring Knife 9cm', qty: 1, price: 29.00 },
      { sku: 'KB-GT-006', name: 'Silicone Spatula Set — 3 piece', qty: 1, price: 19.00 },
      { sku: 'KB-FS-003', name: 'Airtight Container — 1.2L', qty: 2, price: 14.00 },
    ],
  },
  {
    orderId: 'KB-2024-0003', customerId: 'CUST-0004', date: '2024-01-19',
    status: 'delivered', payment: 'klarna', carrier: 'DPD', tracking: 'DPD-NL2024-00318',
    shipping: 9.90, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-CW-007', name: 'Cookware Set 5-piece — Non-stick', qty: 1, price: 189.00 },
      { sku: 'KB-GT-001', name: 'Bamboo Cutting Board — Large 40x25cm', qty: 1, price: 34.00 },
    ],
  },
  {
    orderId: 'KB-2024-0004', customerId: 'CUST-0006', date: '2024-02-03',
    status: 'delivered', payment: 'card', carrier: 'GLS', tracking: 'GLS-DK2024-01144',
    shipping: 7.90, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-KN-004', name: 'Santoku Knife 18cm — Japanese Steel', qty: 1, price: 129.00 },
    ],
  },
  {
    orderId: 'KB-2024-0005', customerId: 'CUST-0011', date: '2024-02-10',
    status: 'delivered', payment: 'invoice', carrier: 'DHL', tracking: 'DHL-NL2402-0022',
    shipping: 0, discount: 50.00, isReturn: 0, returnDate: null, notes: 'B2B — 10-unit knife deal, negotiated discount',
    items: [
      { sku: 'KB-KN-001', name: "Chef's Knife 20cm — Professional Series", qty: 6, price: 89.00 },
      { sku: 'KB-KN-006', name: 'Honing Steel 25cm', qty: 4, price: 34.00 },
    ],
  },
  {
    orderId: 'KB-2024-0006', customerId: 'CUST-0015', date: '2024-02-22',
    status: 'delivered', payment: 'klarna', carrier: 'PostNord', tracking: 'SE2024-PNL-00887',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: 'Free shipping — over €75',
    items: [
      { sku: 'KB-CW-004', name: 'Cast Iron Skillet 26cm', qty: 1, price: 89.00 },
      { sku: 'KB-GT-008', name: 'Mortar & Pestle — Granite 15cm', qty: 1, price: 44.00 },
    ],
  },
  {
    orderId: 'KB-2024-0007', customerId: 'CUST-0009', date: '2024-03-05',
    status: 'delivered', payment: 'card', carrier: 'DPD', tracking: 'DPD-NL2024-00892',
    shipping: 9.90, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-BW-002', name: 'Springform Cake Tin 24cm', qty: 1, price: 29.00 },
      { sku: 'KB-BW-003', name: 'Muffin Tin 12-cup', qty: 1, price: 22.00 },
      { sku: 'KB-BW-004', name: 'Baking Sheet 40x30cm — Set of 2', qty: 2, price: 32.00 },
    ],
  },
  {
    orderId: 'KB-2024-0008', customerId: 'CUST-0002', date: '2024-03-12',
    status: 'delivered', payment: 'card', carrier: 'DHL', tracking: 'DHL-DE2403-0044',
    shipping: 7.90, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-KN-005', name: 'Knife Block Set — 5 Pieces', qty: 1, price: 219.00 },
    ],
  },
  {
    orderId: 'KB-2024-0009', customerId: 'CUST-0013', date: '2024-03-18',
    status: 'delivered', payment: 'invoice', carrier: 'DHL', tracking: 'DHL-SE2403-0088',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: 'B2B — Q1 restock, kitchen tools',
    items: [
      { sku: 'KB-GT-004', name: 'Box Grater — 4-sided Stainless', qty: 8, price: 24.00 },
      { sku: 'KB-GT-007', name: 'Whisk Set — 3 sizes', qty: 6, price: 24.00 },
      { sku: 'KB-GT-005', name: 'Colander — Stainless 24cm', qty: 4, price: 29.00 },
      { sku: 'KB-GT-010', name: 'Measuring Cups & Spoons Set', qty: 6, price: 22.00 },
    ],
  },
  {
    orderId: 'KB-2024-0010', customerId: 'CUST-0005', date: '2024-04-02',
    status: 'delivered', payment: 'klarna', carrier: 'Posti', tracking: 'POSTI-FI2404-00341',
    shipping: 7.90, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-FS-001', name: 'Glass Storage Set — 6 containers', qty: 1, price: 49.00 },
      { sku: 'KB-FS-002', name: 'Vacuum Container Set — 4 pieces', qty: 1, price: 59.00 },
    ],
  },
  {
    orderId: 'KB-2024-0011', customerId: 'CUST-0004', date: '2024-04-18',
    status: 'delivered', payment: 'card', carrier: 'DPD', tracking: 'DPD-NL2024-01440',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-KN-001', name: "Chef's Knife 20cm — Professional Series", qty: 1, price: 89.00 },
      { sku: 'KB-CW-006', name: 'Wok 32cm — Carbon Steel', qty: 1, price: 69.00 },
    ],
  },
  {
    orderId: 'KB-2024-0012', customerId: 'CUST-0019', date: '2024-04-25',
    status: 'delivered', payment: 'invoice', carrier: 'DPD', tracking: 'DPD-BE2024-00722',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: 'B2B — hotel kitchen supplies',
    items: [
      { sku: 'KB-CW-003', name: 'Stainless Steel Stockpot 6L', qty: 4, price: 79.00 },
      { sku: 'KB-CW-005', name: 'Sauté Pan 28cm with Lid', qty: 4, price: 99.00 },
      { sku: 'KB-KN-001', name: "Chef's Knife 20cm — Professional Series", qty: 3, price: 89.00 },
    ],
  },
  {
    orderId: 'KB-2024-0013', customerId: 'CUST-0012', date: '2024-05-07',
    status: 'delivered', payment: 'card', carrier: 'DHL', tracking: 'DHL-DE2405-0122',
    shipping: 7.90, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-GT-002', name: 'Marble Pastry Board 50x35cm', qty: 1, price: 69.00 },
      { sku: 'KB-BW-001', name: 'Non-stick Loaf Pan 30cm', qty: 2, price: 24.00 },
    ],
  },
  {
    orderId: 'KB-2024-0014', customerId: 'CUST-0010', date: '2024-05-14',
    status: 'delivered', payment: 'klarna', carrier: 'PostNord', tracking: 'SE2024-PNL-02011',
    shipping: 5.90, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-CW-001', name: 'Non-stick Frying Pan 24cm', qty: 1, price: 49.00 },
      { sku: 'KB-CW-002', name: 'Non-stick Frying Pan 28cm', qty: 1, price: 59.00 },
    ],
  },
  {
    orderId: 'KB-2024-0015', customerId: 'CUST-0011', date: '2024-05-20',
    status: 'delivered', payment: 'invoice', carrier: 'DHL', tracking: 'DHL-NL2405-0088',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: 'B2B — bakeware order for dessert menu launch',
    items: [
      { sku: 'KB-BW-002', name: 'Springform Cake Tin 24cm', qty: 6, price: 29.00 },
      { sku: 'KB-BW-005', name: 'Roasting Tin with Rack 38cm', qty: 4, price: 44.00 },
      { sku: 'KB-BW-003', name: 'Muffin Tin 12-cup', qty: 4, price: 22.00 },
    ],
  },
  {
    orderId: 'KB-2024-0016', customerId: 'CUST-0003', date: '2024-06-08',
    status: 'delivered', payment: 'card', carrier: 'Colissimo', tracking: 'FR-COL-2406-008812',
    shipping: 9.90, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-GT-009', name: 'Mandoline Slicer — Adjustable', qty: 1, price: 54.00 },
    ],
  },
  {
    orderId: 'KB-2024-0017', customerId: 'CUST-0015', date: '2024-06-20',
    status: 'returned', payment: 'klarna', carrier: 'PostNord', tracking: 'SE2024-PNL-02801',
    shipping: 0, discount: 0, isReturn: 1, returnDate: '2024-07-02', notes: 'Customer returned: wrong size ordered',
    items: [
      { sku: 'KB-CW-004', name: 'Cast Iron Skillet 26cm', qty: 1, price: 89.00 },
    ],
  },
  {
    orderId: 'KB-2024-0018', customerId: 'CUST-0009', date: '2024-06-28',
    status: 'delivered', payment: 'card', carrier: 'DPD', tracking: 'DPD-NL2024-02890',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-FS-001', name: 'Glass Storage Set — 6 containers', qty: 2, price: 49.00 },
      { sku: 'KB-FS-003', name: 'Airtight Container — 1.2L', qty: 3, price: 14.00 },
      { sku: 'KB-FS-004', name: 'Airtight Container — 2.5L', qty: 2, price: 19.00 },
    ],
  },
  {
    orderId: 'KB-2024-0019', customerId: 'CUST-0013', date: '2024-07-02',
    status: 'delivered', payment: 'invoice', carrier: 'DHL', tracking: 'DHL-SE2407-0044',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: 'B2B — summer course materials',
    items: [
      { sku: 'KB-KN-004', name: 'Santoku Knife 18cm — Japanese Steel', qty: 10, price: 129.00 },
      { sku: 'KB-KN-006', name: 'Honing Steel 25cm', qty: 10, price: 34.00 },
      { sku: 'KB-GT-001', name: 'Bamboo Cutting Board — Large 40x25cm', qty: 10, price: 34.00 },
    ],
  },
  {
    orderId: 'KB-2024-0020', customerId: 'CUST-0007', date: '2024-07-14',
    status: 'delivered', payment: 'card', carrier: 'PostNord', tracking: 'SE2024-PNL-03401',
    shipping: 5.90, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-BW-001', name: 'Non-stick Loaf Pan 30cm', qty: 1, price: 24.00 },
      { sku: 'KB-BW-003', name: 'Muffin Tin 12-cup', qty: 1, price: 22.00 },
      { sku: 'KB-GT-010', name: 'Measuring Cups & Spoons Set', qty: 1, price: 22.00 },
    ],
  },
  {
    orderId: 'KB-2024-0021', customerId: 'CUST-0020', date: '2024-07-28',
    status: 'delivered', payment: 'klarna', carrier: 'Posti', tracking: 'POSTI-FI2407-00891',
    shipping: 7.90, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-CW-007', name: 'Cookware Set 5-piece — Non-stick', qty: 1, price: 189.00 },
    ],
  },
  {
    orderId: 'KB-2024-0022', customerId: 'CUST-0005', date: '2024-08-09',
    status: 'delivered', payment: 'card', carrier: 'Posti', tracking: 'POSTI-FI2408-00341',
    shipping: 7.90, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-GT-006', name: 'Silicone Spatula Set — 3 piece', qty: 2, price: 19.00 },
      { sku: 'KB-GT-007', name: 'Whisk Set — 3 sizes', qty: 1, price: 24.00 },
    ],
  },
  {
    orderId: 'KB-2024-0023', customerId: 'CUST-0001', date: '2024-08-22',
    status: 'delivered', payment: 'klarna', carrier: 'PostNord', tracking: 'SE2024-PNL-04100',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-KN-001', name: "Chef's Knife 20cm — Professional Series", qty: 1, price: 89.00 },
      { sku: 'KB-GT-003', name: 'Kitchen Scale — Digital 5kg', qty: 1, price: 29.00 },
    ],
  },
  {
    orderId: 'KB-2024-0024', customerId: 'CUST-0017', date: '2024-09-04',
    status: 'delivered', payment: 'card', carrier: 'DHL', tracking: 'DHL-DE2409-0244',
    shipping: 7.90, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-CW-006', name: 'Wok 32cm — Carbon Steel', qty: 1, price: 69.00 },
      { sku: 'KB-GT-004', name: 'Box Grater — 4-sided Stainless', qty: 1, price: 24.00 },
    ],
  },
  {
    orderId: 'KB-2024-0025', customerId: 'CUST-0019', date: '2024-09-10',
    status: 'delivered', payment: 'invoice', carrier: 'DPD', tracking: 'DPD-BE2024-01788',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: 'B2B — autumn menu refresh',
    items: [
      { sku: 'KB-CW-004', name: 'Cast Iron Skillet 26cm', qty: 2, price: 89.00 },
      { sku: 'KB-CW-005', name: 'Sauté Pan 28cm with Lid', qty: 3, price: 99.00 },
      { sku: 'KB-KN-002', name: 'Bread Knife 23cm — Serrated', qty: 2, price: 59.00 },
    ],
  },
  {
    orderId: 'KB-2024-0026', customerId: 'CUST-0018', date: '2024-09-22',
    status: 'delivered', payment: 'card', carrier: 'DPD', tracking: 'DPD-BE2024-01999',
    shipping: 9.90, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-FS-001', name: 'Glass Storage Set — 6 containers', qty: 1, price: 49.00 },
      { sku: 'KB-FS-002', name: 'Vacuum Container Set — 4 pieces', qty: 1, price: 59.00 },
    ],
  },
  {
    orderId: 'KB-2024-0027', customerId: 'CUST-0003', date: '2024-09-29',
    status: 'delivered', payment: 'klarna', carrier: 'Colissimo', tracking: 'FR-COL-2409-011220',
    shipping: 9.90, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-CW-001', name: 'Non-stick Frying Pan 24cm', qty: 1, price: 49.00 },
      { sku: 'KB-GT-001', name: 'Bamboo Cutting Board — Large 40x25cm', qty: 1, price: 34.00 },
    ],
  },
  {
    orderId: 'KB-2024-0028', customerId: 'CUST-0004', date: '2024-10-08',
    status: 'delivered', payment: 'card', carrier: 'DPD', tracking: 'DPD-NL2024-04120',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-KN-005', name: 'Knife Block Set — 5 Pieces', qty: 1, price: 219.00 },
      { sku: 'KB-GT-008', name: 'Mortar & Pestle — Granite 15cm', qty: 1, price: 44.00 },
    ],
  },
  {
    orderId: 'KB-2024-0029', customerId: 'CUST-0010', date: '2024-10-15',
    status: 'delivered', payment: 'klarna', carrier: 'PostNord', tracking: 'SE2024-PNL-05820',
    shipping: 5.90, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-CW-003', name: 'Stainless Steel Stockpot 6L', qty: 1, price: 79.00 },
      { sku: 'KB-CW-006', name: 'Wok 32cm — Carbon Steel', qty: 1, price: 69.00 },
    ],
  },
  {
    orderId: 'KB-2024-0030', customerId: 'CUST-0013', date: '2024-10-22',
    status: 'delivered', payment: 'invoice', carrier: 'DHL', tracking: 'DHL-SE2410-0188',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: 'B2B — Q4 restock for advanced courses',
    items: [
      { sku: 'KB-KN-001', name: "Chef's Knife 20cm — Professional Series", qty: 8, price: 89.00 },
      { sku: 'KB-KN-004', name: 'Santoku Knife 18cm — Japanese Steel', qty: 6, price: 129.00 },
      { sku: 'KB-CW-007', name: 'Cookware Set 5-piece — Non-stick', qty: 3, price: 189.00 },
    ],
  },
  {
    orderId: 'KB-2024-0031', customerId: 'CUST-0014', date: '2024-11-05',
    status: 'delivered', payment: 'card', carrier: 'Colissimo', tracking: 'FR-COL-2411-014490',
    shipping: 9.90, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-BW-002', name: 'Springform Cake Tin 24cm', qty: 1, price: 29.00 },
      { sku: 'KB-BW-004', name: 'Baking Sheet 40x30cm — Set of 2', qty: 2, price: 32.00 },
    ],
  },
  {
    orderId: 'KB-2024-0032', customerId: 'CUST-0006', date: '2024-11-10',
    status: 'delivered', payment: 'klarna', carrier: 'GLS', tracking: 'GLS-DK2024-04882',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-GT-002', name: 'Marble Pastry Board 50x35cm', qty: 1, price: 69.00 },
      { sku: 'KB-GT-008', name: 'Mortar & Pestle — Granite 15cm', qty: 1, price: 44.00 },
    ],
  },
  {
    orderId: 'KB-2024-0033', customerId: 'CUST-0011', date: '2024-11-19',
    status: 'delivered', payment: 'invoice', carrier: 'DHL', tracking: 'DHL-NL2411-0277',
    shipping: 0, discount: 100.00, isReturn: 0, returnDate: null, notes: 'B2B — Black Friday B2B deal, annual loyalty discount',
    items: [
      { sku: 'KB-CW-007', name: 'Cookware Set 5-piece — Non-stick', qty: 3, price: 189.00 },
      { sku: 'KB-BW-005', name: 'Roasting Tin with Rack 38cm', qty: 4, price: 44.00 },
      { sku: 'KB-CW-004', name: 'Cast Iron Skillet 26cm', qty: 2, price: 89.00 },
    ],
  },
  {
    orderId: 'KB-2024-0034', customerId: 'CUST-0009', date: '2024-11-22',
    status: 'delivered', payment: 'card', carrier: 'DPD', tracking: 'DPD-NL2024-06122',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: 'Black Friday order',
    items: [
      { sku: 'KB-KN-005', name: 'Knife Block Set — 5 Pieces', qty: 1, price: 219.00 },
    ],
  },
  {
    orderId: 'KB-2024-0035', customerId: 'CUST-0001', date: '2024-11-22',
    status: 'delivered', payment: 'klarna', carrier: 'PostNord', tracking: 'SE2024-PNL-07801',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: 'Black Friday order',
    items: [
      { sku: 'KB-CW-007', name: 'Cookware Set 5-piece — Non-stick', qty: 1, price: 189.00 },
      { sku: 'KB-GT-006', name: 'Silicone Spatula Set — 3 piece', qty: 1, price: 19.00 },
    ],
  },
  {
    orderId: 'KB-2024-0036', customerId: 'CUST-0019', date: '2024-11-28',
    status: 'delivered', payment: 'invoice', carrier: 'DPD', tracking: 'DPD-BE2024-04411',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: 'B2B — pre-Christmas supplies',
    items: [
      { sku: 'KB-CW-001', name: 'Non-stick Frying Pan 24cm', qty: 4, price: 49.00 },
      { sku: 'KB-CW-002', name: 'Non-stick Frying Pan 28cm', qty: 4, price: 59.00 },
      { sku: 'KB-KN-001', name: "Chef's Knife 20cm — Professional Series", qty: 2, price: 89.00 },
      { sku: 'KB-KN-002', name: 'Bread Knife 23cm — Serrated', qty: 2, price: 59.00 },
    ],
  },
  {
    orderId: 'KB-2024-0037', customerId: 'CUST-0015', date: '2024-12-01',
    status: 'delivered', payment: 'card', carrier: 'PostNord', tracking: 'SE2024-PNL-08820',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: 'Christmas gift purchase',
    items: [
      { sku: 'KB-KN-005', name: 'Knife Block Set — 5 Pieces', qty: 1, price: 219.00 },
    ],
  },
  {
    orderId: 'KB-2024-0038', customerId: 'CUST-0004', date: '2024-12-01',
    status: 'delivered', payment: 'klarna', carrier: 'DPD', tracking: 'DPD-NL2024-07200',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: 'Christmas gift set',
    items: [
      { sku: 'KB-GT-002', name: 'Marble Pastry Board 50x35cm', qty: 1, price: 69.00 },
      { sku: 'KB-GT-008', name: 'Mortar & Pestle — Granite 15cm', qty: 1, price: 44.00 },
      { sku: 'KB-KN-003', name: 'Paring Knife 9cm', qty: 1, price: 29.00 },
    ],
  },
  {
    orderId: 'KB-2024-0039', customerId: 'CUST-0013', date: '2024-12-01',
    status: 'delivered', payment: 'invoice', carrier: 'DHL', tracking: 'DHL-SE2412-0311',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: 'B2B — year-end large order for spring curriculum',
    items: [
      { sku: 'KB-KN-001', name: "Chef's Knife 20cm — Professional Series", qty: 12, price: 89.00 },
      { sku: 'KB-KN-002', name: 'Bread Knife 23cm — Serrated', qty: 8, price: 59.00 },
      { sku: 'KB-CW-003', name: 'Stainless Steel Stockpot 6L', qty: 6, price: 79.00 },
      { sku: 'KB-GT-003', name: 'Kitchen Scale — Digital 5kg', qty: 6, price: 29.00 },
    ],
  },
  {
    orderId: 'KB-2024-0040', customerId: 'CUST-0009', date: '2024-12-08',
    status: 'delivered', payment: 'card', carrier: 'DPD', tracking: 'DPD-NL2024-08801',
    shipping: 0, discount: 0, isReturn: 0, returnDate: null, notes: null,
    items: [
      { sku: 'KB-FS-002', name: 'Vacuum Container Set — 4 pieces', qty: 2, price: 59.00 },
      { sku: 'KB-FS-004', name: 'Airtight Container — 2.5L', qty: 4, price: 19.00 },
    ],
  },
];

// Insert orders and their items in a transaction
const seedOrders = db.transaction(() => {
  for (const order of orders) {
    const subtotal = order.items.reduce((sum, i) => sum + i.qty * i.price, 0);
    const total = subtotal + order.shipping - order.discount;

    insertOrder.run(
      order.orderId, order.customerId, order.date, order.status,
      order.payment, order.carrier, order.tracking,
      order.shipping, subtotal, order.discount, total,
      order.isReturn, order.returnDate, order.notes
    );

    for (const item of order.items) {
      insertItem.run(
        order.orderId, item.sku, item.name, item.qty, item.price, item.qty * item.price
      );
    }
  }
});

seedOrders();

const totalItems = orders.reduce((s, o) => s + o.items.length, 0);
console.log(`✅ ${orders.length} orders inserted with ${totalItems} line items`);

// ─── VERIFICATION ────────────────────────────────────────────────────────────

const stats = {
  suppliers: (db.prepare('SELECT COUNT(*) as n FROM suppliers').get() as { n: number }).n,
  products:  (db.prepare('SELECT COUNT(*) as n FROM products').get() as { n: number }).n,
  customers: (db.prepare('SELECT COUNT(*) as n FROM customers').get() as { n: number }).n,
  orders:    (db.prepare('SELECT COUNT(*) as n FROM orders').get() as { n: number }).n,
  items:     (db.prepare('SELECT COUNT(*) as n FROM order_items').get() as { n: number }).n,
  revenue:   (db.prepare('SELECT ROUND(SUM(total_eur),2) as n FROM orders WHERE is_return = 0').get() as { n: number }).n,
};

console.log('\n📊 Database summary:');
console.log(`   Suppliers  : ${stats.suppliers}`);
console.log(`   Products   : ${stats.products}`);
console.log(`   Customers  : ${stats.customers}`);
console.log(`   Orders     : ${stats.orders}`);
console.log(`   Line items : ${stats.items}`);
console.log(`   Total rev  : €${stats.revenue.toLocaleString()}`);

// Top customers by spend
const topCustomers = db.prepare(`
  SELECT c.customer_id,
         COALESCE(c.company_name, c.first_name || ' ' || c.last_name) as name,
         c.customer_type,
         COUNT(o.order_id) as order_count,
         ROUND(SUM(o.total_eur),2) as total_eur
  FROM customers c
  JOIN orders o ON o.customer_id = c.customer_id AND o.is_return = 0
  GROUP BY c.customer_id
  ORDER BY total_eur DESC
  LIMIT 5
`).all() as Array<{ customer_id: string; name: string; customer_type: string; order_count: number; total_eur: number }>;

console.log('\n🏆 Top 5 customers by revenue:');
for (const row of topCustomers) {
  console.log(`   ${row.customer_id} (${row.customer_type}) ${row.name}: €${row.total_eur.toLocaleString()} (${row.order_count} orders)`);
}

// Top products by units sold
const topProducts = db.prepare(`
  SELECT oi.sku, oi.product_name,
         SUM(oi.quantity) as units_sold,
         ROUND(SUM(oi.line_total_eur),2) as revenue
  FROM order_items oi
  JOIN orders o ON o.order_id = oi.order_id AND o.is_return = 0
  GROUP BY oi.sku
  ORDER BY revenue DESC
  LIMIT 5
`).all() as Array<{ sku: string; product_name: string; units_sold: number; revenue: number }>;

console.log('\n🥇 Top 5 products by revenue:');
for (const row of topProducts) {
  console.log(`   ${row.sku}: ${row.product_name} — €${row.revenue.toLocaleString()} (${row.units_sold} units)`);
}

db.close();
console.log('\n✅ Done — kitchenbox.sqlite ready\n');
