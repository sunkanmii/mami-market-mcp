export type PilotRole = "trader" | "buyer" | "facilitator";
export type VerificationStatus = "unverified" | "contact_confirmed" | "in_person_confirmed";
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
const PROFILE_KEY = "trader-network-pilot-profile-v1";

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

  const response = await fetch(path, { ...init, headers });
  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? ((await response.json()) as { error?: string })
    : null;
  if (!response.ok) {
    throw new PilotApiError(data?.error ?? "The pilot network is temporarily unavailable.", response.status);
  }
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
  saveProfile(profile: PilotParticipant): void {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  },
  clearProfile(): void {
    window.localStorage.removeItem(PROFILE_KEY);
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
    consent: true;
  }): Promise<{ participant: PilotParticipant }> {
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
};
