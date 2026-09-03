import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "PILOT_");
  // Remote data is opt-in. Otherwise use a separately running local Pages API.
  const apiTarget = env.PILOT_API_TARGET || "http://127.0.0.1:8788";
  return {
  plugins: [react()],
  server: { proxy: { "/api": { target: apiTarget, changeOrigin: true } } },
  preview: { proxy: { "/api": { target: apiTarget, changeOrigin: true } } },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
  };
});
