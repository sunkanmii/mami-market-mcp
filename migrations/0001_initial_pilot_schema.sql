PRAGMA foreign_keys = ON;

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('trader', 'buyer', 'facilitator')),
  display_name TEXT NOT NULL,
  business_name TEXT,
  market_name TEXT,
  area TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'contact_confirmed', 'in_person_confirmed')),
  consented_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pilot_access (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
);

CREATE TABLE inventory (
  id TEXT PRIMARY KEY,
  trader_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  asking_price_per_unit INTEGER NOT NULL CHECK (asking_price_per_unit >= 0),
  minimum_price_per_unit INTEGER CHECK (minimum_price_per_unit >= 0),
  available_until TEXT,
  pickup_area TEXT NOT NULL,
  pickup_notes TEXT,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'partially_matched', 'matched', 'sold', 'expired', 'withdrawn')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trader_id) REFERENCES participants(id) ON DELETE RESTRICT
);

CREATE TABLE demands (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT,
  requested_quantity INTEGER NOT NULL CHECK (requested_quantity > 0),
  unit TEXT NOT NULL,
  maximum_price_per_unit INTEGER CHECK (maximum_price_per_unit >= 0),
  needed_by TEXT NOT NULL,
  delivery_area TEXT NOT NULL,
  fulfilment_preference TEXT NOT NULL DEFAULT 'pickup'
    CHECK (fulfilment_preference IN ('pickup', 'delivery', 'either')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partially_matched', 'matched', 'fulfilled', 'expired', 'withdrawn')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (buyer_id) REFERENCES participants(id) ON DELETE RESTRICT
);

CREATE TABLE offers (
  id TEXT PRIMARY KEY,
  inventory_id TEXT NOT NULL,
  demand_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_per_unit INTEGER NOT NULL CHECK (price_per_unit >= 0),
  pickup_window TEXT NOT NULL,
  note TEXT,
  created_by TEXT NOT NULL CHECK (created_by IN ('agent', 'trader', 'facilitator')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'completed', 'cancelled', 'expired')),
  seller_approved_at TEXT,
  sent_at TEXT,
  buyer_responded_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE RESTRICT,
  FOREIGN KEY (demand_id) REFERENCES demands(id) ON DELETE RESTRICT
);

CREATE TABLE activity_events (
  id TEXT PRIMARY KEY,
  participant_id TEXT,
  offer_id TEXT,
  event_type TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE SET NULL,
  FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE SET NULL
);

CREATE INDEX idx_participants_role ON participants(role);
CREATE INDEX idx_inventory_status_item ON inventory(status, item_name);
CREATE INDEX idx_inventory_trader ON inventory(trader_id);
CREATE INDEX idx_demands_status_item ON demands(status, item_name);
CREATE INDEX idx_demands_buyer ON demands(buyer_id);
CREATE INDEX idx_offers_status ON offers(status);
CREATE INDEX idx_offers_inventory ON offers(inventory_id);
CREATE INDEX idx_offers_demand ON offers(demand_id);
CREATE INDEX idx_activity_offer_created ON activity_events(offer_id, created_at);
