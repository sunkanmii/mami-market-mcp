import { buyerAgent, matchStock, purchaseUnits, validatePurchaseRequest, type PurchaseRequest } from "./buyer-agent";
import { pilotApi } from "./pilot-api";

const result = (message: string, data: unknown) => ({ content: [{ type: "text" as const, text: message }], structuredContent: data });
function buyer() {
  const profile = pilotApi.loadProfile();
  if (profile?.role !== "buyer") throw new Error("This tool requires a live buyer profile. Join the pilot as a buyer on this device. No illustrative records will be returned.");
  return profile;
}
async function buyerSnapshot() {
  const profile = buyer();
  const snapshot = await pilotApi.getNetwork();
  if (buyer().id !== profile.id) throw new Error("Participant changed. Run the tool again for the current buyer.");
  return { profile, snapshot };
}
function showBuyer() {
  window.requestAnimationFrame(() => document.getElementById("buyer-agent-workspace")?.scrollIntoView({ block: "start", behavior: "auto" }));
}
const properties = {
  itemName: { type: "string", maxLength: 80, description: "Exact product name; use the trader's spelling when known." },
  category: { type: "string", maxLength: 40 },
  requestedQuantity: { type: "integer", minimum: 1, maximum: 100000 },
  unit: { type: "string", enum: [...purchaseUnits], description: "Must match the stock unit; never assume unit conversions." },
  maximumPricePerUnit: { type: ["integer", "null"], minimum: 0, maximum: 1000000000, description: "Maximum naira per unit, or null for an open budget." },
  neededBy: { type: "string", description: "Future ISO 8601 date including timezone; Nigeria is +01:00." },
  deliveryArea: { type: "string", maxLength: 80, description: "Broad collection area, not a private address." },
  fulfilmentPreference: { type: "string", enum: ["pickup", "delivery", "either"] },
};
export function buyerTools(): WebMCP.ModelContextTool[] {
  return [
    {
      name: "get_trade_context", title: "Check current trading role",
      description: "Read the current device role before choosing tools. Buyer tools require a buyer; seller tools require a trader. Without a profile, only the seller illustrative sandbox is available.",
      inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true },
      async execute() {
        const profile = pilotApi.loadProfile();
        return result("Current trading context.", { role: profile?.role ?? "illustrative-demo", participantId: profile?.id ?? null, currentTime: new Date().toISOString(), timeZone: "Africa/Lagos", hasPilotCode: pilotApi.hasCode(), humanApprovalRequired: true });
      },
    },
    {
      name: "get_my_requests", title: "Read my buyer requests",
      description: "Buyer only. Read this buyer's live requests and any unpublished in-page draft. Does not return another buyer's requests.",
      inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true },
      async execute() {
        const { profile, snapshot } = await buyerSnapshot();
        const draft = buyerAgent.getState().draft;
        return result("Your live buyer requests and unpublished draft.", { source: "cloudflare-d1", requests: snapshot.demands.filter((request) => request.buyerId === profile.id), unpublishedDraft: draft?.buyerId === profile.id ? draft : null });
      },
    },
    {
      name: "find_stock_for_request", title: "Find stock for a buyer request",
      description: "Buyer only. Use demandId from get_my_requests, or supply all request fields to search before publishing. Shows real matching stock in the buyer workspace. Exact product and unit matching; subtracts accepted reservations. Area labels are not distances. Delivery, packaging and pickup time require confirmation; below-asking prices require negotiation. Never reserves or purchases.",
      inputSchema: { type: "object", properties: { demandId: { type: "string", description: "An existing request belonging to this buyer." }, ...properties } },
      async execute(input) {
        const { profile, snapshot } = await buyerSnapshot();
        const values = input as unknown as PurchaseRequest & { demandId?: string };
        const request = values.demandId ? snapshot.demands.find((entry) => entry.id === values.demandId && entry.buyerId === profile.id) : values;
        if (!request) throw new Error("That request does not belong to the current buyer.");
        if ("status" in request && !["open", "partially_matched"].includes(String(request.status))) throw new Error("This request is no longer open.");
        const query = validatePurchaseRequest({ ...request, category: request.category ?? undefined });
        if (values.demandId) {
          const reserved = snapshot.offers.filter((offer) => offer.demandId === values.demandId && offer.status === "accepted").reduce((sum, offer) => sum + offer.quantity, 0);
          query.requestedQuantity = Math.max(0, query.requestedQuantity - reserved);
        }
        const items = query.requestedQuantity > 0 ? matchStock(snapshot, query) : [];
        buyerAgent.showSearch(profile.id, query, items);
        showBuyer();
        return result(`Found ${items.length} matching live stock listings. Confirm packaging, pickup time and transport with the trader; no stock has been reserved.`, { source: "cloudflare-d1", items });
      },
    },
    {
      name: "review_incoming_offers", title: "Review offers sent to me",
      description: "Buyer only. Read offers actually sent to this buyer, with totals and request budget. Excludes unsent trader drafts and other buyers' offers. Explain the terms; acceptance or decline remains a human action in the page. Does not reveal private contact details.",
      inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true },
      async execute() {
        const { profile, snapshot } = await buyerSnapshot();
        const offers = snapshot.offers.filter((offer) => offer.buyerId === profile.id && offer.status !== "draft").map((offer) => ({ ...offer, totalPrice: offer.quantity * offer.pricePerUnit, requestMaximumPricePerUnit: snapshot.demands.find((entry) => entry.id === offer.demandId)?.maximumPricePerUnit ?? null, requiresHumanAcceptance: offer.status === "sent" }));
        return result(`Found ${offers.length} offers for this buyer. Review them in Offers to review; only the buyer can accept or decline.`, { source: "cloudflare-d1", offers });
      },
    },
    {
      name: "draft_purchase_request", title: "Prepare a buyer request for approval",
      description: "Buyer only. Prepare an editable, unpublished request draft in the visible page. Does not call the backend, publish, buy, reserve, or accept. Ask the buyer to review and press Approve and publish request. Cannot replace an existing draft; the buyer must discard it first. Drafts are lost on page reload.",
      inputSchema: { type: "object", properties, required: ["itemName", "requestedQuantity", "unit", "maximumPricePerUnit", "neededBy", "deliveryArea", "fulfilmentPreference"] },
      async execute(input) {
        const profile = buyer();
        const draft = buyerAgent.prepare(profile.id, input as unknown as PurchaseRequest);
        showBuyer();
        return result("Request drafted in the page, not published. The buyer must review and approve it.", { source: "unpublished-local-draft", draft, requiresHumanApproval: true });
      },
    },
  ];
}
