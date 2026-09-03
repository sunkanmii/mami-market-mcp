import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BuyerAgentPanel } from "./BuyerAgentPanel";
import { buyerAgent } from "../lib/buyer-agent";
import { pilotApi, type PilotParticipant } from "../lib/pilot-api";

const profile = { id: "buyer-ui", role: "buyer", displayName: "Buyer", area: "Ketu" } as PilotParticipant;
const input = () => ({ itemName: "Watermelon", unit: "packs", requestedQuantity: 1, maximumPricePerUnit: 1000, neededBy: new Date(Date.now() + 86400000).toISOString(), deliveryArea: "Ketu", fulfilmentPreference: "pickup" as const });
beforeEach(() => { buyerAgent.reset(); localStorage.clear(); pilotApi.saveProfile(profile); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("shows a draft, lets the human edit it, and writes only after explicit approval", async () => {
  const write = vi.spyOn(pilotApi, "createDemand").mockResolvedValue({});
  render(<BuyerAgentPanel profile={profile} busy={false} runMutation={async (action) => { await action(); return true; }} />);
  act(() => { buyerAgent.prepare(profile.id, input()); });
  expect(screen.getByRole("heading", { name: "Review your request" })).toBeInTheDocument();
  expect(write).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Approve and publish request" }));
  await waitFor(() => expect(write).toHaveBeenCalledWith(expect.objectContaining({ buyerId: profile.id, requestedQuantity: 2, unit: "packs" })));
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Review your request" })).not.toBeInTheDocument());
});
it("discards without publishing and keeps a failed publish available for correction", async () => {
  const write = vi.spyOn(pilotApi, "createDemand");
  act(() => { buyerAgent.prepare(profile.id, input()); });
  render(<BuyerAgentPanel profile={profile} busy={false} runMutation={async () => false} />);
  fireEvent.click(screen.getByRole("button", { name: "Approve and publish request" }));
  expect(await screen.findByRole("heading", { name: "Review your request" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Discard request draft" }));
  expect(screen.queryByRole("heading", { name: "Review your request" })).not.toBeInTheDocument();
  expect(write).not.toHaveBeenCalled();
});
