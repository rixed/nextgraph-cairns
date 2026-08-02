// Geometry-shaped documents (Specs §5): "a map layer, and shown on a memory
// when times overlap". Foreign evidence like media — read, never written.
//
// Read by SPARQL rather than through a generated shape: the value the app needs
// is a WKT literal it parses itself, and a shape that returned it would add a
// subscription for one string. `make seed-foreign` writes some.

import { select } from "./query";

export interface Track {
    id: string;
    name?: string;
    /** GeoJSON order: [lon, lat]. */
    line: number[][];
    startMs?: number;
    endMs?: number;
}

/** `LINESTRING(lon lat, ...)` → coordinates. Anything else yields nothing. */
export function parseWkt(wkt: string): number[][] {
    if (!/^\s*LINESTRING/i.test(wkt)) return [];
    const open = wkt.indexOf("(");
    const close = wkt.lastIndexOf(")");
    if (open < 0 || close < open) return [];
    return wkt
        .slice(open + 1, close)
        .split(",")
        .map((p) => p.trim().split(/\s+/).map(Number))
        .filter((p) => p.length === 2 && p.every(Number.isFinite));
}

const ms = (v?: string) => {
    if (!v) return undefined;
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : undefined;
};

export async function loadTracks(): Promise<Track[]> {
    const rows = await select(
        `PREFIX gsp: <http://www.opengis.net/ont/geosparql#>
         PREFIX schema: <https://schema.org/>
         SELECT ?s ?w ?n ?from ?to WHERE { GRAPH ?g {
            ?s a gsp:Geometry ; gsp:asWKT ?w .
            OPTIONAL { ?s schema:name ?n }
            OPTIONAL { ?s schema:startDate ?from }
            OPTIONAL { ?s schema:endDate ?to }
         } }`
    );
    return rows
        .map((b: any) => ({
            id: b.s.value,
            name: b.n?.value,
            line: parseWkt(b.w.value),
            startMs: ms(b.from?.value),
            endMs: ms(b.to?.value),
        }))
        .filter((t) => t.line.length > 1);
}

/**
 * Tracks, loaded once per screen. No subscription: nothing in this app writes
 * a geometry, so the only way the set changes under us is another application
 * writing one, and a map that misses it until the next visit is no worse than
 * §8's "partially loaded" already allows.
 */
export function useTracks() {
    let all = $state<Track[]>([]);
    let ready = $state(false);
    loadTracks()
        .then((t) => (all = t))
        .catch((e) => console.error("tracks", e))
        .finally(() => (ready = true));
    return {
        get all() {
            return all;
        },
        get ready() {
            return ready;
        },
    };
}
