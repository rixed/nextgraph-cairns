// The browse filter itself (§6.2): what a facet is, and what it lets through.
//
// Pure functions over plain data, kept apart from the store in
// browse.svelte.ts for the same reason media.ts is kept apart from
// mediaFeed.svelte.ts — a predicate this central should be testable without a
// session, a subscription or a browser.

import {
    interval,
    parsePrecisionDate,
    type Interval,
    type PrecisionDate,
} from "./dates";
import { mediaInSpan, spanOf, takenAtMs, type Media } from "./media";
import { isWithin, type Place } from "./places";
import { findPerson, personKey, type Person } from "./people";
import type { Memory } from "../shapes/orm/memoryShape.typings";

export type Projection = "time" | "space" | "media";

export interface Facets {
    from?: PrecisionDate;
    to?: PrecisionDate;
    tags: string[];
    /** Any of the chosen tags, or all of them (§6.2). */
    tagMode: "any" | "all";
    /** A place IRI; matches memories located there or anywhere under it. */
    place?: string;
    /**
     * A person *key* rather than an IRI (see `personKey`): a memory matches
     * when anyone it names resolves to the same person, so a companion is one
     * facet whether or not their bare names have been promoted yet (§3.3).
     */
    person?: string;
    hasMedia: boolean;
    /**
     * An explicit set of memory documents, which is how S-02 hands its results
     * to the browse shell (§6.2). Not a facet the filter bar offers: the other
     * five describe a property of a memory, this one names memories, and it
     * exists so that a text search — which browse cannot express — can still
     * become a bulk tagging operation.
     */
    docs?: string[];
}

/** Everything the predicate needs that is not the memory itself. */
export interface MatchContext {
    media: Media[];
    places: Place[];
    people: Person[];
    isSuppressed: (memoryDoc: string, mediaDoc: string) => boolean;
}

export const emptyFacets = (): Facets => ({
    tags: [],
    tagMode: "any",
    hasMedia: false,
});

export type FacetName =
    | "date"
    | "tags"
    | "place"
    | "person"
    | "hasMedia"
    | "docs";

export function activeFacets(f: Facets): FacetName[] {
    const out: FacetName[] = [];
    if (f.from || f.to) out.push("date");
    if (f.tags.length) out.push("tags");
    if (f.place) out.push("place");
    if (f.person) out.push("person");
    if (f.hasMedia) out.push("hasMedia");
    if (f.docs) out.push("docs");
    return out;
}

export const FACET_LABELS: Record<FacetName, string> = {
    date: "the date range",
    tags: "the tags",
    place: "the place",
    person: "who was there",
    hasMedia: "has photographs",
    docs: "the search results",
};

/** The same facet, dropped — used by the filter bar and by `blame`. */
export function without(f: Facets, facet: FacetName): Facets {
    const relaxed: Facets = { ...f, tags: [...f.tags] };
    if (facet === "date") relaxed.from = relaxed.to = undefined;
    else if (facet === "tags") relaxed.tags = [];
    else if (facet === "place") relaxed.place = undefined;
    else if (facet === "person") relaxed.person = undefined;
    else if (facet === "docs") relaxed.docs = undefined;
    else relaxed.hasMedia = false;
    return relaxed;
}

/** The window the date facet describes, at the precision it was given (§3.1). */
export function filterWindow(f: Facets): Interval | undefined {
    if (!f.from && !f.to) return undefined;
    const from = f.from ? interval(f.from) : undefined;
    const to = f.to ? interval(f.to) : undefined;
    return {
        earliest: from?.earliest ?? -Infinity,
        latest: to?.latest ?? Infinity,
    };
}

/** The photographs a memory shows: attached, or overlapping and not refused. */
export function mediaOf(m: Memory, ctx: MatchContext): Media[] {
    const doc = m["@graph"];
    const explicit = [...(m.subjectOf ?? [])];
    const span = spanOf(m.startDate, m.endDate);
    const byOverlap = span
        ? mediaInSpan(ctx.media, span).filter(
              (x) => !ctx.isSuppressed(doc, x.doc)
          )
        : [];
    const wanted = new Set([...explicit, ...byOverlap.map((x) => x.doc)]);
    return ctx.media.filter((x) => wanted.has(x.doc));
}

/** Does this memory pass the filter as it stands? */
export function matches(m: Memory, f: Facets, ctx: MatchContext): boolean {
    if (f.docs && !f.docs.includes(m["@graph"])) return false;
    const window = filterWindow(f);
    if (window) {
        const start = parsePrecisionDate(m.startDate);
        if (!start) return false;
        const span = spanOf(m.startDate, m.endDate) ?? interval(start);
        // Overlap, not containment: a memory of a whole year belongs to any
        // month of it, which is the same rule the collation uses (§3.1).
        if (span.latest < window.earliest || span.earliest > window.latest)
            return false;
    }
    if (f.tags.length) {
        const subjects = m.subject ?? new Set<string>();
        const hit = f.tags.filter((t) => subjects.has(t));
        if (f.tagMode === "all" ? hit.length !== f.tags.length : !hit.length)
            return false;
    }
    if (f.place) {
        const here = [...(m.location ?? [])].some((iri) =>
            isWithin(ctx.places, iri, f.place!)
        );
        if (!here) return false;
    }
    if (f.person) {
        const there = [...(m.attendee ?? [])].some(
            (iri) => personKey(findPerson(ctx.people, iri), iri) === f.person
        );
        if (!there) return false;
    }
    if (f.hasMedia && mediaOf(m, ctx).length === 0) return false;
    return true;
}

/**
 * When a filter yields nothing, the facet most likely responsible: the one
 * whose removal brings back the most memories (§8). None is returned when
 * dropping any single facet still yields nothing — then the filter as a whole
 * is to blame, and the screen says so instead.
 */
export function blame(
    all: Memory[],
    f: Facets,
    ctx: MatchContext
): { facet: FacetName; without: number } | undefined {
    let best: { facet: FacetName; without: number } | undefined;
    for (const facet of activeFacets(f)) {
        const n = all.filter((m) => matches(m, without(f, facet), ctx)).length;
        if (n > 0 && (!best || n > best.without))
            best = { facet, without: n };
    }
    return best;
}

/** The media a filtered set of memories accounts for — the media projection. */
export function mediaMatching(
    memories: Memory[],
    f: Facets,
    ctx: MatchContext
): Media[] {
    const window = filterWindow(f);
    const byDate = (m: Media) => {
        if (!window) return true;
        const t = takenAtMs(m);
        // Undated media cannot be placed in time; a date facet is a claim
        // about time, so they fall outside it rather than sneaking through.
        return t !== undefined && t >= window.earliest && t <= window.latest;
    };
    // Facets that talk about memories restrict the grid to what those
    // memories account for; a bare date range leaves every photograph in.
    const memoryFacets = activeFacets(f).filter((x) => x !== "date");
    if (!memoryFacets.length) return ctx.media.filter(byDate);
    const wanted = new Set<string>();
    for (const m of memories)
        if (matches(m, f, ctx))
            for (const x of mediaOf(m, ctx)) wanted.add(x.doc);
    return ctx.media.filter((m) => wanted.has(m.doc) && byDate(m));
}
