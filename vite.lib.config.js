import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Library build: bundles src/lib into a single ESM file under dist/.
// The library has no runtime dependencies, so nothing is externalized.
// Type declarations are emitted separately by `tsc -p tsconfig.lib.json`.
export default defineConfig({
    build: {
        outDir: "dist",
        emptyOutDir: true,
        minify: false,
        sourcemap: true,
        lib: {
            entry: fileURLToPath(new URL("./src/lib/index.ts", import.meta.url)),
            formats: ["es"],
            fileName: "index",
        },
    },
});
