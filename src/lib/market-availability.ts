import type { PilotDemand, PilotInventory, PilotOffer } from "./pilot-api";

export function availability(item: PilotInventory | PilotDemand, offers: PilotOffer[], now = Date.now()) {
  const stock = "traderId" in item;
  const related = offers.filter((offer) => (stock ? offer.inventoryId : offer.demandId) === item.id);
  const reserved = related.filter((offer) => offer.status === "accepted").reduce((sum, offer) => sum + offer.quantity, 0);
  const remaining = stock ? item.quantity : item.requestedQuantity;
  const deadline = stock ? item.availableUntil : item.neededBy;
  const fulfilled = remaining <= 0 || ["sold", "fulfilled"].includes(item.status);
  const expired = item.status === "expired" || Boolean(deadline && Date.parse(deadline) <= now);
  const withdrawn = item.status === "withdrawn";
  const closed = fulfilled || expired || withdrawn;
  const available = closed ? 0 : Math.max(0, remaining - reserved);
  const state = closed ? "closed" : available > 0 ? "available" : "reserved";
  const label = fulfilled ? "Closed · fulfilled" : withdrawn ? "Closed · withdrawn" : expired ? "Closed · expired" : available > 0 ? reserved ? "Partly reserved" : "Available" : "Reserved · awaiting pickup";
  return { available, reserved, state, label, completed: related.filter((offer) => offer.status === "completed").length };
}

export const sameProduct = (stock: PilotInventory, demand: PilotDemand) =>
  stock.itemName.trim().toLowerCase() === demand.itemName.trim().toLowerCase() &&
  stock.unit.trim().toLowerCase() === demand.unit.trim().toLowerCase() &&
  (demand.maximumPricePerUnit === null || demand.maximumPricePerUnit >= (stock.minimumPricePerUnit ?? 0));
