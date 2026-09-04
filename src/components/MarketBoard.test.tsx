import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MarketBoard } from "./MarketBoard";
import { buyerAgent, validatePurchaseRequest, matchStock } from "../lib/buyer-agent";
import { availability } from "../lib/market-availability";
import { pilotApi, type PilotSnapshot, type PilotInventory, type PilotDemand, type PilotParticipant, type PilotOffer } from "../lib/pilot-api";
const buyer = { id: "buyer", role: "buyer", area: "Ketu" } as PilotParticipant;
const seller = { id: "seller", role: "trader", area: "Ketu" } as PilotParticipant;
const stock = { id: "stock", traderId: "seller", traderName: "Ada", itemName: "Watermelon", unit: "piece", quantity: 5, askingPricePerUnit: 1000, minimumPricePerUnit: 800, status: "available", pickupArea: "Ketu", availableUntil: null } as PilotInventory;
const demand = { id: "demand", buyerId: "buyer", buyerName: "Bisi", itemName: "Watermelon", unit: "piece", requestedQuantity: 3, maximumPricePerUnit: 1000, neededBy: new Date(Date.now() + 86400000).toISOString(), deliveryArea: "Ketu", status: "open", fulfilmentPreference: "pickup" } as PilotDemand;
const network = (): PilotSnapshot => ({ source: "cloudflare-d1", inventory: [stock], demands: [demand], participants: [], offers: [], activities: [] });
const mutate = async (action: () => Promise<unknown>) => { await action(); return true; };
beforeEach(() => buyerAgent.reset());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("filters actual stock locations and categories together with search, and resets without writes", () => {
  const data = network();
  data.inventory = [
    { ...stock, category: "Produce" },
    { ...stock, id: "two", itemName: "Tomatoes", pickupArea: "  ketu  ", category: "produce" },
    { ...stock, id: "three", itemName: "Catfish", pickupArea: "Magodo Phase 2", category: "Fish" },
    { ...stock, id: "four", itemName: "Beans", pickupArea: "Magodo Phase 2", category: null },
  ];
  const runMutation = vi.fn();
  render(<MarketBoard profile={buyer} snapshot={data} busy={false} runMutation={runMutation} />);
  expect(within(screen.getByLabelText("Pickup location")).getAllByRole("option")).toHaveLength(3);
  fireEvent.change(screen.getByLabelText("Pickup location"), { target: { value: "ketu" } });
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "produce" } });
  expect(screen.getByRole("status")).toHaveTextContent("2 stock listings");
  fireEvent.change(screen.getByLabelText("Search product or area"), { target: { value: " tomatoes " } });
  expect(screen.getByRole("status")).toHaveTextContent("1 stock listing");
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "fish" } });
  expect(screen.getByText(/No listings match these filters/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
  expect(screen.getByRole("status")).toHaveTextContent("4 stock listings");
  expect(runMutation).not.toHaveBeenCalled();
});
it("filters seller requests by buyer location and keeps a removed selection visible after refresh", () => {
  const data = network();
  data.demands = [{ ...demand, category: "Produce" }, { ...demand, id: "second", deliveryArea: "Ikeja", category: "Fruit" }];
  const { rerender } = render(<MarketBoard profile={seller} snapshot={data} busy={false} runMutation={mutate} />);
  fireEvent.change(screen.getByLabelText("Buyer location"), { target: { value: "ikeja" } });
  expect(screen.getByRole("status")).toHaveTextContent("1 buyer request");
  rerender(<MarketBoard profile={seller} snapshot={network()} busy={false} runMutation={mutate} />);
  expect(screen.getByRole("option", { name: "ikeja (no longer listed)" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("0 buyer requests");
});
it("lets buyers browse and prepare a piece request without publishing or reserving", () => {
  const write = vi.spyOn(pilotApi, "createDemand");
  render(<MarketBoard profile={buyer} snapshot={network()} busy={false} runMutation={mutate} />);
  fireEvent.click(screen.getByRole("button", { name: "Prepare request for Watermelon" }));
  expect(buyerAgent.getState().draft).toMatchObject({ itemName: "Watermelon", unit: "piece", requestedQuantity: 1, createdBy: "buyer" });
  expect(write).not.toHaveBeenCalled();
  expect(validatePurchaseRequest(buyerAgent.getState().draft!).unit).toBe("piece");
  expect(matchStock(network(), buyerAgent.getState().draft!)).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Prepare request for Watermelon" }));
  expect(screen.getByRole("alert")).toHaveTextContent("existing request draft");
});
it("shows seller demand and prepares a draft, not a sent offer", async () => {
  const write = vi.spyOn(pilotApi, "createOffer").mockResolvedValue({});
  render(<MarketBoard profile={seller} snapshot={network()} busy={false} runMutation={mutate} />);
  expect(screen.getByRole("heading", { name: "Browse buyer requests" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Prepare offer/ }));
  await waitFor(() => expect(write).toHaveBeenCalledWith(expect.objectContaining({ inventoryId: "stock", demandId: "demand", actorId: "seller", quantity: 3, pricePerUnit: 1000, createdBy: "trader" })));
});
it("subtracts accepted reservations, not sent offers, and exposes closed listings without purchase actions", () => {
  const sent = { inventoryId: "stock", status: "sent", quantity: 5 } as PilotOffer;
  const accepted = { ...sent, status: "accepted" } as PilotOffer;
  expect(availability(stock, [sent]).available).toBe(5);
  expect(availability(stock, [accepted])).toMatchObject({ available: 0, reserved: 5, state: "reserved" });
  const data = network(); data.inventory = [{ ...stock, quantity: 0, status: "sold" }];
  render(<MarketBoard profile={buyer} snapshot={data} busy={false} runMutation={mutate} />);
  expect(screen.queryByRole("button", { name: /Prepare request/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Show"), { target: { value: "closed" } });
  expect(screen.getByText("Closed · fulfilled")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Prepare request/ })).toBeDisabled();
});
it("does not mark expiry as a completed sale and does not match incompatible units", () => {
  expect(availability({ ...stock, availableUntil: "2020-01-01T00:00:00Z" }, [])).toMatchObject({ state: "closed", label: "Closed · expired", completed: 0 });
  const data = network(); data.inventory = [{ ...stock, unit: "packs" }];
  render(<MarketBoard profile={seller} snapshot={data} busy={false} runMutation={mutate} />);
  expect(screen.queryByRole("button", { name: /Prepare offer/ })).not.toBeInTheDocument();
  expect(screen.getByText(/No compatible stock/)).toBeInTheDocument();
});
