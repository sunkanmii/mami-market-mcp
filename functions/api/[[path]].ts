interface Bindings extends Env {
  PILOT_ACCESS_CODE?: string;
}

type JsonRecord = Record<string, unknown>;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function apiError(status: number, message: string): Response {
  return json({ error: message }, status);
}

async function hasValidPilotCode(request: Request, env: Bindings): Promise<boolean> {
  const expected = env.PILOT_ACCESS_CODE;
  const received = request.headers.get("x-pilot-code");
  if (!expected || !received) return false;

  const encoder = new TextEncoder();
  const [expectedHash, receivedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
    crypto.subtle.digest("SHA-256", encoder.encode(received)),
  ]);
  const expectedBytes = new Uint8Array(expectedHash);
  const receivedBytes = new Uint8Array(receivedHash);
  let difference = expectedBytes.length ^ receivedBytes.length;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    difference |= expectedBytes[index] ^ (receivedBytes[index] ?? 0);
  }
  return difference === 0;
}

async function requirePilotCode(request: Request, env: Bindings): Promise<Response | null> {
  if (!env.PILOT_ACCESS_CODE) {
    return apiError(503, "Pilot writes are disabled until PILOT_ACCESS_CODE is configured.");
  }
  return (await hasValidPilotCode(request, env))
    ? null
    : apiError(401, "The pilot access code is missing or incorrect.");
}

async function readBody(request: Request): Promise<JsonRecord> {
  const text = await request.text();
  if (text.length > 12_000) throw new Error("Request body is too large.");
  if (!text) throw new Error("A JSON request body is required.");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The JSON request body must be an object.");
  }
  return value as JsonRecord;
}

