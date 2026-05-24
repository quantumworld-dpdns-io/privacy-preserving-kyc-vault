import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@kyc-vault/core": path.resolve(__dirname, "../../packages/core/src"),
      "@kyc-vault/did": path.resolve(__dirname, "../../packages/did/src"),
      "@kyc-vault/zkp": path.resolve(__dirname, "../../packages/zkp/src"),
      "@kyc-vault/crypto": path.resolve(__dirname, "../../packages/crypto/src"),
      "@kyc-vault/api": path.resolve(__dirname, "../../packages/api/src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
