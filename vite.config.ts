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

          // Some packages (e.g. detect-node-es) can be fully tree-shaken in the browser build.
          // If we force them into their own chunk, Rollup can emit an empty chunk warning.
          // Returning undefined lets Rollup place/prune it normally without creating an empty chunk.
          if (pkg === "detect-node-es") return;

          return pkg || "vendor";
        },
      },
    },
  },
}));