function stringField(
  body: JsonRecord,
  key: string,
  options: { min?: number; max?: number; optional?: boolean } = {},
): string | null {
  const value = body[key];
  if ((value === undefined || value === null || value === "") && options.optional) return null;
  if (typeof value !== "string") throw new Error(`${key} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length < (options.min ?? 1)) throw new Error(`${key} is required.`);
  if (trimmed.length > (options.max ?? 160)) throw new Error(`${key} is too long.`);
  return trimmed;
}

function integerField(
  body: JsonRecord,
  key: string,
  options: { min?: number; max?: number; optional?: boolean } = {},
): number | null {
  const raw = body[key];
  if ((raw === undefined || raw === null || raw === "") && options.optional) return null;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${key} must be a whole number.`);
  if (value < (options.min ?? 0) || value > (options.max ?? Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${key} is outside the allowed range.`);
  }
  return value;
}

function enumField<T extends string>(body: JsonRecord, key: string, values: readonly T[]): T {
  const value = stringField(body, key);
  if (!values.includes(value as T)) throw new Error(`${key} is not valid.`);
  return value as T;
}

function normalizePhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) return `+234${digits.slice(1)}`;
  if (digits.length === 13 && digits.startsWith("234")) return `+${digits}`;
  if (value.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  throw new Error("Use a Nigerian mobile number or include the international country code.");
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function hashText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

interface ParticipantSession {
  id: string;
  role: "trader" | "buyer" | "facilitator";
}

async function authenticatedParticipant(
  request: Request,
  db: D1Database,
): Promise<ParticipantSession | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;
  const tokenHash = await hashText(token);
  return db.prepare(`
    SELECT p.id, p.role
    FROM pilot_access access
    JOIN participants p ON p.id = access.participant_id
    WHERE access.token_hash = ?
      AND access.revoked_at IS NULL
      AND access.expires_at > ?
  `).bind(tokenHash, new Date().toISOString()).first<ParticipantSession>();
}

async function participant(
  db: D1Database,
  id: string,
): Promise<{ id: string; role: "trader" | "buyer" | "facilitator" } | null> {
  return db
    .prepare("SELECT id, role FROM participants WHERE id = ?")
    .bind(id)
    .first<{ id: string; role: "trader" | "buyer" | "facilitator" }>();
}

async function getNetwork(db: D1Database): Promise<Response> {
  const [participantResult, inventoryResult, demandResult, offerResult, activityResult] =
    await db.batch([
      db.prepare(`
        SELECT id, role, display_name AS displayName, business_name AS businessName,
               market_name AS marketName, area, verification_status AS verificationStatus,
               consented_at AS consentedAt, created_at AS createdAt
        FROM participants
        ORDER BY created_at DESC
      `),
      db.prepare(`
        SELECT i.id, i.trader_id AS traderId, p.display_name AS traderName,
               p.business_name AS traderBusiness, p.verification_status AS verificationStatus,
               i.item_name AS itemName, i.quantity AS originalQuantity,
               i.remaining_quantity AS quantity, i.category, i.unit,
               i.asking_price_per_unit AS askingPricePerUnit,
               i.minimum_price_per_unit AS minimumPricePerUnit,
               i.available_until AS availableUntil, i.pickup_area AS pickupArea,
               i.pickup_notes AS pickupNotes, i.status, i.created_at AS createdAt
        FROM inventory i
        JOIN participants p ON p.id = i.trader_id
        ORDER BY i.created_at DESC
      `),
      db.prepare(`
        SELECT d.id, d.buyer_id AS buyerId, p.display_name AS buyerName,
               p.business_name AS buyerBusiness, p.verification_status AS verificationStatus,
               d.item_name AS itemName, d.requested_quantity AS originalRequestedQuantity,
               d.remaining_quantity AS requestedQuantity, d.category,
               d.unit, d.maximum_price_per_unit AS maximumPricePerUnit,
               d.needed_by AS neededBy, d.delivery_area AS deliveryArea,
               d.fulfilment_preference AS fulfilmentPreference, d.status,
               d.created_at AS createdAt
        FROM demands d
        JOIN participants p ON p.id = d.buyer_id
        ORDER BY d.created_at DESC
      `),
      db.prepare(`
        SELECT o.id, o.inventory_id AS inventoryId, o.demand_id AS demandId,
               o.quantity, o.price_per_unit AS pricePerUnit, o.pickup_window AS pickupWindow,
               o.note, o.created_by AS createdBy, o.status,
               o.seller_approved_at AS sellerApprovedAt, o.sent_at AS sentAt,
               o.buyer_responded_at AS buyerRespondedAt, o.completed_at AS completedAt,
               o.created_at AS createdAt, i.item_name AS itemName, i.unit,
               seller.id AS traderId, seller.display_name AS traderName,
               buyer.id AS buyerId, buyer.display_name AS buyerName
        FROM offers o
        JOIN inventory i ON i.id = o.inventory_id
        JOIN demands d ON d.id = o.demand_id
        JOIN participants seller ON seller.id = i.trader_id
        JOIN participants buyer ON buyer.id = d.buyer_id
        ORDER BY o.created_at DESC
      `),
      db.prepare(`
        SELECT id, participant_id AS participantId, offer_id AS offerId,
               event_type AS eventType, detail, created_at AS createdAt
        FROM activity_events
        ORDER BY created_at DESC
        LIMIT 30
      `),
    ]);

  return json({
    source: "cloudflare-d1",
    participants: participantResult.results,
    inventory: inventoryResult.results,
    demands: demandResult.results,
    offers: offerResult.results,
    activities: activityResult.results,
  });
}

async function getMatches(db: D1Database, request: Request): Promise<Response> {
  const inventoryId = new URL(request.url).searchParams.get("inventoryId")?.trim();
  if (!inventoryId) return apiError(400, "inventoryId is required.");

  const result = await db
    .prepare(`
      SELECT d.id AS demandId, d.buyer_id AS buyerId, p.display_name AS buyerName,
             p.business_name AS buyerBusiness, p.market_name AS marketName,
             p.area AS buyerArea, p.verification_status AS verificationStatus,
             d.remaining_quantity - COALESCE((
               SELECT SUM(o.quantity) FROM offers o
               WHERE o.demand_id = d.id AND o.status = 'accepted'
             ), 0) AS requestedQuantity,
             d.unit,
             d.maximum_price_per_unit AS maximumPricePerUnit,
             d.needed_by AS neededBy, d.delivery_area AS deliveryArea,
             d.fulfilment_preference AS fulfilmentPreference,
             i.id AS inventoryId,
             i.remaining_quantity - COALESCE((
               SELECT SUM(o.quantity) FROM offers o
               WHERE o.inventory_id = i.id AND o.status = 'accepted'
             ), 0) AS availableQuantity,
             i.asking_price_per_unit AS askingPricePerUnit,
             i.minimum_price_per_unit AS minimumPricePerUnit,
             i.pickup_area AS pickupArea,
             CASE WHEN lower(trim(d.delivery_area)) = lower(trim(i.pickup_area))
                  THEN 'Same-area demand with compatible item, unit and price.'
                  ELSE 'Compatible item, unit and price; confirm transport between areas.'
             END AS matchReason
      FROM inventory i
      JOIN demands d
        ON lower(trim(d.item_name)) = lower(trim(i.item_name))
       AND lower(trim(d.unit)) = lower(trim(i.unit))
      JOIN participants p ON p.id = d.buyer_id
      WHERE i.id = ?
        AND i.status IN ('available', 'partially_matched')
        AND d.status IN ('open', 'partially_matched')
        AND i.remaining_quantity - COALESCE((
              SELECT SUM(o.quantity) FROM offers o
              WHERE o.inventory_id = i.id AND o.status = 'accepted'
            ), 0) > 0
        AND d.remaining_quantity - COALESCE((
              SELECT SUM(o.quantity) FROM offers o
              WHERE o.demand_id = d.id AND o.status = 'accepted'
            ), 0) > 0
        AND (d.maximum_price_per_unit IS NULL
             OR d.maximum_price_per_unit >= COALESCE(i.minimum_price_per_unit, 0))
      ORDER BY
        CASE WHEN lower(trim(d.delivery_area)) = lower(trim(i.pickup_area)) THEN 0 ELSE 1 END,
        d.needed_by ASC,
        d.created_at ASC
    `)
    .bind(inventoryId)
    .all();

  return json({ matches: result.results });
}

async function createParticipant(db: D1Database, body: JsonRecord): Promise<Response> {
  const role = enumField(body, "role", ["trader", "buyer", "facilitator"] as const);
  const displayName = stringField(body, "displayName", { max: 60 })!;
  const businessName = stringField(body, "businessName", { max: 80, optional: true });
  const marketName = stringField(body, "marketName", { max: 80, optional: true });
  const area = stringField(body, "area", { max: 80 })!;
  const phoneNumber = normalizePhoneNumber(stringField(body, "phoneNumber", { min: 7, max: 25 })!);
  const preferredContactMethod = enumField(body, "preferredContactMethod", [
    "call", "whatsapp", "either",
  ] as const);
  const meetupLocation = stringField(body, "meetupLocation", { min: 3, max: 140 })!;
  if (body.consent !== true) throw new Error("Consent is required for the pilot.");
  if (body.contactSharingConsent !== true) {
    throw new Error("Consent is required before contact details can be shared after a match.");
  }

  const id = newId(role);
  const consentedAt = new Date().toISOString();
  const sessionToken = `${newId("pilot-session")}-${crypto.randomUUID()}`;
  const tokenHash = await hashText(sessionToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.batch([
    db.prepare(`
      INSERT INTO participants
        (id, role, display_name, business_name, market_name, area, phone_number,
         preferred_contact_method, meetup_location, consented_at, contact_sharing_consented_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, role, displayName, businessName, marketName, area, phoneNumber,
      preferredContactMethod, meetupLocation, consentedAt, consentedAt,
    ),
    db.prepare(`
      INSERT INTO pilot_access (id, participant_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(newId("access"), id, tokenHash, expiresAt),
  ]);

  return json({
    participant: { id, role, displayName, businessName, marketName, area, consentedAt },
    sessionToken,
  }, 201);
}

async function createInventory(
  db: D1Database,
  body: JsonRecord,
  actor: ParticipantSession,
): Promise<Response> {
  const traderId = stringField(body, "traderId", { max: 80 })!;
  if (traderId !== actor.id) return apiError(403, "This session cannot post stock for another participant.");
  const owner = await participant(db, traderId);
  if (!owner || (owner.role !== "trader" && owner.role !== "facilitator")) {
    return apiError(403, "A valid trader profile is required.");
  }

  const id = newId("stock");
  const itemName = stringField(body, "itemName", { max: 80 })!;
  const category = stringField(body, "category", { max: 40, optional: true });
  const quantity = integerField(body, "quantity", { min: 1, max: 100_000 })!;
  const unit = stringField(body, "unit", { max: 30 })!;
  const askingPrice = integerField(body, "askingPricePerUnit", { min: 0, max: 1_000_000_000 })!;
  const minimumPrice = integerField(body, "minimumPricePerUnit", {
    min: 0,
    max: askingPrice,
    optional: true,
  });
  const availableUntil = stringField(body, "availableUntil", { max: 40, optional: true });
  const pickupArea = stringField(body, "pickupArea", { max: 80 })!;
  const pickupNotes = stringField(body, "pickupNotes", { max: 180, optional: true });

  await db.batch([
    db.prepare(`
      INSERT INTO inventory
        (id, trader_id, item_name, category, quantity, remaining_quantity, unit, asking_price_per_unit,
         minimum_price_per_unit, available_until, pickup_area, pickup_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, traderId, itemName, category, quantity, quantity, unit, askingPrice,
      minimumPrice, availableUntil, pickupArea, pickupNotes,
    ),
    db.prepare(`
      INSERT INTO activity_events (id, participant_id, event_type, detail)
      VALUES (?, ?, 'inventory_added', ?)
    `).bind(newId("event"), traderId, `${quantity} ${unit} of ${itemName} added to the pilot network.`),
  ]);

  return json({ inventory: { id, traderId, itemName, quantity, unit } }, 201);
}

async function createDemand(
  db: D1Database,
  body: JsonRecord,
  actor: ParticipantSession,
): Promise<Response> {
  const buyerId = stringField(body, "buyerId", { max: 80 })!;
  if (buyerId !== actor.id) return apiError(403, "This session cannot post demand for another participant.");
  const owner = await participant(db, buyerId);
  if (!owner || (owner.role !== "buyer" && owner.role !== "facilitator")) {
    return apiError(403, "A valid buyer profile is required.");
  }

  const id = newId("demand");
  const itemName = stringField(body, "itemName", { max: 80 })!;
  const category = stringField(body, "category", { max: 40, optional: true });
  const requestedQuantity = integerField(body, "requestedQuantity", { min: 1, max: 100_000 })!;
  const unit = stringField(body, "unit", { max: 30 })!;
  const maximumPrice = integerField(body, "maximumPricePerUnit", {
    min: 0,
    max: 1_000_000_000,
    optional: true,
  });
  const neededBy = stringField(body, "neededBy", { max: 40 })!;
  const deliveryArea = stringField(body, "deliveryArea", { max: 80 })!;
  const fulfilmentPreference = enumField(body, "fulfilmentPreference", [
    "pickup", "delivery", "either",
  ] as const);

  await db.batch([
    db.prepare(`
      INSERT INTO demands
        (id, buyer_id, item_name, category, requested_quantity, remaining_quantity, unit,
         maximum_price_per_unit, needed_by, delivery_area, fulfilment_preference)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, buyerId, itemName, category, requestedQuantity, requestedQuantity, unit,
      maximumPrice, neededBy, deliveryArea, fulfilmentPreference,
    ),
    db.prepare(`
      INSERT INTO activity_events (id, participant_id, event_type, detail)
      VALUES (?, ?, 'demand_added', ?)
    `).bind(newId("event"), buyerId, `Request for ${requestedQuantity} ${unit} of ${itemName} added.`),
  ]);

  return json({ demand: { id, buyerId, itemName, requestedQuantity, unit } }, 201);
}

interface OfferCandidate {
  inventoryId: string;
  demandId: string;
  traderId: string;
  buyerId: string;
  itemName: string;
  inventoryUnit: string;
  inventoryQuantity: number;
  requestedQuantity: number;
  askingPrice: number;
  minimumPrice: number | null;
  maximumPrice: number | null;
}

async function createOffer(
  db: D1Database,
  body: JsonRecord,
  actor: ParticipantSession,
): Promise<Response> {
  const inventoryId = stringField(body, "inventoryId", { max: 80 })!;
  const demandId = stringField(body, "demandId", { max: 80 })!;
  const actorId = stringField(body, "actorId", { max: 80 })!;
  if (actorId !== actor.id) return apiError(403, "This session cannot prepare an offer for another participant.");
  const candidate = await db.prepare(`
    SELECT i.id AS inventoryId, d.id AS demandId, i.trader_id AS traderId,
           d.buyer_id AS buyerId, i.item_name AS itemName, i.unit AS inventoryUnit,
           i.remaining_quantity - COALESCE((
             SELECT SUM(existing.quantity) FROM offers existing
             WHERE existing.inventory_id = i.id AND existing.status = 'accepted'
           ), 0) AS inventoryQuantity,
           d.remaining_quantity - COALESCE((
             SELECT SUM(existing.quantity) FROM offers existing
             WHERE existing.demand_id = d.id AND existing.status = 'accepted'
           ), 0) AS requestedQuantity,
           i.asking_price_per_unit AS askingPrice,
           i.minimum_price_per_unit AS minimumPrice,
           d.maximum_price_per_unit AS maximumPrice
    FROM inventory i
    JOIN demands d ON d.id = ?
    WHERE i.id = ?
      AND i.status IN ('available', 'partially_matched')
      AND d.status IN ('open', 'partially_matched')
      AND lower(trim(i.item_name)) = lower(trim(d.item_name))
      AND lower(trim(i.unit)) = lower(trim(d.unit))
  `).bind(demandId, inventoryId).first<OfferCandidate>();

  if (!candidate) return apiError(409, "These inventory and demand records are not compatible.");
  if (candidate.traderId !== actorId) return apiError(403, "Only the stock owner can prepare this offer.");

  const quantity = integerField(body, "quantity", {
    min: 1,
    max: Math.min(candidate.inventoryQuantity, candidate.requestedQuantity),
  })!;
  const pricePerUnit = integerField(body, "pricePerUnit", { min: 0, max: 1_000_000_000 })!;
  if (candidate.minimumPrice !== null && pricePerUnit < candidate.minimumPrice) {
    return apiError(409, "The offer is below the trader's minimum price.");
  }
  if (candidate.maximumPrice !== null && pricePerUnit > candidate.maximumPrice) {
    return apiError(409, "The offer is above the buyer's maximum price.");
  }
  const pickupWindow = stringField(body, "pickupWindow", { max: 100 })!;
  const note = stringField(body, "note", { max: 180, optional: true });
  const createdBy = enumField(body, "createdBy", ["agent", "trader", "facilitator"] as const);
  const id = newId("offer");

  await db.batch([
    db.prepare(`
      INSERT INTO offers
        (id, inventory_id, demand_id, quantity, price_per_unit, pickup_window,
         note, created_by, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `).bind(id, inventoryId, demandId, quantity, pricePerUnit, pickupWindow, note, createdBy),
    db.prepare(`
      INSERT INTO activity_events (id, participant_id, offer_id, event_type, detail)
      VALUES (?, ?, ?, 'offer_drafted', ?)
    `).bind(newId("event"), actorId, id, `${quantity} ${candidate.inventoryUnit} of ${candidate.itemName}; waiting for trader approval.`),
  ]);

  return json({ offer: { id, inventoryId, demandId, quantity, pricePerUnit, status: "draft" } }, 201);
}

interface OfferOwnership {
  id: string;
  status: string;
  traderId: string;
  buyerId: string;
  inventoryId: string;
  demandId: string;
  quantity: number;
  itemName: string;
  unit: string;
}

async function updateOfferStatus(
  db: D1Database,
  offerId: string,
  body: JsonRecord,
  actor: ParticipantSession,
): Promise<Response> {
  const nextStatus = enumField(body, "status", [
    "sent", "accepted", "declined", "completed", "cancelled",
  ] as const);
  const actorId = stringField(body, "actorId", { max: 80 })!;
  if (actorId !== actor.id) return apiError(403, "This session cannot act for another participant.");
  const offer = await db.prepare(`
    SELECT o.id, o.status, i.trader_id AS traderId, d.buyer_id AS buyerId,
           o.inventory_id AS inventoryId, o.demand_id AS demandId,
           o.quantity, i.item_name AS itemName, i.unit
    FROM offers o
    JOIN inventory i ON i.id = o.inventory_id
    JOIN demands d ON d.id = o.demand_id
    WHERE o.id = ?
  `).bind(offerId).first<OfferOwnership>();
  if (!offer) return apiError(404, "Offer not found.");

  const allowed: Record<string, readonly string[]> = {
    draft: ["sent", "cancelled"],
    sent: ["accepted", "declined", "cancelled"],
    accepted: ["completed", "cancelled"],
  };
  if (!allowed[offer.status]?.includes(nextStatus)) {
    return apiError(409, `An offer cannot move from ${offer.status} to ${nextStatus}.`);
  }
  if ((nextStatus === "sent" || nextStatus === "cancelled") && actorId !== offer.traderId) {
    return apiError(403, "Only the trader can perform that action.");
  }
  if ((nextStatus === "accepted" || nextStatus === "declined") && actorId !== offer.buyerId) {
    return apiError(403, "Only the matched buyer can respond to this offer.");
  }

  if (nextStatus === "accepted") {
    const capacity = await db.prepare(`
      SELECT
        i.remaining_quantity - COALESCE((
          SELECT SUM(existing.quantity) FROM offers existing
          WHERE existing.inventory_id = i.id
            AND existing.status = 'accepted'
            AND existing.id != ?
        ), 0) AS inventoryAvailable,
        d.remaining_quantity - COALESCE((
          SELECT SUM(existing.quantity) FROM offers existing
          WHERE existing.demand_id = d.id
            AND existing.status = 'accepted'
            AND existing.id != ?
        ), 0) AS demandAvailable
      FROM inventory i
      JOIN demands d ON d.id = ?
      WHERE i.id = ?
    `).bind(offerId, offerId, offer.demandId, offer.inventoryId)
      .first<{ inventoryAvailable: number; demandAvailable: number }>();
    if (!capacity || offer.quantity > capacity.inventoryAvailable || offer.quantity > capacity.demandAvailable) {
      return apiError(409, "This quantity is no longer available. Refresh and prepare a smaller offer.");
    }
  }
  if (nextStatus === "completed" && actorId !== offer.traderId && actorId !== offer.buyerId) {
    return apiError(403, "Only a participant in this offer can complete it.");
  }

  const now = new Date().toISOString();
  const timestampColumn =
    nextStatus === "sent"
      ? "seller_approved_at = ?, sent_at = ?,"
      : nextStatus === "accepted" || nextStatus === "declined"
        ? "buyer_responded_at = ?,"
        : nextStatus === "completed"
          ? "completed_at = ?,"
          : "";
  const timestampValues = nextStatus === "sent" ? [now, now] : timestampColumn ? [now] : [];
  const statements = [
    db.prepare(`UPDATE offers SET ${timestampColumn} status = ?, updated_at = ? WHERE id = ?`)
      .bind(...timestampValues, nextStatus, now, offerId),
    db.prepare(`
      INSERT INTO activity_events (id, participant_id, offer_id, event_type, detail)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      newId("event"), actorId, offerId, `offer_${nextStatus}`,
      `${offer.quantity} ${offer.unit} of ${offer.itemName}: offer ${nextStatus}.`,
    ),
  ];

  if (nextStatus === "accepted") {
    statements.push(
      db.prepare("UPDATE inventory SET status = 'partially_matched', updated_at = ? WHERE id = ?")
        .bind(now, offer.inventoryId),
      db.prepare("UPDATE demands SET status = 'partially_matched', updated_at = ? WHERE id = ?")
        .bind(now, offer.demandId),
    );
  }
  if (nextStatus === "completed") {
    statements.push(
      db.prepare(`
        UPDATE inventory
        SET remaining_quantity = remaining_quantity - ?,
            status = CASE WHEN remaining_quantity - ? <= 0 THEN 'sold' ELSE 'available' END,
            updated_at = ?
        WHERE id = ? AND remaining_quantity >= ?
      `).bind(offer.quantity, offer.quantity, now, offer.inventoryId, offer.quantity),
      db.prepare(`
        UPDATE demands
        SET remaining_quantity = remaining_quantity - ?,
            status = CASE WHEN remaining_quantity - ? <= 0 THEN 'fulfilled' ELSE 'open' END,
            updated_at = ?
        WHERE id = ? AND remaining_quantity >= ?
      `).bind(offer.quantity, offer.quantity, now, offer.demandId, offer.quantity),
    );
  }
  await db.batch(statements);
  return json({ offer: { id: offerId, status: nextStatus, updatedAt: now } });
}

interface OfferContactRow {
  status: string;
  traderId: string;
  traderName: string;
  traderBusiness: string | null;
  traderPhone: string | null;
  traderContactMethod: "call" | "whatsapp" | "either" | null;
  traderMeetupLocation: string | null;
  buyerId: string;
  buyerName: string;
  buyerBusiness: string | null;
  buyerPhone: string | null;
  buyerContactMethod: "call" | "whatsapp" | "either" | null;
  pickupArea: string;
}

async function getOfferContact(
  db: D1Database,
  offerId: string,
  actor: ParticipantSession,
): Promise<Response> {
  const offer = await db.prepare(`
    SELECT o.status,
           seller.id AS traderId, seller.display_name AS traderName,
           seller.business_name AS traderBusiness, seller.phone_number AS traderPhone,
           seller.preferred_contact_method AS traderContactMethod,
           seller.meetup_location AS traderMeetupLocation,
           buyer.id AS buyerId, buyer.display_name AS buyerName,
           buyer.business_name AS buyerBusiness, buyer.phone_number AS buyerPhone,
           buyer.preferred_contact_method AS buyerContactMethod,
           i.pickup_area AS pickupArea
    FROM offers o
    JOIN inventory i ON i.id = o.inventory_id
    JOIN demands d ON d.id = o.demand_id
    JOIN participants seller ON seller.id = i.trader_id
    JOIN participants buyer ON buyer.id = d.buyer_id
    WHERE o.id = ?
  `).bind(offerId).first<OfferContactRow>();

  if (!offer) return apiError(404, "Offer not found.");
  if (actor.id !== offer.traderId && actor.id !== offer.buyerId) {
    return apiError(403, "Only the matched trader and buyer can view these contact details.");
  }
  if (offer.status !== "accepted" && offer.status !== "completed") {
    return apiError(409, "Contact details are revealed only after the buyer accepts the offer.");
  }

  const counterpart = actor.id === offer.traderId
    ? {
        displayName: offer.buyerName,
        businessName: offer.buyerBusiness,
        phoneNumber: offer.buyerPhone,
        preferredContactMethod: offer.buyerContactMethod,
      }
    : {
        displayName: offer.traderName,
        businessName: offer.traderBusiness,
        phoneNumber: offer.traderPhone,
        preferredContactMethod: offer.traderContactMethod,
      };
  if (!counterpart.phoneNumber) {
    return apiError(409, "The matched participant has not added a phone number yet.");
  }
  if (!offer.traderMeetupLocation) {
    return apiError(409, "The trader has not added a meetup location yet.");
  }

  return json({
    offerId,
    contact: {
      ...counterpart,
      preferredContactMethod: counterpart.preferredContactMethod ?? "call",
    },
    pickup: {
      area: offer.pickupArea,
      meetupLocation: offer.traderMeetupLocation,
    },
  });
}

export const onRequest: PagesFunction<Bindings, "path"> = async (context) => {
  const { request, env } = context;
  const path = new URL(request.url).pathname.replace(/^\/api\/?/, "");

  try {
    if (request.method === "GET" && path === "health") {
      const result = await env.trader_network_db.prepare("SELECT 1 AS ok").first<{ ok: number }>();
      return json({ ok: result?.ok === 1, database: "cloudflare-d1" });
    }
    if (request.method === "GET" && (path === "network" || path === "")) {
      return getNetwork(env.trader_network_db);
    }
    if (request.method === "GET" && path === "matches") {
      return getMatches(env.trader_network_db, request);
    }

    const contactMatch = path.match(/^offers\/([^/]+)\/contact$/);
    if (request.method === "GET" && contactMatch) {
      const unauthorized = await requirePilotCode(request, env);
      if (unauthorized) return unauthorized;
      const actor = await authenticatedParticipant(request, env.trader_network_db);
      if (!actor) return apiError(401, "This participant session is missing or expired.");
      return getOfferContact(
        env.trader_network_db,
        decodeURIComponent(contactMatch[1]),
        actor,
      );
    }

    if (["POST", "PATCH", "DELETE"].includes(request.method)) {
      const unauthorized = await requirePilotCode(request, env);
      if (unauthorized) return unauthorized;
    }

    if (request.method === "POST" && path === "participants") {
      return createParticipant(env.trader_network_db, await readBody(request));
    }
    const statusMatch = path.match(/^offers\/([^/]+)\/status$/);
    const participantWrite =
      (request.method === "POST" && ["inventory", "demands", "offers"].includes(path))
      || (request.method === "PATCH" && Boolean(statusMatch));
    if (participantWrite) {
      const actor = await authenticatedParticipant(request, env.trader_network_db);
      if (!actor) return apiError(401, "This participant session is missing or expired. Join the pilot again on this device.");
      if (request.method === "POST" && path === "inventory") {
        return createInventory(env.trader_network_db, await readBody(request), actor);
      }
      if (request.method === "POST" && path === "demands") {
        return createDemand(env.trader_network_db, await readBody(request), actor);
      }
      if (request.method === "POST" && path === "offers") {
        return createOffer(env.trader_network_db, await readBody(request), actor);
      }
      if (request.method === "PATCH" && statusMatch) {
        return updateOfferStatus(
          env.trader_network_db,
          decodeURIComponent(statusMatch[1]),
          await readBody(request),
          actor,
        );
      }
    }

    return apiError(404, "API route not found.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected API error.";
    const status = error instanceof SyntaxError ? 400 : 422;
    return apiError(status, message);
  }
};
