import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Separate entry and build output; do not alter production routes or vite.config.js.
export default defineConfig({
  root: fileURLToPath(new URL("../../../", import.meta.url)),
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5175, strictPort: true },
  build: {
    outDir: "dist/quotation-grouping-test", emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL("../../../quotation-grouping-test.html", import.meta.url)) },
  },
});
