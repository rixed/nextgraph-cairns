// Grouping suggestions for S-22a (§6.2): runs of memories that look like one
// episode — a trip, a weekend, a festival — offered for tagging or for writing
// one memory about them all.
//
// The suggestion is an inference and is never stored (§1.3.16); it is
// recomputed from the filtered archive every time. Specs §10.2 leaves the
// clustering rule open — "gap threshold, distance from a frequent place,
// minimum member count" — and this is the first cut, with the three numbers in
// one place so that answering the question later means changing them, not
// finding them.
//
// Dismissal (§3.9) is deliberately not built yet: the workflow is not settled,
// and a rejection is durable, so writing one before the shape of the offer is
// agreed would leave permanent records of a question we may end up asking
// differently. What stands in for it is the suppression rule below — a run
// whose members already share a tag or a public event is not proposed, because
// the user has already said what it is.

import {
    compareIntervals,
    memoryInterval,
    parsePrecisionDate,
    type Interval,
} from "./dates";
import { findPlace, isIdentified, type Place } from "./places";
import { km, type Position } from "./here.svelte";
import type { Memory } from "../shapes/orm/memoryShape.typings";

/** At most one empty day between two memories of the same episode. */
export const GAP_HOURS = 36;
/** How far one memory of an episode may be from the previous one. */
export const RADIUS_KM = 50;
/** Two memories are a pair, not a group. */
export const MIN_MEMBERS = 3;
/** Around the frequent place, a run of days is ordinary life, not a trip. */
export const HOME_RADIUS_KM = 25;
/** Below this, the archive has no frequent place worth calling home. */
export const HOME_MIN_MEMORIES = 3;

export interface Cluster {
    members: Memory[];
    span: Interval;
    /** The place most of its members name, when they name one. */
    place?: string;
}

export interface GroupingContext {
    places: Place[];
    /**
     * Where the user's life is centred, from `frequentPlace`. Passed in rather
     * than derived here because it is a fact about the whole archive, and the
     * memories being clustered are only what the filter let through.
     */
    home?: Position;
}

/** The first coordinates a memory can be placed at, named or dropped (§3.2). */
export function coordsOf(m: Memory, places: Place[]): Position | undefined {
    for (const iri of m.location ?? []) {
        const p = findPlace(places, iri);
        if (p?.lat !== undefined && p.lon !== undefined)
            return { lat: p.lat, lon: p.lon };
    }
    return undefined;
}

/**
 * Home, near enough: the identified place the most memories name. It is only a
 * denominator for "is this ordinary?", so an archive with no clear centre — a
 * nomadic one, which this app is written for — simply has none, and every run
 * of days is then worth proposing.
 */
export function frequentPlace(
    all: Memory[],
    places: Place[]
): Position | undefined {
    const count = new Map<string, number>();
    for (const m of all)
        for (const iri of new Set([...(m.location ?? [])].filter(isIdentified)))
            count.set(iri, (count.get(iri) ?? 0) + 1);
    let best: { iri: string; n: number } | undefined;
    for (const [iri, n] of count)
        if (!best || n > best.n) best = { iri, n };
    if (!best || best.n < HOME_MIN_MEMORIES) return undefined;
    const p = findPlace(places, best.iri);
    return p?.lat !== undefined && p.lon !== undefined
        ? { lat: p.lat, lon: p.lon }
        : undefined;
}

interface Row {
    m: Memory;
    span: Interval;
    at?: Position;
}

/** Do these two memories carry a tag, or a public event, in common? */
function sharesSomething(a: Memory, b: Memory): boolean {
    const tags = new Set([...(a.subject ?? [])]);
    const events = new Set([...(a.about ?? [])]);
    return (
        [...(b.subject ?? [])].some((t) => tags.has(t)) ||
        [...(b.about ?? [])].some((e) => events.has(e))
    );
}

/** The place named by more of the cluster's members than any other. */
function commonPlace(members: Memory[], places: Place[]): string | undefined {
    const count = new Map<string, number>();
    for (const m of members)
        for (const iri of new Set([...(m.location ?? [])].filter(isIdentified)))
            count.set(iri, (count.get(iri) ?? 0) + 1);
    let best: { iri: string; n: number } | undefined;
    for (const [iri, n] of count)
        if (!best || n > best.n) best = { iri, n };
    // Named by one member out of six, it is not what the cluster is about.
    return best && best.n > 1 && findPlace(places, best.iri)
        ? best.iri
        : undefined;
}

/**
 * The runs worth proposing, in the order they are read.
 *
 * A run grows while the next memory starts within `GAP_HOURS` of the last one
 * ending and, when both know where they were, within `RADIUS_KM` of it. The
 * comparison is against the previous member rather than the first: a trip that
 * moves down a coast is one episode even though its ends are far apart.
 *
 * A memory with no location joins on time alone — absence is not evidence of
 * being somewhere else (§1.3.15), and refusing it would make the suggestions
 * quietly depend on how much of the archive has coordinates.
 */
export function suggestions(
    memories: Memory[],
    ctx: GroupingContext
): Cluster[] {
    const rows = memories
        .flatMap((m): Row[] => {
            const start = parsePrecisionDate(m.startDate);
            if (!start) return [];
            const end = parsePrecisionDate(m.endDate ?? undefined);
            return [
                {
                    m,
                    span: memoryInterval(start, end),
                    at: coordsOf(m, ctx.places),
                },
            ];
        })
        .sort((a, b) => compareIntervals(a.span, b.span));

    const gap = GAP_HOURS * 3600_000;
    const runs: Row[][] = [];
    for (const row of rows) {
        const run = runs[runs.length - 1];
        const prev = run?.[run.length - 1];
        const near =
            !prev?.at || !row.at || km(prev.at, row.at) <= RADIUS_KM;
        // `earliest - latest` is negative for overlapping spans, which join.
        if (prev && row.span.earliest - prev.span.latest <= gap && near)
            run.push(row);
        else runs.push([row]);
    }

    return runs
        .filter((run) => run.length >= MIN_MEMBERS)
        .filter((run) => {
            // Already grouped: every member shares a tag or an event with the
            // first. Nothing here proposes what the user has already said.
            const [first, ...rest] = run;
            return !rest.every((r) => sharesSomething(first.m, r.m));
        })
        .filter((run) => {
            // Ordinary life around the frequent place. A run with no
            // coordinates at all is not "at home" — it is unplaced.
            if (!ctx.home) return true;
            const placed = run.filter((r) => r.at);
            return (
                placed.length === 0 ||
                !placed.every((r) => km(ctx.home!, r.at!) <= HOME_RADIUS_KM)
            );
        })
        .map((run) => ({
            members: run.map((r) => r.m),
            span: {
                earliest: run[0].span.earliest,
                latest: Math.max(...run.map((r) => r.span.latest)),
            },
            place: commonPlace(
                run.map((r) => r.m),
                ctx.places
            ),
        }));
}
