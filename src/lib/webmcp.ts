import { marketStore } from "./store";
import { pilotApi, type PilotInventory } from "./pilot-api";
import { buyerTools } from "./buyer-tools";

interface InventoryInput extends Record<string, unknown> {
  urgentOnly?: boolean;
}

interface MatchInput extends Record<string, unknown> {
  itemId: string;
  maxDistanceKm?: number;
}

interface FocusInput extends Record<string, unknown> {
  itemId: string;
}

interface DraftInput extends Record<string, unknown> {
  itemId: string;
  quantity: number;
  pricePerUnit: number;
  matchId?: string;
  note?: string;
}

function response(message: string, data: unknown) {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: data,
  };
}

function openIllustrativeWorkspace(): void {
  window.dispatchEvent(new Event("trader-network:open-demo"));
}

function liveTrader() {
  const profile = pilotApi.loadProfile();
  if (profile && profile.role !== "trader") throw new Error("Seller-only tool. This device is registered as a buyer; use get_my_requests, find_stock_for_request, review_incoming_offers, or draft_purchase_request. No illustrative data was used.");
  return profile?.role === "trader" ? profile : null;
}

function liveExpiryHours(item: PilotInventory): number | null {
  if (!item.availableUntil) return null;
  return Math.max(0, Math.round((new Date(item.availableUntil).getTime() - Date.now()) / 3_600_000));
}

