import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buyerAgent, matchStock, validatePurchaseRequest, type PurchaseRequest } from "./buyer-agent";
import { buyerTools } from "./buyer-tools";
import { pilotApi, type PilotParticipant, type PilotSnapshot, type PilotInventory, type PilotOffer, type PilotMatch } from "./pilot-api";
import { registerMarketTools } from "./webmcp";

const profile = { id: "buyer-one", role: "buyer", displayName: "Buyer", area: "Ketu" } as PilotParticipant;
const query = (): PurchaseRequest => ({ itemName: "Watermelon", unit: "packs", requestedQuantity: 3, maximumPricePerUnit: 1000, neededBy: new Date(Date.now() + 86400000).toISOString(), deliveryArea: "Ketu", fulfilmentPreference: "pickup" });
const stock = { id: "stock", itemName: "Watermelon", unit: "packs", traderId: "seller", quantity: 5, askingPricePerUnit: 1000, minimumPricePerUnit: 800, status: "available", pickupArea: "Ketu", availableUntil: null } as PilotInventory;
const offer = (id: string, buyerId: string, status: string) => ({ id, buyerId, inventoryId: "stock", demandId: "request", status, quantity: 2, pricePerUnit: 900 }) as PilotOffer;
const snapshot = (): PilotSnapshot => ({ source: "cloudflare-d1", participants: [], inventory: [stock], demands: [
  { ...query(), id: "request", buyerId: profile.id, status: "open", category: null },
  { ...query(), id: "other-request", buyerId: "other-buyer", status: "open", category: null },
] as PilotSnapshot["demands"], offers: [offer("sent", profile.id, "sent"), offer("draft", profile.id, "draft"), offer("other", "other-buyer", "sent")], activities: [] });
async function execute(name: string, input: Record<string, unknown> = {}) {
  return await buyerTools().find((tool) => tool.name === name)!.execute(input, { signal: new AbortController().signal }) as { structuredContent: Record<string, unknown> };
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); buyerAgent.reset(); pilotApi.saveProfile(profile); pilotApi.saveCode("test-code"); vi.spyOn(pilotApi, "getNetwork").mockResolvedValue(snapshot()); });
afterEach(() => vi.restoreAllMocks());

describe("buyer agent isolation and approval", () => {
  it("returns only the current buyer's requests and sent offers, never unsent drafts", async () => {
    const requests = await execute("get_my_requests");
    expect(requests.structuredContent.requests).toHaveLength(1);
    const review = await execute("review_incoming_offers");
    expect(review.structuredContent.offers).toEqual([expect.objectContaining({ id: "sent", totalPrice: 1800, requiresHumanAcceptance: true })]);
  });
  it("drafts locally without any API write and refuses to overwrite a pending draft", async () => {
    const write = vi.spyOn(pilotApi, "createDemand");
    await execute("draft_purchase_request", { ...query() });
    expect(buyerAgent.getState().draft?.buyerId).toBe(profile.id);
    expect(write).not.toHaveBeenCalled();
    await expect(execute("draft_purchase_request", { ...query() })).rejects.toThrow("existing request draft");
  });
  it("does not create a hidden draft while the buyer workspace is locked", async () => {
    pilotApi.clearCode();
    await expect(execute("draft_purchase_request", { ...query() })).rejects.toThrow("unlock the buyer workspace");
    expect(buyerAgent.getState().draft).toBeNull();
  });
  it("searches owned requests, displays results, and rejects another buyer's request", async () => {
    await execute("find_stock_for_request", { demandId: "request" });
    expect(buyerAgent.getState().search?.items).toHaveLength(1);
    await expect(execute("find_stock_for_request", { demandId: "other-request" })).rejects.toThrow("does not belong");
  });
  it("refuses buyer tools for traders and anonymous visitors", async () => {
    for (const role of ["trader", null]) {
      if (role) pilotApi.saveProfile({ ...profile, role: "trader" }); else pilotApi.clearProfile();
      for (const name of ["get_my_requests", "find_stock_for_request", "review_incoming_offers", "draft_purchase_request"]) {
        await expect(execute(name, { ...query() })).rejects.toThrow("live buyer profile");
      }
    }
  });
  it("rejects all seller tools for buyers instead of returning fictional data", async () => {
    const registered: WebMCP.ModelContextTool[] = [];
    Object.defineProperty(document, "modelContext", { configurable: true, value: { registerTool: (tool: WebMCP.ModelContextTool) => { registered.push(tool); } } });
    const cleanup = await registerMarketTools();
    for (const tool of registered.slice(0, 4)) await expect(tool.execute({}, { signal: new AbortController().signal })).rejects.toThrow("Seller-only tool");
    cleanup();
  });
  it("preserves the seller's live inventory and draft-only workflow", async () => {
    pilotApi.saveProfile({ ...profile, id: "seller", role: "trader" });
    vi.spyOn(pilotApi, "getMatches").mockResolvedValue({ matches: [{ demandId: "request", neededBy: query().neededBy }] as PilotMatch[] });
    const write = vi.spyOn(pilotApi, "createOffer").mockResolvedValue({});
    const registered: WebMCP.ModelContextTool[] = [];
    Object.defineProperty(document, "modelContext", { configurable: true, value: { registerTool: (tool: WebMCP.ModelContextTool) => { registered.push(tool); } } });
    const cleanup = await registerMarketTools();
    const context = { signal: new AbortController().signal };
    expect(await registered[0].execute({}, context)).toMatchObject({ structuredContent: { source: "cloudflare-d1", items: [expect.objectContaining({ id: "stock" })] } });
    expect(await registered[3].execute({ itemId: "stock", matchId: "request", quantity: 1, pricePerUnit: 900 }, context)).toMatchObject({ structuredContent: { requiresHumanApproval: true } });
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ actorId: "seller", createdBy: "agent" }));
    cleanup();
  });
  it("fails closed if the participant changes during a read", async () => {
    vi.mocked(pilotApi.getNetwork).mockImplementationOnce(async () => { pilotApi.saveProfile({ ...profile, id: "new-buyer" }); return snapshot(); });
    await expect(execute("get_my_requests")).rejects.toThrow("Participant changed");
  });
});
describe("honest stock matching", () => {
  it("subtracts reservations, rejects units/expiry/budget mismatches and labels negotiation", () => {
    const data = snapshot();
    data.inventory = [stock, { ...stock, id: "wrong-unit", unit: "crates" }, { ...stock, id: "expired", availableUntil: "2020-01-01T00:00:00Z" }, { ...stock, id: "expensive", minimumPricePerUnit: 2000 }];
    data.offers.push(offer("reserved", "other-buyer", "accepted"));
    const matches = matchStock(data, { ...query(), requestedQuantity: 5, maximumPricePerUnit: 900 });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ availableQuantity: 3, suggestedQuantity: 3, priceStatus: "negotiation_needed" });
  });
  it("rejects invalid units, fractional quantities, invalid prices and past dates", () => {
    for (const changes of [{ unit: "pieces" }, { requestedQuantity: 1.5 }, { maximumPricePerUnit: -1 }, { neededBy: "2020-01-01T00:00:00Z" }, { neededBy: "2030-01-01T00:00:00" }]) expect(() => validatePurchaseRequest({ ...query(), ...changes })).toThrow();
  });
});
