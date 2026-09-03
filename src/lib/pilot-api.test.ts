import { afterEach, expect, it, vi } from "vitest";
import { pilotApi } from "./pilot-api";
afterEach(() => vi.restoreAllMocks());
it("rejects an HTML fallback instead of treating it as an empty network", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<!doctype html><html></html>", { headers: { "content-type": "text/html" } }));
  await expect(pilotApi.getNetwork()).rejects.toThrow(/local app cannot reach|unexpected response/);
});
it("preserves actionable backend errors", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "The pilot access code is missing or incorrect." }), {status: 401, headers: { "content-type": "application/json" } }));
  await expect(pilotApi.getNetwork()).rejects.toThrow("access code");
});
it("loads valid live network data", async () => {
  const data = { source: "cloudflare-d1", inventory: [], demands: [], offers: [], participants: [], activities: [] };
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } }));
  expect(await pilotApi.getNetwork()).toEqual(data);
});
