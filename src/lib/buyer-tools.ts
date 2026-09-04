import { buyerAgent, matchStock, purchaseUnits, validatePurchaseRequest, type PurchaseRequest } from "./buyer-agent";
import { pilotApi } from "./pilot-api";
import { marketStore } from "./store";

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
function sandboxBuyer() {
  if (pilotApi.loadProfile()) return false;
  if (marketStore.getSnapshot().sandboxRole !== "buyer") throw new Error("Choose Demo buyer in Agent sandbox before using buyer tools. No live buyer profile or credentials are needed.");
  return true;
}
function showDemoBuyer() { window.dispatchEvent(new Event("trader-network:open-demo")); }
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
      description: "Read role and data source first. A registered profile always uses live data. Without a profile, Agent sandbox offers Demo seller and Demo buyer; choose the role with the page buttons. All sandbox records are fictional and need no credentials.",
      inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true },
      async execute() {
        const profile = pilotApi.loadProfile();
        return result("Current trading context. Never confuse illustrative rehearsals with real trades.", { role: profile?.role ?? (marketStore.getSnapshot().sandboxRole === "buyer" ? "buyer" : "trader"), source: profile ? "cloudflare-d1" : "illustrative-demo", sandboxRole: profile ? null : marketStore.getSnapshot().sandboxRole, participantId: profile?.id ?? null, currentTime: new Date().toISOString(), timeZone: "Africa/Lagos", hasPilotCode: profile ? pilotApi.hasCode() : false, humanApprovalRequired: true });
      },
    },
    {
      name: "get_my_requests", title: "Read my buyer requests",
      description: "Buyer only. Read the current live buyer's requests, or fictional requests when anonymous with Demo buyer selected. Always check source. Includes the unpublished in-page request draft.",
      inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true },
      async execute() {
        if (sandboxBuyer()) return result("Fictional demo buyer requests. Seeded deadlines are relative rehearsal dates, not real commitments.", { source: "illustrative-demo", requests: marketStore.demoRequests(), unpublishedDraft: marketStore.getSnapshot().sandboxBuyerDraft ?? null });
        const { profile, snapshot } = await buyerSnapshot();
        const draft = buyerAgent.getState().draft;
        return result("Your live buyer requests and unpublished draft.", { source: "cloudflare-d1", requests: snapshot.demands.filter((request) => request.buyerId === profile.id), unpublishedDraft: draft?.buyerId === profile.id ? draft : null });
      },
    },
    {
      name: "find_stock_for_request", title: "Find stock for a buyer request",
      description: "Buyer only. Use demandId from get_my_requests, or full request fields. Shows live stock for a registered buyer, or fictional stock in anonymous Demo buyer mode. Exact product/unit matching; subtracts accepted reservations. Area labels are not distances. Delivery and pickup need confirmation; below-asking prices need negotiation. Never reserves or purchases.",
      inputSchema: { type: "object", properties: { demandId: { type: "string", description: "An existing request belonging to this buyer." }, ...properties } },
      async execute(input) {
        if (sandboxBuyer()) {
          const values = input as unknown as PurchaseRequest & { demandId?: string };
          const request = values.demandId ? marketStore.demoRequests().find((entry) => entry.id === values.demandId) : values;
          if (!request) throw new Error("That request does not belong to the current demo buyer.");
          const reserved = marketStore.getSnapshot().draft;
          const quantity = request.requestedQuantity - (reserved?.status === "accepted" && reserved.matchId === values.demandId ? reserved.quantity : 0);
          const items = quantity > 0 ? marketStore.searchDemoStock({ ...request, requestedQuantity: quantity }) : [];
          showDemoBuyer();
          return result("Illustrative stock only; no reservation or purchase. Below-asking prices need negotiation. No measured distance or delivery promise.", { source: "illustrative-demo", items });
        }
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
        if (sandboxBuyer()) {
          const offer = marketStore.getSnapshot().draft;
          const match = marketStore.demoBuyerMatch();
          const offers = offer && offer.status !== "draft" && offer.matchId === match?.id ? [{ ...offer, totalPrice: offer.quantity * offer.pricePerUnit, requestMaximumPricePerUnit: match?.request?.maximumPricePerUnit ?? match?.maxPricePerUnit, requiresHumanAcceptance: offer.status === "sent" }] : [];
          return result("Fictional buyer inbox. Only a human can accept or decline in the page. No real contact details.", { source: "illustrative-demo", offers });
        }
        const { profile, snapshot } = await buyerSnapshot();
        const offers = snapshot.offers.filter((offer) => offer.buyerId === profile.id && offer.status !== "draft").map((offer) => ({ ...offer, totalPrice: offer.quantity * offer.pricePerUnit, requestMaximumPricePerUnit: snapshot.demands.find((entry) => entry.id === offer.demandId)?.maximumPricePerUnit ?? null, requiresHumanAcceptance: offer.status === "sent" }));
        return result(`Found ${offers.length} offers for this buyer. Review them in Offers to review; only the buyer can accept or decline.`, { source: "cloudflare-d1", offers });
      },
    },
    {
      name: "draft_purchase_request", title: "Prepare a buyer request for approval",
      description: "Buyer only. Prepare an editable unpublished request in the page. Does not call a backend, publish, buy, reserve or accept. Human approval uses Approve and publish request (live), or Approve demo request (anonymous sandbox). Sandbox publishing supports only the four sample products and exact units. Cannot overwrite a draft; discard first. Drafts are lost on reload.",
      inputSchema: { type: "object", properties, required: ["itemName", "requestedQuantity", "unit", "maximumPricePerUnit", "neededBy", "deliveryArea", "fulfilmentPreference"] },
      async execute(input) {
        if (sandboxBuyer()) {
          const draft = marketStore.prepareDemoRequest(input as unknown as PurchaseRequest);
          showDemoBuyer();
          return result("Fictional request draft shown for editing and human approval. Sandbox publishing supports the four sample products in their exact units. No backend calls or real orders.", { source: "illustrative-demo", draft, requiresHumanApproval: true });
        }
        const profile = buyer();
        if (!pilotApi.hasCode()) throw new Error("Enter the pilot access code in the page to unlock the buyer workspace before preparing a request.");
        const draft = buyerAgent.prepare(profile.id, input as unknown as PurchaseRequest);
        showBuyer();
        return result("Request drafted in the page, not published. The buyer must review and approve it.", { source: "unpublished-local-draft", draft, requiresHumanApproval: true });
      },
    },
  ];
}
