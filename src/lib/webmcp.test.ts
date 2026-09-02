import { beforeEach, describe, expect, it, vi } from "vitest";
import { marketStore } from "./store";
import { registerMarketTools } from "./webmcp";

describe("WebMCP registration", () => {
  beforeEach(() => {
    marketStore.reset();
  });

  it("registers four focused tools and returns structured urgent inventory", async () => {
    const registered: WebMCP.ModelContextTool[] = [];
    const registerTool = vi.fn(async (tool: WebMCP.ModelContextTool) => {
      registered.push(tool);
    });

    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool },
    });

    const unregister = await registerMarketTools();
    expect(registerTool).toHaveBeenCalledTimes(4);
    expect(registered.map((tool) => tool.name)).toEqual([
      "get_inventory",
      "show_inventory_item",
      "find_surplus_matches",
      "draft_surplus_offer",
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