export async function registerMarketTools(): Promise<() => void> {
  const modelContext = document.modelContext;
  if (!modelContext) {
    marketStore.setWebMcpStatus("unavailable");
    return () => undefined;
  }

  const controller = new AbortController();
  const options = { signal: controller.signal };

  try {
    await Promise.all([
      modelContext.registerTool(
        {
          name: "get_inventory",
          title: "Review trader inventory",
          description:
            "Seller only (or illustrative sandbox without a profile). Returns the trader's inventory, availability, price, and freshness window. Use urgentOnly for perishable stock within 48 hours. Buyers must use find_stock_for_request.",
          inputSchema: {
            type: "object",
            properties: {
              urgentOnly: {
                type: "boolean",
                description:
                  "When true, only return goods with 48 hours or less in their freshness window.",
                default: false,
              },
            },
          },
          annotations: { readOnlyHint: true },
          async execute(input) {
            const { urgentOnly = false } = input as InventoryInput;
            const trader = liveTrader();
            if (trader) {
              const snapshot = await pilotApi.getNetwork();
              const items = snapshot.inventory
                .filter((item) => item.traderId === trader.id)
                .filter((item) => ["available", "partially_matched"].includes(item.status))
                .filter((item) => {
                  const hours = liveExpiryHours(item);
                  return !urgentOnly || (hours !== null && hours <= 48);
                })
                .map((item) => ({ ...item, expiresInHours: liveExpiryHours(item) }));
              return response(
                `Found ${items.length} live inventory ${items.length === 1 ? "item" : "items"} for ${trader.displayName}.`,
                { source: "cloudflare-d1", items },
              );
            }
            const items = marketStore.listInventory(urgentOnly);
            return response(
              `Found ${items.length} inventory ${items.length === 1 ? "item" : "items"}.`,
              { source: "illustrative-demo", items },
            );
          },
        },
        options,
      ),
      modelContext.registerTool(
        {
          name: "show_inventory_item",
          title: "Show an inventory item",
          description:
            "Seller only (or illustrative sandbox without a profile). Shows the workspace containing the selected stock so the trader and agent can review it together.",
          inputSchema: {
            type: "object",
            properties: {
              itemId: {
                type: "string",
                description: "The inventory item ID returned by get_inventory.",
              },
            },
            required: ["itemId"],
          },
          async execute(input) {
            const { itemId } = input as FocusInput;
            const trader = liveTrader();
            if (trader) {
              const snapshot = await pilotApi.getNetwork();
              const item = snapshot.inventory.find(
                (entry) => entry.id === itemId && entry.traderId === trader.id,
              );
              if (!item) throw new Error(`Live inventory item "${itemId}" was not found for this trader.`);
              document.getElementById("pilot")?.scrollIntoView({ behavior: "smooth", block: "start" });
              return response("The live pilot workspace is now visible for review.", {
                source: "cloudflare-d1",
                selectedItemId: itemId,
                item,
              });
            }
            marketStore.selectItem(itemId, "agent");
            openIllustrativeWorkspace();
            return response("The item is now visible in the shared workspace.", {
              selectedItemId: itemId,
            });
          },
        },
        options,
      ),
      modelContext.registerTool(
        {
          name: "find_surplus_matches",
          title: "Find nearby demand",
          description:
            "Seller only (or illustrative sandbox without a profile). Returns compatible buyer demand for the trader's stock using D1 records. This is a read-only lookup; live areas are labels, not measured distances.",
          inputSchema: {
            type: "object",
            properties: {
              itemId: {
                type: "string",
                description: "The inventory item ID returned by get_inventory.",
              },
              maxDistanceKm: {
                type: "number",
                minimum: 0.1,
                maximum: 100,
                default: 10,
                description: "Illustrative sandbox only. Live matching uses area labels, not measured distances; this parameter does not filter live records.",
              },
            },
            required: ["itemId"],
          },
          annotations: { readOnlyHint: true },
          async execute(input) {
            const { itemId, maxDistanceKm = 10 } = input as MatchInput;
            const trader = liveTrader();
            if (trader) {
              const snapshot = await pilotApi.getNetwork();
              if (!snapshot.inventory.some((item) => item.id === itemId && item.traderId === trader.id)) throw new Error("This stock does not belong to the current trader.");
              const { matches } = await pilotApi.getMatches(itemId);
              return response(
                `Found ${matches.length} compatible live ${matches.length === 1 ? "request" : "requests"}.`,
                { source: "cloudflare-d1", matches },
              );
            }
            const matches = marketStore.findMatches({ itemId, maxDistanceKm });
            return response(
              `Found ${matches.length} illustrative demand ${matches.length === 1 ? "match" : "matches"} within ${maxDistanceKm} km.`,
              { source: "illustrative-demo", matches },
            );
          },
        },
        options,
      ),
      modelContext.registerTool(
        {
          name: "draft_surplus_offer",
          title: "Prepare a surplus offer",
          description:
            "Seller only (or illustrative sandbox without a profile). Prepares a reversible offer draft in the visible workspace. Never sends or reserves inventory; the trader must review and approve it in the page.",
          inputSchema: {
            type: "object",
            properties: {
              itemId: {
                type: "string",
                description: "The inventory item to offer.",
              },
              quantity: {
                type: "integer",
                minimum: 1,
                description: "Whole number of units to offer.",
              },
              pricePerUnit: {
                type: "number",
                minimum: 1,
                description: "Offer price per unit in Nigerian naira.",
              },
              matchId: {
                type: "string",
                description:
                  "Optional demand match ID returned by find_surplus_matches.",
              },
              note: {
                type: "string",
                maxLength: 180,
                description: "Optional pickup or condition note.",
              },
            },
            required: ["itemId", "quantity", "pricePerUnit"],
          },
          async execute(input) {
            const values = input as DraftInput;
            const trader = liveTrader();
            if (trader) {
              if (!values.matchId) throw new Error("A live demand match ID is required.");
              const { matches } = await pilotApi.getMatches(values.itemId);
              const match = matches.find((entry) => entry.demandId === values.matchId);
              if (!match) throw new Error("The live demand match is no longer available.");
              await pilotApi.createOffer({
                inventoryId: values.itemId,
                demandId: values.matchId,
                actorId: trader.id,
                quantity: values.quantity,
                pricePerUnit: values.pricePerUnit,
                pickupWindow: `By ${new Date(match.neededBy).toLocaleString("en-NG")}`,
                note: values.note,
                createdBy: "agent",
              });
              window.dispatchEvent(new Event("trader-network:changed"));
              document.getElementById("pilot")?.scrollIntoView({ behavior: "smooth", block: "start" });
              return response(
                "Live offer draft prepared in D1. Ask the trader to review and send it from the visible pilot workspace; nothing has been sent yet.",
                { source: "cloudflare-d1", requiresHumanApproval: true },
              );
            }
            const draft = marketStore.createDraft({
              ...values,
              createdBy: "agent",
            });
            openIllustrativeWorkspace();
            return response(
              "Draft prepared. Ask the trader to review and approve it in the visible workspace; nothing has been published yet.",
              { draft, requiresHumanApproval: true },
            );
          },
        },
        options,
      ),
      ...buyerTools().map((tool) => modelContext.registerTool(tool, options)),
    ]);

    marketStore.setWebMcpStatus("connected");
  } catch (error) {
    controller.abort();
    marketStore.setWebMcpStatus("unavailable");
    console.error("WebMCP tool registration failed", error);
  }

  return () => controller.abort();
}
