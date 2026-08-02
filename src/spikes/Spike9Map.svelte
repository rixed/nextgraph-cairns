<script lang="ts">
    // Spike 9 — does MapLibre work here, and what does it do without a network?
    //
    // The stack was decided in the README: MapLibre GL JS for the map. What was
    // never checked is whether it runs in *this* environment — a WASM engine in
    // the same tab, the app inside the auth server's iframe, and every scenario
    // driven through headless Chrome, where WebGL is not a given. If the map
    // cannot render headless, the map slice is the one screen no milestone can
    // regression-test, which is worth knowing before it is built rather than
    // after.
    //
    // The second question is §8's "Offline — no degradation in P0". Offline
    // basemaps are the map library's business, not this app's; what this spike
    // has to establish is only how MapLibre fails when the tiles do not come,
    // and whether the app's own points still draw when they don't.
    // v6 has no default export; the Map class is the only piece needed here.
    import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
    // MapLibre derives its worker URL from `import.meta.url`, expecting to be
    // loaded as dist/maplibre-gl.mjs with the worker file beside it. Bundled,
    // that resolves to /assets/maplibre-gl-worker.mjs, which does not exist —
    // and the failure is silent: no error, no worker, and every source stays
    // unloaded forever.
    //
    // `?worker&url` and not `?url`: the worker imports maplibre-gl-shared.mjs,
    // so copying the one file leaves it importing something that was never
    // emitted — the same silent failure one step further along.
    import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
    setWorkerUrl(workerUrl);
    import "maplibre-gl/dist/maplibre-gl.css";
    import { MapLibre } from "svelte-maplibre-gl";
    import { select, fmt } from "./spikeUtils";

    // MapLibre's own demo tiles: a public style, good enough to answer whether
    // the library works. Which provider ships in P0 is a separate decision.
    const DEMO_STYLE = "https://demotiles.maplibre.org/style.json";

    /**
     * A style with no network sources at all — the app's own points on a plain
     * background. If this renders, "no basemap" is a one-line configuration
     * change rather than a fallback path to write.
     */
    const BARE_STYLE: any = {
        version: 8,
        sources: {},
        layers: [
            {
                id: "bg",
                type: "background",
                paint: { "background-color": "#eef1f5" },
            },
        ],
    };

    let log = $state<string[]>([]);
    let wrapperOn = $state(false);
    // Numbered, so a driver waiting on the log can tell one plot from the next.
    let plots = 0;
    let container: HTMLDivElement;
    let map: MapLibreMap | undefined;

    const say = (s: string) => {
        log = [...log, s];
        console.log("[spike9]", s);
    };

    function webglInfo(): string {
        const c = document.createElement("canvas");
        const gl = (c.getContext("webgl2") ??
            c.getContext("webgl")) as WebGLRenderingContext | null;
        if (!gl) return "no WebGL context at all";
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        const renderer = dbg
            ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER);
        return `${gl instanceof WebGL2RenderingContext ? "webgl2" : "webgl1"} — ${renderer}`;
    }

    /** Mount a map and resolve when it is loaded, or report why it never was. */
    function mount(style: any, label: string): Promise<void> {
        map?.remove();
        map = undefined;
        return new Promise((resolve) => {
            const t0 = performance.now();
            let settled = false;
            const done = (how: string) => {
                if (settled) return;
                settled = true;
                say(`${label}: ${how} after ${fmt(performance.now() - t0)}`);
                resolve();
            };
            try {
                map = new MapLibreMap({
                    container,
                    style,
                    center: [-9.1393, 38.7223],
                    zoom: 9,
                    attributionControl: false,
                });
            } catch (e) {
                return done(`THREW on construction — ${e}`);
            }
            // Every error the library reports, not just the fatal one: a failed
            // tile request surfaces here and nowhere else.
            map.on("error", (e: any) =>
                say(`  [error] ${e?.error?.message ?? e?.error ?? "unknown"}`)
            );
            map.on("dataabort", (e: any) => say(`  [dataabort] ${e.sourceId}`));
            map.on("load", () => done("loaded"));
            setTimeout(() => done("NEVER loaded (25s)"), 25000);
        });
    }

    async function step1() {
        say(`WebGL: ${webglInfo()}`);
        say(`worker: ${workerUrl}`);
        await mount(DEMO_STYLE, "demo basemap");
    }

    // ------------------------------------------------------------ the store

    /** `LINESTRING(lon lat, ...)` → GeoJSON coordinates. */
    function parseWkt(wkt: string): number[][] {
        const inner = wkt.slice(wkt.indexOf("(") + 1, wkt.lastIndexOf(")"));
        return inner
            .split(",")
            .map((p) => p.trim().split(/\s+/).map(Number))
            .filter((p) => p.length === 2 && p.every(Number.isFinite));
    }

    const fc = (features: any[]) => ({
        type: "FeatureCollection" as const,
        features,
    });

    /** Everything in the store that has coordinates the app can read. */
    async function loadData() {
        const t0 = performance.now();
        const [media, places, tracks] = await Promise.all([
            select(`PREFIX schema: <https://schema.org/>
                    PREFIX exif: <http://www.w3.org/2003/12/exif/ns#>
                    SELECT ?s ?lat ?lon WHERE { GRAPH ?g {
                       ?s a schema:ImageObject ;
                          exif:gpsLatitude ?lat ; exif:gpsLongitude ?lon } }`),
            select(`PREFIX schema: <https://schema.org/>
                    PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
                    SELECT ?s ?n ?lat ?lon WHERE { GRAPH ?g {
                       ?s a schema:Place ; geo:lat ?lat ; geo:long ?lon .
                       OPTIONAL { ?s schema:name ?n } } }`),
            select(`PREFIX gsp: <http://www.opengis.net/ont/geosparql#>
                    SELECT ?s ?w WHERE { GRAPH ?g {
                       ?s a gsp:Geometry ; gsp:asWKT ?w } }`),
        ]);
        say(
            `queried the store in ${fmt(performance.now() - t0)}: ` +
                `${media.length} media points, ${places.length} places, ${tracks.length} tracks`
        );
        return {
            media: fc(
                media.map((b: any) => ({
                    type: "Feature",
                    geometry: {
                        type: "Point",
                        coordinates: [+b.lon.value, +b.lat.value],
                    },
                    properties: {},
                }))
            ),
            places: fc(
                places.map((b: any) => ({
                    type: "Feature",
                    geometry: {
                        type: "Point",
                        coordinates: [+b.lon.value, +b.lat.value],
                    },
                    properties: { name: b.n?.value ?? "" },
                }))
            ),
            tracks: fc(
                tracks.map((b: any) => ({
                    type: "Feature",
                    geometry: {
                        type: "LineString",
                        coordinates: parseWkt(b.w.value),
                    },
                    properties: {},
                }))
            ),
        };
    }

    /**
     * The three layers §6.2 asks for, at their real densities: media clustered
     * (the only one that grows without bound), places as pins, tracks as lines.
     * Clustering is MapLibre's own, which is the point of using it.
     */
    async function step2() {
        if (!map) return say("mount a map first");
        const data = await loadData();
        const t0 = performance.now();
        try {
            map.addSource("media", {
                type: "geojson",
                data: data.media as any,
                cluster: true,
                clusterRadius: 50,
            });
            map.addSource("places", { type: "geojson", data: data.places as any });
            map.addSource("tracks", { type: "geojson", data: data.tracks as any });

            map.addLayer({
                id: "tracks",
                type: "line",
                source: "tracks",
                paint: { "line-color": "#e05a2b", "line-width": 3 },
            });
            map.addLayer({
                id: "clusters",
                type: "circle",
                source: "media",
                filter: ["has", "point_count"],
                paint: {
                    "circle-color": "#2b6ee0",
                    "circle-radius": [
                        "step",
                        ["get", "point_count"],
                        14, 10, 20, 50, 28,
                    ],
                    "circle-opacity": 0.8,
                },
            });
            map.addLayer({
                id: "cluster-count",
                type: "symbol",
                source: "media",
                filter: ["has", "point_count"],
                layout: {
                    "text-field": ["get", "point_count_abbreviated"],
                    "text-size": 12,
                },
                paint: { "text-color": "#fff" },
            });
            map.addLayer({
                id: "media-point",
                type: "circle",
                source: "media",
                filter: ["!", ["has", "point_count"]],
                paint: {
                    "circle-color": "#2b6ee0",
                    "circle-radius": 5,
                    "circle-opacity": 0.9,
                },
            });
            map.addLayer({
                id: "places",
                type: "circle",
                source: "places",
                paint: {
                    "circle-color": "#1c9e5a",
                    "circle-radius": 7,
                    "circle-stroke-width": 2,
                    "circle-stroke-color": "#fff",
                },
            });
            say(`added 3 sources and 5 layers in ${fmt(performance.now() - t0)}`);

            // Did anything actually reach the GPU? A layer that added cleanly
            // and renders nothing is the failure this has to catch — and
            // MapLibre parses GeoJSON in a web worker, so "no features" and
            // "no error" together point at the worker, not at the data.
            await new Promise((r) => setTimeout(r, 3000));
            const canvas = map.getCanvas();
            say(
                `  canvas ${canvas.width}x${canvas.height}, ` +
                    `style loaded ${map.isStyleLoaded()}, ` +
                    `layers [${map.getStyle().layers.map((l: any) => l.id).join(", ")}]`
            );
            for (const id of ["media", "places", "tracks"])
                say(
                    `  source ${id}: loaded ${map.isSourceLoaded(id)}, ` +
                        `${(map.getSource(id) as any)?._data?.features?.length ?? "?"} features in`
                );
            const b = map.getBounds();
            say(
                `  viewport ${b.getWest().toFixed(3)},${b.getSouth().toFixed(3)} → ` +
                    `${b.getEast().toFixed(3)},${b.getNorth().toFixed(3)}`
            );
            const rendered = map.queryRenderedFeatures(undefined, {
                layers: ["clusters", "media-point", "places", "tracks"],
            });
            const src = map.querySourceFeatures("media");
            say(
                `plot #${++plots}: ${rendered.length} features rendered, ` +
                    `${src.length} media features in the source tiles`
            );
        } catch (e) {
            say(`plot #${++plots}: ERROR adding layers: ${e}`);
        }
    }

    /** The same data with no network sources whatsoever. */
    async function step3() {
        await mount(BARE_STYLE, "bare style, no basemap");
        await step2();
    }

    /** Whatever the driver has blocked, mounted again so the failure shows. */
    async function step4() {
        await mount(DEMO_STYLE, "demo basemap, tiles blocked");
        await step2();
    }

    function step5() {
        map?.remove();
        map = undefined;
        wrapperOn = !wrapperOn;
        say(
            wrapperOn
                ? "mounted svelte-maplibre-gl's <MapLibre> on the bare style"
                : "unmounted the wrapper"
        );
    }
