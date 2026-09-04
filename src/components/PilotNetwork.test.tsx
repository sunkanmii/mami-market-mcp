import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PilotNetwork } from "./PilotNetwork";
import { pilotApi, type PilotParticipant } from "../lib/pilot-api";
import { buyerAgent } from "../lib/buyer-agent";

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); buyerAgent.reset();
  vi.spyOn(pilotApi, "getNetwork").mockResolvedValue({ source: "cloudflare-d1", participants: [], inventory: [], demands: [], offers: [], activities: [] });
});
afterEach(() => vi.restoreAllMocks());

it("switches buyer to seller and back without re-registering or forgetting either profile", async () => {
  const buyer = { id: "buyer-one", role: "buyer", displayName: "sunkanmi", area: "Ketu" } as PilotParticipant;
  const seller = { ...buyer, id: "seller-one", role: "trader" } as PilotParticipant;
  pilotApi.saveProfile(seller, "seller-token");
  pilotApi.saveProfile(buyer, "buyer-token");
  pilotApi.saveCode("test-code");
  const create = vi.spyOn(pilotApi, "createParticipant");
  render(<PilotNetwork />);
  await screen.findByText("Buying from this device");
  fireEvent.click(screen.getByRole("button", { name: "Change participant" }));
  expect(screen.getByRole("heading", { name: "Continue with a saved participant" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Join as trader" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Continue as seller" }));
  expect(screen.getByText("Selling from this device")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Change participant" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue as buyer" }));
  expect(screen.getByText("Buying from this device")).toBeInTheDocument();
  expect(pilotApi.loadProfile()?.id).toBe(buyer.id);
  expect(create).not.toHaveBeenCalled();
});
