// The S-40 sort (Specs §6.2): "happening soonest, then nearest, then most
// recently told", with expired items "marked, never hidden or deleted" (§8).
//
// Pure and generic over what is being sorted, so the rule can be tested without
// a store, a map, or a subscription. The screen resolves each recommendation's
// referent into a span and a distance; everything below is arithmetic on those.

import { interval, type Interval } from "./dates";
import type { Recommendation } from "./recommendations";
import { findEvent, eventSpan, type PublicEvent } from "./events.svelte";
import { findPlace, placeLabel, type Place } from "./places";
import { km, type Position } from "./here.svelte";

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

// ---------------------------------------------------------------------------
// Resolution
//
// A recommendation holds one IRI and nothing else about what it points at
// (§4.1). Turning that into something showable — a name, a span, a distance —
// is the same work on S-40 and on S-01, so it happens once here.
// ---------------------------------------------------------------------------

export interface ResolvedRecommendation extends Rankable {
    rec: Recommendation;
    /**
     * The memories that say this prompted them (§4.1). Derived from their
     * `prov:wasInfluencedBy`, never stored here — empty means you have not
     * been, or have not said so.
     */
    fulfilledBy: string[];
    /** Set when the referent is an event rather than a place (§4.2). */
    event?: PublicEvent;
    /** Where it is: the referent itself, or the event's location. */
    place?: Place;
    label: string;
    urgency: Urgency;
}

export function resolve(
    recs: Recommendation[],
    events: PublicEvent[],
    places: Place[],
    position: Position | undefined,
    /** Recommendation IRI → the memories prompted by it (see `fulfilments`). */
    fulfilled: Map<string, string[]> = new Map(),
    now = Date.now()
): ResolvedRecommendation[] {
    return recs.map((rec) => {
        const event = findEvent(events, rec.item);
        // An event's place is the event's, not the recommendation's: you were
        // told about the festival, and the festival knows where it is.
        const placeIri = event ? event.location : rec.item;
        const place = placeIri ? findPlace(places, placeIri) : undefined;
        const span = event ? eventSpan(event) : undefined;
        return {
            rec,
            event,
            place,
            label: event
                ? (event.name ?? "an event")
                : placeLabel(place, rec.item),
            span,
            distanceKm:
                position && place?.lat !== undefined && place.lon !== undefined
                    ? km(position, { lat: place.lat, lon: place.lon })
                    : undefined,
            toldMs: rec.told ? interval(rec.told).earliest : undefined,
            urgency: urgencyOf({ span }, now),
            fulfilledBy: fulfilled.get(rec.id) ?? [],
        };
    });
}

/**
 * §6.2's first S-01 card — "a recommendation whose event is happening now or
 * soon **and** is nearby", the app's best moment. Both halves are required:
 * a festival two countries away is not this card, and neither is a bar with no
 * date attached, which is card three.
 *
 * Fulfilled ones are left out of both cards. They are prompts to go somewhere,
 * and you went.
 */
export function bestMoment(
    rows: ResolvedRecommendation[],
    now = Date.now(),
    withinDays = 7,
    withinKm = 30
): ResolvedRecommendation[] {
    const horizon = now + withinDays * 86_400_000;
    return sortHeardAbout(
        rows.filter(
            (r) =>
                !r.fulfilledBy.length &&
                r.span &&
                r.span.latest >= now &&
                r.span.earliest <= horizon &&
                r.distanceKm !== undefined &&
                r.distanceKm <= withinKm
        ),
        now
    );
}

/**
 * §6.2's third S-01 card — "a recommended place nearby, whether or not it has
 * a date". Anything already claimed by the first card is excluded, so the same
 * thing never appears twice on one screen.
 */
export function nearbyRecommended(
    rows: ResolvedRecommendation[],
    now = Date.now(),
    withinKm = 15
): ResolvedRecommendation[] {
    const claimed = new Set(bestMoment(rows, now).map((r) => r.rec.id));
    return sortHeardAbout(
        rows.filter(
            (r) =>
                !r.fulfilledBy.length &&
                !claimed.has(r.rec.id) &&
                // Recomputed rather than read off the row: `urgency` was
                // decided whenever the row was resolved, and a card that is
                // right at midnight and wrong at one in the morning is worse
                // than one line of arithmetic.
                urgencyOf(r, now) !== "past" &&
                r.distanceKm !== undefined &&
                r.distanceKm <= withinKm
        ),
        now
    );
}
