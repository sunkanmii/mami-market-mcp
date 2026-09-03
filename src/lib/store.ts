import { useSyncExternalStore } from "react";
import { createInitialState } from "../data";
import type {
  ActivityItem,
  BuyerMatch,
  MarketState,
  OfferDraft,
} from "../types";

const STORAGE_KEY = "trader-network-demo-v2";

interface FindMatchInput {
  itemId: string;
  maxDistanceKm?: number;
}

interface DraftOfferInput {
  itemId: string;
  quantity: number;
  pricePerUnit: number;
  matchId?: string | null;
  note?: string;
  createdBy: "human" | "agent";
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function loadState(): MarketState {
  if (typeof window === "undefined") return createInitialState();

  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return createInitialState();
    const parsed = JSON.parse(value) as MarketState;
    if (!Array.isArray(parsed.inventory) || !Array.isArray(parsed.matches)) {
      return createInitialState();
    }
    return { ...parsed, webMcpStatus: "checking" };
  } catch {
    return createInitialState();
  }
}

class MarketStore {
  private state = loadState();
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): MarketState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private commit(next: MarketState): void {
    this.state = next;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...next, webMcpStatus: "checking" }),
      );
    } catch {
      // The demo remains functional when storage is disabled.
    }
    this.listeners.forEach((listener) => listener());
  }

  private activity(
    title: string,
    detail: string,
    kind: ActivityItem["kind"],
  ): ActivityItem {
    return {
      id: newId("activity"),
      title,
      detail,
      timestamp: new Date().toISOString(),
      kind,
    };
  }

  setWebMcpStatus(status: MarketState["webMcpStatus"]): void {
    this.commit({ ...this.state, webMcpStatus: status });
  }

  selectItem(itemId: string, source: "human" | "agent" = "human"): void {
    const item = this.state.inventory.find((entry) => entry.id === itemId);
    if (!item) throw new Error(`Inventory item "${itemId}" was not found.`);
    this.commit({
      ...this.state,
      selectedItemId: itemId,
      activities:
        source === "agent"
          ? [
              this.activity(
                "Agent focused the workspace",
                `${item.name} is now selected for review.`,
                "agent",
              ),
              ...this.state.activities,
            ].slice(0, 8)
          : this.state.activities,
    });
  }

  listInventory(urgentOnly = false) {
    return this.state.inventory
      .filter(
        (item) =>
          !urgentOnly ||
          (item.expiresInHours !== null && item.expiresInHours <= 48),
      )
      .map((item) => ({
        ...item,
        availableQuantity: item.quantity - item.reserved,
      }));
  }

  findMatches({ itemId, maxDistanceKm = 10 }: FindMatchInput): BuyerMatch[] {
    const item = this.state.inventory.find((entry) => entry.id === itemId);
    if (!item) throw new Error(`Inventory item "${itemId}" was not found.`);
    if (maxDistanceKm <= 0 || maxDistanceKm > 100) {
      throw new Error("maxDistanceKm must be between 0 and 100.");
    }

    const matches = this.state.matches
      .filter(
        (match) =>
          match.itemId === itemId && match.distanceKm <= maxDistanceKm,
      )
      .toSorted((left, right) => {
        const leftValue = left.matchScore - left.distanceKm * 2;
        const rightValue = right.matchScore - right.distanceKm * 2;
        return rightValue - leftValue;
      });

    return matches;
  }

  createDraft(input: DraftOfferInput): OfferDraft {
    const item = this.state.inventory.find(
      (entry) => entry.id === input.itemId,
    );
    if (!item) throw new Error(`Inventory item "${input.itemId}" was not found.`);

    const availableQuantity = item.quantity - item.reserved;
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
      throw new Error("quantity must be a positive whole number.");
    }
    if (input.quantity > availableQuantity) {
      throw new Error(
        `Only ${availableQuantity} ${item.unit} are available to offer.`,
      );
    }
    if (!Number.isFinite(input.pricePerUnit) || input.pricePerUnit < 1) {
      throw new Error("pricePerUnit must be a positive number.");
    }

    const match = input.matchId
      ? this.state.matches.find((entry) => entry.id === input.matchId)
      : null;
    if (input.matchId && (!match || match.itemId !== input.itemId)) {
      throw new Error("The selected demand match does not fit this item.");
    }

    const draft: OfferDraft = {
      id: newId("offer"),
      itemId: input.itemId,
      matchId: input.matchId ?? null,
      quantity: input.quantity,
      pricePerUnit: Math.round(input.pricePerUnit),
      note: input.note?.trim() || "Pickup details confirmed after approval.",
      status: "draft",
      createdBy: input.createdBy,
    };

    this.commit({
      ...this.state,
      selectedItemId: input.itemId,
      draft,
      activities: [
        this.activity(
          input.createdBy === "agent"
            ? "Agent prepared an offer"
            : "Offer draft created",
          `${input.quantity} ${item.unit} of ${item.name}. Waiting for your approval.`,
          input.createdBy,
        ),
        ...this.state.activities,
      ].slice(0, 8),
    });

    return draft;
  }

  publishDraft(): OfferDraft {
    const draft = this.state.draft;
    if (!draft) throw new Error("Create an offer draft before publishing.");
    if (draft.status !== "draft") throw new Error("This offer is already published.");

    const item = this.state.inventory.find((entry) => entry.id === draft.itemId)!;
    const published: OfferDraft = { ...draft, status: "published" };
    this.commit({
      ...this.state,
      draft: published,
      inventory: this.state.inventory.map((entry) =>
        entry.id === draft.itemId
          ? { ...entry, reserved: entry.reserved + draft.quantity }
          : entry,
      ),
      activities: [
        this.activity(
          "Offer approved and published",
          `${draft.quantity} ${item.unit} of ${item.name} are now visible to matched buyers.`,
          "human",
        ),
        ...this.state.activities,
      ].slice(0, 8),
    });
    return published;
  }

  discardDraft(): void {
    if (!this.state.draft) return;
    this.commit({
      ...this.state,
      draft: null,
      activities: [
        this.activity(
          "Draft discarded",
          "No inventory was reserved and nothing was published.",
          "human",
        ),
        ...this.state.activities,
      ].slice(0, 8),
    });
  }

  reset(): void {
    window.localStorage.removeItem(STORAGE_KEY);
    this.commit(createInitialState());
  }
}

export const marketStore = new MarketStore();

export function useMarketState(): MarketState {
  return useSyncExternalStore(
    marketStore.subscribe,
    marketStore.getSnapshot,
    marketStore.getSnapshot,
  );
}
