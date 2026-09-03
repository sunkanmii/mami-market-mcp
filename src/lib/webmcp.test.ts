import { beforeEach, describe, expect, it, vi } from "vitest";
import { marketStore } from "./store";
import { registerMarketTools } from "./webmcp";

describe("WebMCP registration", () => {
  beforeEach(() => {
    marketStore.reset();
    window.localStorage.clear();
  });

  it("registers role-aware tools and returns labelled sandbox inventory without a profile", async () => {
    const registered: WebMCP.ModelContextTool[] = [];
    const registerTool = vi.fn(async (tool: WebMCP.ModelContextTool) => {
      registered.push(tool);
    });

    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool },
    });

    const unregister = await registerMarketTools();
    expect(registerTool).toHaveBeenCalledTimes(9);
    expect(registered.map((tool) => tool.name)).toEqual([
      "get_inventory",
      "show_inventory_item",
      "find_surplus_matches",
      "draft_surplus_offer",
      "get_trade_context",
      "get_my_requests",
      "find_stock_for_request",
      "review_incoming_offers",
      "draft_purchase_request",
    ]);

    const inventoryTool = registered.find((tool) => tool.name === "get_inventory")!;
    const result = (await inventoryTool.execute(
      { urgentOnly: true },
      { signal: new AbortController().signal },
    )) as { structuredContent: { items: Array<{ id: string }> } };

    expect(result.structuredContent.items).toHaveLength(2);
    expect(result.structuredContent.items[0].id).toBe("tomatoes-roma");
    unregister();
  });
});
