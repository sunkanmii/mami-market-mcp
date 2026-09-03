import type { BuyerMatch, InventoryItem, MarketState } from "./types";

export const inventory: InventoryItem[] = [
  {
    id: "tomatoes-roma",
    name: "Roma tomatoes",
    category: "Produce",
    quantity: 18,
    unit: "crates",
    pricePerUnit: 28500,
    expiresInHours: 22,
    soldToday: 5,
    reserved: 0,
    imageUrl:
      "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=900&q=82",
  },
  {
    id: "catfish-smoked",
    name: "Smoked catfish",
    category: "Seafood",
    quantity: 42,
    unit: "packs",
    pricePerUnit: 5200,
    expiresInHours: 68,
    soldToday: 11,
    reserved: 6,
    imageUrl:
      "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=900&q=82",
  },
  {
    id: "pepper-scotch-bonnet",
    name: "Scotch bonnet",
    category: "Produce",
    quantity: 9,
    unit: "baskets",
    pricePerUnit: 17600,
    expiresInHours: 34,
    soldToday: 3,
    reserved: 0,
    imageUrl:
      "https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&w=900&q=82",
  },
  {
    id: "beans-honey",
    name: "Honey beans",
    category: "Dry goods",
    quantity: 7,
    unit: "bags",
    pricePerUnit: 84500,
    expiresInHours: null,
    soldToday: 1,
    reserved: 1,
    imageUrl:
      "https://images.unsplash.com/photo-1515543904379-3d757afe72e4?auto=format&fit=crop&w=900&q=82",
  },
];

export const matches: BuyerMatch[] = [
  {
    id: "buyer-amaka",
    buyerName: "Amaka Fresh Foods",
    market: "Ketu Market",
    itemId: "tomatoes-roma",
    requestedQuantity: 6,
    maxPricePerUnit: 27500,
    distanceKm: 3.2,
    pickupWindow: "Today, 4–6 PM",
    matchScore: 94,
  },
  {
    id: "buyer-bisi",
    buyerName: "Bisi Kitchen Supply",
    market: "Ojota",
    itemId: "tomatoes-roma",
    requestedQuantity: 4,
    maxPricePerUnit: 26800,
    distanceKm: 4.8,
    pickupWindow: "Today, before 7 PM",
    matchScore: 89,
  },
  {
    id: "buyer-salihu",
    buyerName: "Salihu Produce",
    market: "Mile 12 Market",
    itemId: "pepper-scotch-bonnet",
    requestedQuantity: 5,
    maxPricePerUnit: 16900,
    distanceKm: 1.1,
    pickupWindow: "Tomorrow, 7–9 AM",
    matchScore: 97,
  },
  {
    id: "buyer-ijeoma",
    buyerName: "Ijeoma Grocers",
    market: "Maryland",
    itemId: "catfish-smoked",
    requestedQuantity: 12,
    maxPricePerUnit: 5100,
    distanceKm: 6.4,
    pickupWindow: "Tomorrow, before noon",
    matchScore: 91,
  },
];

export function createInitialState(): MarketState {
  return {
    sandboxRole: "seller",
    inventory: structuredClone(inventory),
    matches: structuredClone(matches),
    selectedItemId: "tomatoes-roma",
    draft: null,
    activities: [
      {
        id: "activity-welcome",
        title: "Market is ready",
        detail: "Four illustrative inventory lines and four demand matches loaded for the demo.",
        timestamp: new Date().toISOString(),
        kind: "system",
      },
    ],
    webMcpStatus: "checking",
  };
}
