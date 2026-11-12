import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  worker: { format: "es" },
  test: { include: ["src/**/*.test.ts"] },
} as any);
