import { marketStore } from "./store";

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
            "Returns the trader's current inventory, availability, price, and freshness window. Use urgentOnly to focus on perishable stock that should move within 48 hours.",
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
          execute(input) {
            const { urgentOnly = false } = input as InventoryInput;
            const items = marketStore.listInventory(urgentOnly);
            return response(
              `Found ${items.length} inventory ${items.length === 1 ? "item" : "items"}.`,
              { items },
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
            "Focuses the visible Trader Network workspace on one inventory item so the trader and agent review the same stock together.",
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
          execute(input) {
            const { itemId } = input as FocusInput;
            marketStore.selectItem(itemId, "agent");
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
            "Returns verified nearby buyers who currently need a specific inventory item. This is a read-only lookup; use show_inventory_item separately when the trader should review that stock in the visible workspace.",
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
                description: "Maximum buyer distance in kilometres.",
              },
            },
            required: ["itemId"],
          },
          annotations: { readOnlyHint: true },
          execute(input) {
            const { itemId, maxDistanceKm = 10 } = input as MatchInput;
            const matches = marketStore.findMatches({ itemId, maxDistanceKm });
            return response(
              `Found ${matches.length} verified demand ${matches.length === 1 ? "match" : "matches"} within ${maxDistanceKm} km.`,
              { matches },
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
            "Prepares a reversible offer draft in the visible workspace. This tool never publishes or reserves inventory; the trader must review and approve the draft in the page.",
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
          execute(input) {
            const draft = marketStore.createDraft({
              ...(input as DraftInput),
              createdBy: "agent",
            });
            return response(
              "Draft prepared. Ask the trader to review and approve it in the visible workspace; nothing has been published yet.",
              { draft, requiresHumanApproval: true },
            );
          },
        },
        options,
      ),
    ]);

    marketStore.setWebMcpStatus("connected");
  } catch (error) {
    controller.abort();
    marketStore.setWebMcpStatus("unavailable");
    console.error("WebMCP tool registration failed", error);
  }

  return () => controller.abort();
}
