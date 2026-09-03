import { useSyncExternalStore } from "react";
import type { PilotInventory, PilotSnapshot } from "./pilot-api";

export const purchaseUnits = ["crates", "baskets", "bags", "packs", "kilograms"] as const;
export interface PurchaseRequest {
  itemName: string;
  category?: string;
  requestedQuantity: number;
  unit: string;
  maximumPricePerUnit: number | null;
  neededBy: string;
  deliveryArea: string;
  fulfilmentPreference: "pickup" | "delivery" | "either";
}
export interface PurchaseDraft extends PurchaseRequest { id: string; buyerId: string }
export interface StockMatch extends PilotInventory {
  availableQuantity: number;
  suggestedQuantity: number;
  priceStatus: "within_budget" | "negotiation_needed";
  sameArea: boolean;
}
interface BuyerAgentState {
  draft: PurchaseDraft | null;
  search: { buyerId: string; query: PurchaseRequest; items: StockMatch[] } | null;
}
let state: BuyerAgentState = { draft: null, search: null };
const listeners = new Set<() => void>();
function update(next: BuyerAgentState) { state = next; listeners.forEach((listener) => listener()); }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useBuyerAgent = () => useSyncExternalStore(subscribe, () => state);
export const buyerAgent = {
  getState: () => state,
  prepare(buyerId: string, input: PurchaseRequest) {
    if (state.draft?.buyerId === buyerId) throw new Error("Review or discard the existing request draft before preparing another.");
    const draft = { ...validatePurchaseRequest(input), buyerId, id: crypto.randomUUID() };
    update({ ...state, draft });
    return draft;
  },
  discard(id: string) { if (state.draft?.id === id) update({ ...state, draft: null }); },
  showSearch(buyerId: string, query: PurchaseRequest, items: StockMatch[]) {
    update({ ...state, search: { buyerId, query, items } });
  },
  reset() { update({ draft: null, search: null }); },
};

export function validatePurchaseRequest(input: PurchaseRequest): PurchaseRequest {
  const text = (value: unknown, label: string, max: number) => {
    if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`${label} is required (up to ${max} characters).`);
    return value.trim();
  };
  const itemName = text(input.itemName, "Product", 80);
  const deliveryArea = text(input.deliveryArea, "Collection area", 80);
  if (!Number.isInteger(input.requestedQuantity) || input.requestedQuantity < 1 || input.requestedQuantity > 100_000) throw new Error("Quantity must be a whole number between 1 and 100,000.");
  if (!(purchaseUnits as readonly string[]).includes(input.unit)) throw new Error("Choose crates, baskets, bags, packs, or kilograms. Units are not automatically converted.");
  if (input.maximumPricePerUnit !== null && (!Number.isInteger(input.maximumPricePerUnit) || input.maximumPricePerUnit < 0 || input.maximumPricePerUnit > 1_000_000_000)) throw new Error("Maximum price must be a whole naira amount, or null for an open budget.");
  if (typeof input.neededBy !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(input.neededBy) || !Number.isFinite(Date.parse(input.neededBy)) || Date.parse(input.neededBy) <= Date.now()) throw new Error("Needed by must be a future ISO date with a timezone, for example +01:00 for Nigeria.");
  if (!["pickup", "delivery", "either"].includes(input.fulfilmentPreference)) throw new Error("Choose pickup, delivery, or either.");
  if (input.category !== undefined && (typeof input.category !== "string" || input.category.length > 40)) throw new Error("Category must be at most 40 characters.");
  return { ...input, itemName, deliveryArea, neededBy: new Date(input.neededBy).toISOString() };
}

export function matchStock(snapshot: PilotSnapshot, query: PurchaseRequest): StockMatch[] {
  const normalize = (value: string) => value.trim().toLowerCase();
  return snapshot.inventory.filter((item) =>
    ["available", "partially_matched"].includes(item.status) &&
    normalize(item.itemName) === normalize(query.itemName) && normalize(item.unit) === normalize(query.unit) &&
    (!item.availableUntil || Date.parse(item.availableUntil) > Date.now()) &&
    (query.maximumPricePerUnit === null || query.maximumPricePerUnit >= (item.minimumPricePerUnit ?? 0)),
  ).map((item): StockMatch => {
    const reserved = snapshot.offers.filter((offer) => offer.inventoryId === item.id && offer.status === "accepted").reduce((total, offer) => total + offer.quantity, 0);
    const availableQuantity = Math.max(0, item.quantity - reserved);
    return { ...item, availableQuantity, suggestedQuantity: Math.min(query.requestedQuantity, availableQuantity),
      sameArea: normalize(item.pickupArea) === normalize(query.deliveryArea),
      priceStatus: query.maximumPricePerUnit !== null && query.maximumPricePerUnit < item.askingPricePerUnit ? "negotiation_needed" : "within_budget" };
  }).filter((item) => item.availableQuantity > 0)
    .sort((a, b) => Number(b.sameArea) - Number(a.sameArea) || a.askingPricePerUnit - b.askingPricePerUnit);
}
