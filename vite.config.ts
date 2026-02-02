import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Basic vendor chunking to keep the main bundle from growing unbounded.
        // This also avoids the >500k warning for the single monolithic chunk.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          const parts = id.split("node_modules/")[1]?.split("/") || [];
          const pkg = parts[0]?.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
          return pkg || "vendor";
        },
      },
    },
  },
}));
