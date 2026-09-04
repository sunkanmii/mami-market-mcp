import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { onRequest } from '../functions/api/[[path]].ts';

// In-memory SQLite executes the real API SQL. Never touches local or remote D1.
let sql;
class Statement {
  constructor(query, args = []) { this.query = query; this.args = args; }
  bind(...args) { return new Statement(this.query, args); }
  async first() { return sql.prepare(this.query).get(...this.args) ?? null; }
  async all() { return { results: sql.prepare(this.query).all(...this.args) }; }
  runSync() {
    const results = sql.prepare(this.query).all(...this.args);
    return { results, meta: { changes: sql.prepare('SELECT changes() AS n').get().n } };
  }
}
const db = {
  prepare(query) { return new Statement(query); },
  async batch(statements) {
    sql.exec('BEGIN');
    try { const results = statements.map((s) => s.runSync()); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};
const future = () => new Date(Date.now() + 86400000).toISOString();
beforeEach(() => {
  sql = new DatabaseSync(':memory:');
  for (const file of ['0001_initial_pilot_schema.sql', '0002_track_remaining_quantities.sql', '0003_private_contact_handoff.sql']) sql.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  for (const [id, role] of [['seller', 'trader'], ['buyer', 'buyer'], ['buyer2', 'buyer']]) {
    sql.prepare('INSERT INTO participants(id,role,display_name,area,consented_at) VALUES(?,?,?,?,?)').run(id,role,id,'Ketu',future());
    sql.prepare('INSERT INTO pilot_access(id,participant_id,token_hash,expires_at) VALUES(?,?,?,?)').run(id,id,createHash('sha256').update(id).digest('hex'),future());
  }
  sql.prepare("INSERT INTO inventory(id,trader_id,item_name,quantity,remaining_quantity,unit,asking_price_per_unit,pickup_area,available_until) VALUES('stock','seller','Tomatoes',10,10,'crates',100,'Ketu',?)").run(future());
  for (const [id,buyer] of [['demand','buyer'],['demand2','buyer2']]) sql.prepare("INSERT INTO demands(id,buyer_id,item_name,requested_quantity,remaining_quantity,unit,needed_by,delivery_area) VALUES(?,?,'Tomatoes',10,10,'crates',?,'Ketu')").run(id,buyer,future());
});
afterEach(() => sql.close());
function offer(id, demand = 'demand', quantity = 6, status = 'sent') {
  sql.prepare("INSERT INTO offers(id,inventory_id,demand_id,quantity,price_per_unit,pickup_window,created_by,status) VALUES(?,'stock',?,?,100,'Tomorrow','trader',?)").run(id,demand,quantity,status);
}
async function request(path, actor = 'seller', body, method = 'POST') {
  return onRequest({ request: new Request(`https://test.invalid/api/${path}`, { method: body ? method : 'GET', headers: { 'x-pilot-code': 'test-only', authorization: `Bearer ${actor}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env: { trader_network_db: db, PILOT_ACCESS_CODE: 'test-only' } });
}
const status = (id, actor, value) => request(`offers/${id}/status`, actor, { actorId: actor, status: value }, 'PATCH');
test('matching and drafting exclude expired demand and stock', async () => {
  sql.exec("UPDATE demands SET needed_by = '2020-01-01T00:00:00Z'");
  assert.equal((await (await request('matches?inventoryId=stock')).json()).matches.length, 0);
  assert.equal((await request('offers','seller',{inventoryId:'stock', demandId:'demand',actorId:'seller',quantity:1,pricePerUnit:100,pickupWindow:'Tomorrow',createdBy:'agent'})).status,409);
  sql.prepare('UPDATE demands SET needed_by = ?').run(future());
  sql.exec("UPDATE inventory SET available_until = '2020-01-01T00:00:00Z'");
  assert.equal((await (await request('matches?inventoryId=stock')).json()).matches.length,0);
});
test('competing acceptances cannot over-reserve one stock line', async () => {
  offer('a'); offer('b','demand2');
  const responses = await Promise.all([status('a','buyer','accepted'),status('b','buyer2','accepted')]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  assert.equal(sql.prepare("SELECT SUM(quantity) AS n FROM offers WHERE status='accepted'").get().n,6);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM activity_events WHERE event_type='offer_accepted'").get().n,1);
});
test('competing acceptances cannot over-reserve one buyer request', async () => {
  sql.exec('UPDATE inventory SET remaining_quantity=20');
  offer('a'); offer('b');
  const responses = await Promise.all([status('a','buyer','accepted'),status('b','buyer','accepted')]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
});
test('simultaneous completion decrements inventory and demand exactly once', async () => {
  offer('a','demand',6,'accepted');
  const responses = await Promise.all([status('a','buyer','completed'),status('a','seller','completed')]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  assert.equal(sql.prepare("SELECT remaining_quantity AS n FROM inventory WHERE id='stock'").get().n,4);
  assert.equal(sql.prepare("SELECT remaining_quantity AS n FROM demands WHERE id='demand'").get().n,4);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM activity_events WHERE event_type='offer_completed'").get().n,1);
  assert.equal((await status('a','buyer','completed')).status,409);
});
test('competing cancellation and completion have only one effect', async () => {
  offer('a','demand',6,'accepted');
  const responses = await Promise.all([status('a','seller','cancelled'),status('a','buyer','completed')]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const completed = sql.prepare("SELECT status FROM offers WHERE id='a'").get().status === 'completed';
  assert.equal(sql.prepare("SELECT remaining_quantity AS n FROM inventory WHERE id='stock'").get().n,completed?4:10);
});
test('expired stock cannot be sent or accepted; authorised cancellation still works', async () => {
  offer('draft','demand',2,'draft'); offer('sent','demand',2,'sent');
  sql.exec("UPDATE inventory SET available_until='2020-01-01T00:00:00Z'");
  assert.equal((await status('draft','seller','sent')).status,409);
  assert.equal((await status('sent','buyer','accepted')).status,409);
  assert.equal((await status('sent','seller','cancelled')).status,200);
});
test('server rejects a past request deadline', async () => {
  const response = await request('demands','buyer',{buyerId:'buyer',itemName:'Tomatoes',requestedQuantity:1,unit:'crates',neededBy:'2020-01-01T00:00:00Z',deliveryArea:'Ketu',fulfilmentPreference:'pickup'});
  assert.equal(response.status,422);
});
test('a third party cannot complete or read contact details', async () => {
  offer('a','demand',6,'accepted');
  assert.equal((await status('a','buyer2','completed')).status,403);
  assert.equal((await request('offers/a/contact','buyer2')).status,403);
});
