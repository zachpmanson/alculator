import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Never expose runtime environment variables (including REPORT_ADMIN_PASSWORD).
  envPrefix: [],
  build: { outDir: "internal/web/dist", emptyOutDir: true },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:18080", "/healthz": "http://127.0.0.1:18080" },
  },
});