</script>

<div>
    <h2 class="text-lg font-semibold">Spike 9 — MapLibre in this app</h2>

    <div class="flex flex-wrap items-end gap-2 my-2">
        <button class="btn btn-sm" onclick={step1}>1 · demo basemap</button>
        <button class="btn btn-sm" onclick={step2}>2 · plot the store</button>
        <button class="btn btn-sm" onclick={step3}>3 · no basemap at all</button>
        <button class="btn btn-sm" onclick={step4}>4 · with tiles blocked</button>
        <button class="btn btn-sm" onclick={step5}>5 · the Svelte wrapper</button>
    </div>

    <div
        bind:this={container}
        class="w-full h-96 rounded border"
        class:hidden={wrapperOn}
    ></div>

    {#if wrapperOn}
        <div class="w-full h-96 rounded border overflow-hidden">
            <MapLibre
                style={BARE_STYLE}
                center={[-9.1393, 38.7223]}
                zoom={9}
                class="w-full h-full"
                onload={() => say("  wrapper reported load")}
                onerror={(e: any) =>
                    say(`  wrapper [error] ${e?.error?.message ?? e}`)}
            />
        </div>
    {/if}

    <pre class="text-xs bg-base-200 p-2 rounded max-h-72 overflow-y-auto mt-2">{log.join("\n")}</pre>
</div>
