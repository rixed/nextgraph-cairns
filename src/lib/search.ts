// S-02 Search (§6.2): free text over everything, results grouped by type.
//
// No index (Appendix A, B-08). The `search-probe` step measured what SPARQL
// alone can do against the real store, and two of its findings shape this file:
// one query returns every hit **with its types**, so grouping is a single
// round-trip; and constraining that query to memories cost about three times
// the unconstrained scan, because the planner does worse with the extra join.
// So the query asks for every literal that matches, and the classifying happens
// here, in the app.
//
// What is missing is ranking, not expressiveness: `CONTAINS` is substring
// matching, so "walked" does not find "walking", and the engine returns hits in
// whatever order it likes. Time is therefore the order, which is a claim this
// app can stand behind — an archive is chronological — rather than a relevance
// score it would be inventing.

import { escapeLiteral } from "./typedLiterals";

export type Kind =
    | "memory"
    | "place"
    | "person"
    | "tag"
    | "event"
    | "recommendation"
    | "other";

export interface Hit {
    /** The subject that matched — a document, or a subject inside one. */
    id: string;
    /** The document it lives in, which is what a memory is keyed by. */
    graph: string;
    types: string[];
    kind: Kind;
    /** One literal that matched, for showing why this is here. */
    snippet?: string;
}

const APP = "did:ng:z:cairns/";
const SCHEMA = "https://schema.org/";
const FOAF = "http://xmlns.com/foaf/0.1/";
const SKOS = "http://www.w3.org/2004/02/skos/core#";

/**
 * Which of §6.2's groups a hit belongs to. Order matters: a memory is a
 * `schema:Event` too (§3), and a recommendation is a `schema:ListItem`, so the
 * app's own types are asked about first. Anything else is "other" rather than
 * dropped — a store this app does not model is still the user's, and §8's rule
 * is to annotate rather than hide.
 */
export function classify(types: string[]): Kind {
    const has = (t: string) => types.includes(t);
    if (has(`${APP}Memory`)) return "memory";
    if (has(`${APP}Recommendation`)) return "recommendation";
    if (has(`${SKOS}Concept`)) return "tag";
    if (has(`${SCHEMA}Place`)) return "place";
    if (has(`${FOAF}Person`) || has(`${SCHEMA}Person`)) return "person";
    if (has(`${SCHEMA}Event`)) return "event";
    return "other";
}

/**
 * Every literal in the store containing the needle, with its subject's types.
 *
 * `LCASE` on both sides rather than `REGEX(…, "i")`: the probe measured them
 * as equally fast, and a needle is user input — a regex would let a stray `(`
 * turn a search into an error.
 */
export function searchQuery(needle: string): string {
    const n = escapeLiteral(needle.toLowerCase());
    return `SELECT ?s ?g
                   (GROUP_CONCAT(DISTINCT STR(?t); separator=" ") AS ?types)
                   (SAMPLE(?lit) AS ?snippet)
            WHERE { GRAPH ?g {
               ?s ?p ?lit .
               FILTER(isLiteral(?lit) && CONTAINS(LCASE(STR(?lit)), "${n}"))
               OPTIONAL { ?s a ?t }
            } }
            GROUP BY ?s ?g`;
}

/** Below this a search is not yet a search, and would match the whole store. */
export const MIN_NEEDLE = 2;

export function toHits(rows: any[]): Hit[] {
    return rows.map((b) => {
        const types = (b.types?.value ?? "").split(" ").filter(Boolean);
        return {
            id: b.s.value,
            graph: b.g.value,
            types,
            kind: classify(types),
            snippet: b.snippet?.value,
        };
    });
}

export interface Group {
    kind: Kind;
    hits: Hit[];
}

export const KIND_ORDER: Kind[] = [
    "memory",
    "place",
    "person",
    "tag",
    "event",
    "recommendation",
    "other",
];

export const KIND_LABELS: Record<Kind, string> = {
    memory: "Memories",
    place: "Places",
    person: "People",
    tag: "Tags",
    event: "Public events",
    recommendation: "Recommendations",
    other: "Elsewhere in your store",
};

/**
 * Grouped by type, and within a group newest first — undated last, never
 * dropped. `timeOf` is supplied by the screen, which already holds the objects
 * these hits point at: the query returns what matched, the app knows what it
 * means.
 */
export function groupHits(
    hits: Hit[],
    timeOf: (h: Hit) => number | undefined
): Group[] {
    const by = new Map<Kind, Hit[]>();
    for (const h of hits) by.set(h.kind, [...(by.get(h.kind) ?? []), h]);
    return KIND_ORDER.filter((k) => by.has(k)).map((kind) => ({
        kind,
        hits: by.get(kind)!.sort((a, b) => {
            const ta = timeOf(a);
            const tb = timeOf(b);
            if (ta === undefined || tb === undefined)
                return ta === undefined ? (tb === undefined ? 0 : 1) : -1;
            return tb - ta;
        }),
    }));
}

/**
 * The part of a snippet worth showing: the needle in its sentence, not the
 * first line of a narrative that mentions it at the end.
 */
export function excerpt(text: string, needle: string, width = 90): string {
    const at = text.toLowerCase().indexOf(needle.toLowerCase());
    if (at < 0 || text.length <= width) return text.slice(0, width);
    const from = Math.max(0, at - Math.floor((width - needle.length) / 2));
    return `${from > 0 ? "…" : ""}${text.slice(from, from + width).trim()}${
        from + width < text.length ? "…" : ""
    }`;
}
