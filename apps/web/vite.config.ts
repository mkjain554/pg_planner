import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/recharts/") || id.includes("/node_modules/d3-") || id.includes("/node_modules/victory-vendor/")) return "charts";
          if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/")) return "react-vendor";
          if (id.includes("/node_modules/@tanstack/") || id.includes("/node_modules/react-router")) return "app-vendor";
          if (id.includes("/node_modules/lucide-react/")) return "icons";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
