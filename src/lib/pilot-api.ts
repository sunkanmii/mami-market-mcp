export type PilotRole = "trader" | "buyer" | "facilitator";
export type VerificationStatus = "unverified" | "contact_confirmed" | "in_person_confirmed";
export type ContactMethod = "call" | "whatsapp" | "either";
export type OfferStatus = "draft" | "sent" | "accepted" | "declined" | "completed" | "cancelled" | "expired";

export interface PilotParticipant {
  id: string;
  role: PilotRole;
  displayName: string;
  businessName: string | null;
  marketName: string | null;
  area: string;
  verificationStatus?: VerificationStatus;
  consentedAt: string;
  createdAt?: string;
}

export interface PilotOfferContact {
  offerId: string;
  contact: {
    displayName: string;
    businessName: string | null;
    phoneNumber: string;
    preferredContactMethod: ContactMethod;
  };
  pickup: {
    area: string;
    meetupLocation: string;
  };
}

export interface PilotInventory {
  id: string;
  traderId: string;
  traderName: string;
  traderBusiness: string | null;
  verificationStatus: VerificationStatus;
  itemName: string;
  category: string | null;
  quantity: number;
  unit: string;
  askingPricePerUnit: number;
  minimumPricePerUnit: number | null;
  availableUntil: string | null;
  pickupArea: string;
  pickupNotes: string | null;
  status: string;
  createdAt: string;
}

export interface PilotDemand {
  id: string;
  buyerId: string;
  buyerName: string;
  buyerBusiness: string | null;
  verificationStatus: VerificationStatus;
  itemName: string;
  category: string | null;
  requestedQuantity: number;
  unit: string;
  maximumPricePerUnit: number | null;
  neededBy: string;
  deliveryArea: string;
  fulfilmentPreference: "pickup" | "delivery" | "either";
  status: string;
  createdAt: string;
}

export interface PilotOffer {
  id: string;
  inventoryId: string;
  demandId: string;
  quantity: number;
  pricePerUnit: number;
  pickupWindow: string;
  note: string | null;
  createdBy: "agent" | "trader" | "facilitator";
  status: OfferStatus;
  sellerApprovedAt: string | null;
  sentAt: string | null;
  buyerRespondedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  itemName: string;
  unit: string;
  traderId: string;
  traderName: string;
  buyerId: string;
  buyerName: string;
}

export interface PilotActivity {
  id: string;
  participantId: string | null;
  offerId: string | null;
  eventType: string;
  detail: string;
  createdAt: string;
}

export interface PilotSnapshot {
  source: "cloudflare-d1";
  participants: PilotParticipant[];
  inventory: PilotInventory[];
  demands: PilotDemand[];
  offers: PilotOffer[];
  activities: PilotActivity[];
}

export interface PilotMatch {
  demandId: string;
  buyerId: string;
  buyerName: string;
  buyerBusiness: string | null;
  marketName: string | null;
  buyerArea: string;
  verificationStatus: VerificationStatus;
  requestedQuantity: number;
  unit: string;
  maximumPricePerUnit: number | null;
  neededBy: string;
  deliveryArea: string;
  fulfilmentPreference: "pickup" | "delivery" | "either";
  inventoryId: string;
  availableQuantity: number;
  askingPricePerUnit: number;
  minimumPricePerUnit: number | null;
  pickupArea: string;
  matchReason: string;
}

const CODE_KEY = "trader-network-pilot-code-v1";
const PROFILE_KEY = "trader-network-pilot-profile-v2";
const SESSION_KEY = "trader-network-participant-session-v2";
const SAVED_SESSIONS_KEY = "trader-network-saved-sessions-v1";

type SavedSession = { profile: PilotParticipant; sessionToken: string };

function readSavedSessions(): SavedSession[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(SAVED_SESSIONS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((entry): entry is SavedSession =>
      entry && typeof entry.sessionToken === "string" && entry.sessionToken.length > 0 &&
      typeof entry.profile?.id === "string" && typeof entry.profile?.displayName === "string" &&
      ["buyer", "trader", "facilitator"].includes(entry.profile.role),
    ) : [];
  } catch { return []; }
}

function rememberSession(profile: PilotParticipant, sessionToken: string): void {
  const existing = readSavedSessions();
  if (existing.some((entry) => entry.profile.id === profile.id && entry.sessionToken === sessionToken && JSON.stringify(entry.profile) === JSON.stringify(profile))) return;
  const sessions = existing.filter((entry) => entry.profile.id !== profile.id);
  window.localStorage.setItem(SAVED_SESSIONS_KEY, JSON.stringify([...sessions, { profile, sessionToken }]));
}

