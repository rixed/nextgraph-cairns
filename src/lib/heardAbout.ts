// The S-40 sort (Specs §6.2): "happening soonest, then nearest, then most
// recently told", with expired items "marked, never hidden or deleted" (§8).
//
// Pure and generic over what is being sorted, so the rule can be tested without
// a store, a map, or a subscription. The screen resolves each recommendation's
// referent into a span and a distance; everything below is arithmetic on those.

import type { Interval } from "./dates";

/**
 * Why an item sits where it does — shown to the user as a badge, so the sort is
 * never something they have to infer from the order alone.
 */
export type Urgency = "live" | "upcoming" | "undated" | "past";

export interface Rankable {
    /** The referent event's span, absent for a place or an undated event. */
    span?: Interval;
    /** Kilometres from here, when both a position and coordinates are known. */
    distanceKm?: number;
    /** When you were told, as epoch ms — the last tiebreaker. */
    toldMs?: number;
}

export function urgencyOf(item: Rankable, now: number): Urgency {
    if (!item.span) return "undated";
    if (item.span.latest < now) return "past";
    return item.span.earliest <= now ? "live" : "upcoming";
}

// Live and upcoming share a bucket: both are "happening soonest", and a
// festival that started yesterday and runs until Sunday should not sort behind
// one that starts next month.
const BUCKET: Record<Urgency, number> = {
    live: 0,
    upcoming: 0,
    undated: 1,
    past: 2,
};

/** Sort ascending by urgency, then by the §6.2 tiebreakers. Does not mutate. */
export function sortHeardAbout<T extends Rankable>(
    items: T[],
    now = Date.now()
): T[] {
    return [...items].sort((a, b) => {
        const ua = urgencyOf(a, now);
        const ub = urgencyOf(b, now);
        if (BUCKET[ua] !== BUCKET[ub]) return BUCKET[ua] - BUCKET[ub];
        // Something happening: soonest first.
        if (BUCKET[ua] === 0)
            return (
                a.span!.earliest - b.span!.earliest ||
                nearest(a, b) ||
                latestTold(a, b)
            );
        // Nothing happening, nothing over: a place, ranked by where you are.
        if (BUCKET[ua] === 1) return nearest(a, b) || latestTold(a, b);
        // Over: the most recently missed first, which is the one still worth
        // knowing about — a festival that comes round again (§4.2).
        return b.span!.earliest - a.span!.earliest || latestTold(a, b);
    });
}

/** Unknown distance sorts last rather than as zero. */
function nearest(a: Rankable, b: Rankable): number {
    return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
}

/** Most recently told first; never told sorts last. */
function latestTold(a: Rankable, b: Rankable): number {
    return (b.toldMs ?? -Infinity) - (a.toldMs ?? -Infinity);
}
