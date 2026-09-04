import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { marketStore } from "./lib/store";

describe("Trader Network human-in-the-loop flow", () => {
  beforeEach(() => {
    marketStore.reset();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("prepares an offer but waits for the trader before publishing", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("link", { name: "Agent sandbox" }));

    fireEvent.click(screen.getByRole("button", { name: /preview that assist/i }));

    expect(screen.getByText("Agent-prepared draft")).toBeInTheDocument();
    expect(screen.getByText(/nothing is published until you approve/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve and send/i })).toBeEnabled();
  });

  it("publishes only after an explicit approval action", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("link", { name: "Agent sandbox" }));
    fireEvent.click(screen.getByRole("button", { name: /preview that assist/i }));
    fireEvent.click(screen.getByRole("button", { name: /approve and send/i }));
    expect(marketStore.getSnapshot().inventory[0].reserved).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: /view offer as demo buyer/i }));
    fireEvent.click(screen.getByRole("button", { name: /accept demo offer/i }));
    expect(marketStore.getSnapshot().inventory[0].reserved).toBe(6);
    expect(screen.getByText("Seller contact handoff")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /simulate completed pickup/i }));
    expect(marketStore.getSnapshot().inventory[0].quantity).toBe(12);
    expect(marketStore.getSnapshot().inventory[0].reserved).toBe(0);
    expect(screen.getByText(/No real sale occurred/i)).toBeInTheDocument();
  });

  it("hides the sandbox banner until explicitly opened from navigation", () => {
    render(<App />);
    expect(document.getElementById("demo-sandbox")).not.toBeVisible();
    fireEvent.click(screen.getByRole("link", { name: "Agent sandbox" }));
    expect(document.getElementById("demo-sandbox")).toBeVisible();
  });

  it("puts a newly sent offer at the top of the buyer workspace", async () => {
    window.localStorage.setItem("trader-network-pilot-profile-v2", JSON.stringify({
      id: "buyer-test",
      role: "buyer",
      displayName: "Test Buyer",
      businessName: null,
      marketName: null,
      area: "Ketu",
      consentedAt: new Date().toISOString(),
    }));
    window.localStorage.setItem("trader-network-participant-session-v2", "test-session");
    window.sessionStorage.setItem("trader-network-pilot-code-v1", "test-code");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      source: "cloudflare-d1",
      participants: [],
      inventory: [],
      demands: [],
      activities: [],
      offers: [{
        id: "offer-test",
        inventoryId: "stock-test",
        demandId: "demand-test",
        quantity: 2,
        pricePerUnit: 5000,
        pickupWindow: "Tomorrow morning",
        note: null,
        createdBy: "trader",
        status: "sent",
        sellerApprovedAt: new Date().toISOString(),
        sentAt: new Date().toISOString(),
        buyerRespondedAt: null,
        completedAt: null,
        createdAt: new Date().toISOString(),
        itemName: "Tomatoes",
        unit: "baskets",
        traderId: "trader-test",
        traderName: "Test Trader",
        buyerId: "buyer-test",
        buyerName: "Test Buyer",
      }],
    }), { headers: { "content-type": "application/json" } }));

    render(<App />);

    expect(await screen.findByText("1 offer waiting")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your offers & exchanges" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept offer" })).toBeEnabled();
  });
});