function rememberActiveSession(): void {
  const profile = pilotApi.loadProfile();
  const token = window.localStorage.getItem(SESSION_KEY);
  if (profile && token) rememberSession(profile, token);
}

export class PilotApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function getPilotCode(): string {
  return window.sessionStorage.getItem(CODE_KEY) ?? "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");
  if (init?.body) headers.set("content-type", "application/json");
  const code = getPilotCode();
  if (code) headers.set("x-pilot-code", code);
  const sessionToken = window.localStorage.getItem(SESSION_KEY);
  if (sessionToken) headers.set("authorization", `Bearer ${sessionToken}`);

  const response = await fetch(path, { ...init, headers });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
    throw new PilotApiError(local
      ? "The local app cannot reach its API. Start the Pages backend or configure PILOT_API_TARGET, then restart Vite. You can also use trader-network.pages.dev."
      : `The pilot API returned an unexpected response (HTTP ${response.status}). Please reload and try again.`, response.status);
  }
  const data = contentType.includes("application/json")
    ? ((await response.json()) as { error?: string })
    : null;
  if (!response.ok) {
    throw new PilotApiError(data?.error ?? "The pilot network is temporarily unavailable.", response.status);
  }
  if (data === null || typeof data !== "object") throw new PilotApiError("The pilot API returned an empty response. Please try again.", response.status);
  return data as T;
}

export const pilotApi = {
  hasCode(): boolean {
    return Boolean(getPilotCode());
  },
  saveCode(code: string): void {
    window.sessionStorage.setItem(CODE_KEY, code.trim());
  },
  clearCode(): void {
    window.sessionStorage.removeItem(CODE_KEY);
  },
  loadProfile(): PilotParticipant | null {
    try {
      const value = window.localStorage.getItem(PROFILE_KEY);
      return value ? (JSON.parse(value) as PilotParticipant) : null;
    } catch {
      return null;
    }
  },
  saveProfile(profile: PilotParticipant, sessionToken?: string): void {
    const previousId = pilotApi.loadProfile()?.id;
    rememberActiveSession();
    // Never carry one participant's credentials into another profile.
    if (!sessionToken && previousId !== profile.id) window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    if (sessionToken) {
      window.localStorage.setItem(SESSION_KEY, sessionToken);
      rememberSession(profile, sessionToken);
    }
  },
  savedProfiles(): PilotParticipant[] {
    // Upgrade the existing single-profile session without touching D1.
    rememberActiveSession();
    return readSavedSessions().map((entry) => entry.profile);
  },
  switchProfile(participantId: string): PilotParticipant {
    const session = readSavedSessions().find((entry) => entry.profile.id === participantId);
    if (!session) throw new Error("This profile is not saved in this browser. Return to the browser where you registered.");
    pilotApi.saveProfile(session.profile, session.sessionToken);
    return session.profile;
  },
  pauseProfile(): void {
    rememberActiveSession();
    window.localStorage.removeItem(PROFILE_KEY);
    window.localStorage.removeItem(SESSION_KEY);
  },
  clearProfile(): void {
    window.localStorage.removeItem(PROFILE_KEY);
    window.localStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(CODE_KEY);
  },
  getNetwork(): Promise<PilotSnapshot> {
    return request<PilotSnapshot>("/api/network");
  },
  getMatches(inventoryId: string): Promise<{ matches: PilotMatch[] }> {
    return request<{ matches: PilotMatch[] }>(
      `/api/matches?inventoryId=${encodeURIComponent(inventoryId)}`,
    );
  },
  createParticipant(input: {
    role: "trader" | "buyer";
    displayName: string;
    businessName?: string;
    marketName?: string;
    area: string;
    phoneNumber: string;
    preferredContactMethod: ContactMethod;
    meetupLocation: string;
    consent: boolean;
    contactSharingConsent: boolean;
  }): Promise<{ participant: PilotParticipant; sessionToken: string }> {
    return request("/api/participants", { method: "POST", body: JSON.stringify(input) });
  },
  createInventory(input: Record<string, unknown>): Promise<unknown> {
    return request("/api/inventory", { method: "POST", body: JSON.stringify(input) });
  },
  createDemand(input: Record<string, unknown>): Promise<unknown> {
    return request("/api/demands", { method: "POST", body: JSON.stringify(input) });
  },
  createOffer(input: Record<string, unknown>): Promise<unknown> {
    return request("/api/offers", { method: "POST", body: JSON.stringify(input) });
  },
  updateOfferStatus(offerId: string, status: OfferStatus, actorId: string): Promise<unknown> {
    return request(`/api/offers/${encodeURIComponent(offerId)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, actorId }),
    });
  },
  getOfferContact(offerId: string): Promise<PilotOfferContact> {
    return request(`/api/offers/${encodeURIComponent(offerId)}/contact`);
  },
};
