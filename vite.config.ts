import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
    plugins: [svelte(), tailwindcss(), wasm(), topLevelAwait()],
    build: {
        target: "esnext",
    },
    // MapLibre creates its worker as a module worker; bundling it as an ES
    // module keeps its own imports resolvable (see Spike9Map.svelte).
    worker: {
        format: "es",
    },
    server: {
        port: 4567,
        strictPort: true,
    },
    preview: {
        port: 4567,
        strictPort: true,
    },
    envPrefix: ["VITE_", "NG_"],
});
