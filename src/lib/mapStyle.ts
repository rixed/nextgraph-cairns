// The map's style (Specs §6.2 S-22b, §8 "Offline — no degradation in P0").
//
// Spike 9's finding decides the shape of this file. A remote *style URL* is a
// single point of failure: when it cannot be fetched the map never finishes
// loading and the app cannot add its own layers at all — the user loses their
// own data along with the basemap. A local style object loads in 37 ms with no
// network whatsoever.
//
// So the style is always local, and the basemap is a raster *source* added on
// top of it. When the tiles do not come the map is a blank field with every
// point, pin and track on it, which is what §8 asks for. Offline basemaps stay
// the map library's business; there is no tile cache here.

import { setWorkerUrl } from "maplibre-gl";
// MapLibre v6 derives its worker URL from `import.meta.url`, which bundling
// invalidates — and the failure is silent: no error, no worker, and every
// source stays unloaded forever (SpikeFindings, spike 9). `?worker&url` rather
// than `?url`, because the worker imports maplibre-gl-shared.mjs and copying
// the single file just moves the failure one step along.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(workerUrl);

/**
 * Where the basemap tiles come from. A setting — eventually the user's, since
 * which server sees the coordinates of everywhere they have been is their
 * business, not this app's. Hard-coded until that screen exists.
 */
export const BASEMAP = {
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution: "© OpenStreetMap contributors",
    maxzoom: 19,
};

/** Colours, kept here so the layers and the legend cannot disagree. */
export const MAP_COLOURS = {
    memory: "#1c9e5a",
    media: "#2b6ee0",
    track: "#e05a2b",
    selected: "#c026d3",
};

/**
 * A style with the basemap when one is configured, and without it otherwise.
 * Both load offline: the raster source failing costs its tiles, nothing else.
 */
export function mapStyle(basemap = BASEMAP): any {
    const style: any = {
        version: 8,
        // No `glyphs`: a font server is a network dependency, so no layer here
        // may draw text. Labels come from the DOM instead when they are needed.
        sources: {},
        layers: [
            {
                id: "background",
                type: "background",
                paint: { "background-color": "#eef1f5" },
            },
        ],
    };
    if (basemap) {
        style.sources.basemap = {
            type: "raster",
            tiles: basemap.tiles,
            tileSize: 256,
            maxzoom: basemap.maxzoom,
            attribution: basemap.attribution,
        };
        style.layers.push({
            id: "basemap",
            type: "raster",
            source: "basemap",
        });
    }
    return style;
}
