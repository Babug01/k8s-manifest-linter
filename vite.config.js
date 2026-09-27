import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves a project repo at /<repo-name>/, not the domain root —
// without this, the built index.html references /assets/... (root-absolute)
// and every asset 404s once deployed.
export default defineConfig({
  plugins: [react()],
  // Vercel serves from the domain root and sets VERCEL=1 during its builds.
  base: process.env.VERCEL ? "/" : "/k8s-manifest-linter/",
});
