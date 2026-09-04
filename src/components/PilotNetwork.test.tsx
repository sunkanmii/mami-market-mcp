import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PilotNetwork } from "./PilotNetwork";
import { pilotApi, type PilotOffer, type PilotParticipant } from "../lib/pilot-api";
import { buyerAgent } from "../lib/buyer-agent";

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); buyerAgent.reset();
  vi.spyOn(pilotApi, "getNetwork").mockResolvedValue({ source: "cloudflare-d1", participants: [], inventory: [], demands: [], offers: [], activities: [] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("explains country-neutral phone entry with an accessible field description", async () => {
  render(<PilotNetwork />);
  expect(await screen.findByLabelText("Phone or WhatsApp number")).toHaveAccessibleDescription(/Local numbers are accepted/);
  expect(screen.getByPlaceholderText("Your phone number")).toBeInTheDocument();
});

it.each([['02079460958', null], ['+442079460958', 'https://wa.me/442079460958']])("handles contact links without guessing a country for %s", async (phoneNumber, whatsappUrl) => {
  pilotApi.saveProfile({ id: "buyer-one", role: "buyer", displayName: "Buyer", area: "Test area" } as PilotParticipant, "test-token");
  pilotApi.saveCode("test-code");
  vi.mocked(pilotApi.getNetwork).mockResolvedValue({source:"cloudflare-d1",participants:[],inventory:[],demands:[],activities:[],offers:[{id:"test-offer",buyerId:"buyer-one",traderId:"seller",status:"accepted",itemName:"Tomatoes",quantity:1,unit:"crates",pricePerUnit:1000,traderName:"Seller",buyerName:"Buyer",pickupWindow:"Tomorrow"} as PilotOffer]});
  vi.spyOn(pilotApi,"getOfferContact").mockResolvedValue({offerId:"test-offer",contact:{displayName:"Seller",businessName:null,phoneNumber,preferredContactMethod:"either"},pickup:{area:"Test area",meetupLocation:"Test entrance"}});
  render(<PilotNetwork />);
  expect(await screen.findByRole("link",{name:"Call"})).toHaveAttribute("href",`tel:${phoneNumber}`);
  if (whatsappUrl) expect(screen.getByRole("link",{name:"WhatsApp"})).toHaveAttribute("href",whatsappUrl);
  else {
    expect(screen.queryByRole("link",{name:"WhatsApp"})).not.toBeInTheDocument();
    expect(screen.getByText(/No direct WhatsApp link is available/)).toBeInTheDocument();
  }
});

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
