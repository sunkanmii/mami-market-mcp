import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { pilotApi, type PilotParticipant } from "./pilot-api";

const buyer = { id: "buyer-one", role: "buyer", displayName: "sunkanmi", area: "Ketu" } as PilotParticipant;
const seller = { ...buyer, id: "seller-one", role: "trader" } as PilotParticipant;
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => vi.restoreAllMocks());

it("preserves both same-name profiles and restores their own credentials without registration", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { headers: { "content-type": "application/json" } }));
  pilotApi.saveCode("test-code");
  pilotApi.saveProfile(buyer, "buyer-token");
  pilotApi.pauseProfile();
  expect(pilotApi.loadProfile()).toBeNull();
  expect(localStorage.getItem("trader-network-participant-session-v2")).toBeNull();
  expect(pilotApi.hasCode()).toBe(true);
  pilotApi.saveProfile(seller, "seller-token");
  expect(pilotApi.savedProfiles().map((p) => p.id)).toEqual([buyer.id, seller.id]);
  for (const [profile, token] of [[buyer, "buyer-token"], [seller, "seller-token"]] as const) {
    pilotApi.pauseProfile();
    expect(pilotApi.switchProfile(profile.id)).toEqual(profile);
    await pilotApi.getNetwork();
    expect(new Headers(fetchMock.mock.lastCall?.[1]?.headers).get("authorization")).toBe(`Bearer ${token}`);
  }
  expect(fetchMock.mock.calls.every(([url]) => url === "/api/network")).toBe(true);
});

it("migrates an existing session once and keeps it after the pilot code expires", () => {
  localStorage.setItem("trader-network-pilot-profile-v2", JSON.stringify(buyer));
  localStorage.setItem("trader-network-participant-session-v2", "legacy-token");
  expect(pilotApi.savedProfiles()).toEqual([buyer]);
  const write = vi.spyOn(Storage.prototype, "setItem");
  pilotApi.savedProfiles();
  expect(write).not.toHaveBeenCalled();
  sessionStorage.clear();
  pilotApi.pauseProfile();
  expect(pilotApi.switchProfile(buyer.id)).toEqual(buyer);
  expect(pilotApi.hasCode()).toBe(false);
});

it("never gives a new profile the previous participant's token", () => {
  pilotApi.saveProfile(buyer, "buyer-token");
  pilotApi.saveProfile(seller);
  expect(localStorage.getItem("trader-network-participant-session-v2")).toBeNull();
  expect(pilotApi.savedProfiles()).toEqual([buyer]);
  expect(() => pilotApi.switchProfile(seller.id)).toThrow("not saved");
});

it("ignores malformed saved sessions and refuses unknown IDs", () => {
  localStorage.setItem("trader-network-saved-sessions-v1", '{"bad":true}');
  expect(pilotApi.savedProfiles()).toEqual([]);
  expect(() => pilotApi.switchProfile("unknown")).toThrow("not saved");
});
