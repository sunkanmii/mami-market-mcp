import type { PurchaseDraft, PurchaseRequest } from "./lib/buyer-agent";

export type InventoryCategory = "Produce" | "Seafood" | "Dry goods";

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  expiresInHours: number | null;
  soldToday: number;
  reserved: number;
  imageUrl: string;
}

export interface BuyerMatch {
  request?: PurchaseRequest;
  id: string;
  buyerName: string;
  market: string;
  itemId: string;
  requestedQuantity: number;
  maxPricePerUnit: number;
  distanceKm: number;
  pickupWindow: string;
  matchScore: number;
}

export interface OfferDraft {
  id: string;
  itemId: string;
  matchId: string | null;
  quantity: number;
  pricePerUnit: number;
  note: string;
  status: "draft" | "sent" | "accepted" | "declined" | "completed";
  createdBy: "human" | "agent";
}

export interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  kind: "agent" | "human" | "system";
}

export interface MarketState {
  sandboxBuyerDraft?: PurchaseDraft | null;
  sandboxSearch?: { query: PurchaseRequest; items: (InventoryItem & { availableQuantity: number })[] } | null;
  sandboxRole: "seller" | "buyer";
  inventory: InventoryItem[];
  matches: BuyerMatch[];
  selectedItemId: string;
  draft: OfferDraft | null;
  activities: ActivityItem[];
  webMcpStatus: "checking" | "connected" | "unavailable";
}
