// Public events (Specs §3.7, §4.2): the other thing a recommendation can point
// at, and what gives one urgency and expiry. Read, essentially never written —
// the app mints an event only when no external one exists, which S-41 does not
// yet do.
//
// Read by SPARQL rather than through a generated shape, for one reason: a shape
// keyed on `schema:Event` would match every memory in the archive, because
// `app:Memory` ⊑ `schema:Event` and §3 has memories assert both types. The
// whole difference is a `FILTER NOT EXISTS`, which belongs in a query rather
// than in a shape fighting the codegen.

import { select } from "./query";
import {
    parsePrecisionDate,
    interval,
    type Interval,
    type PrecisionDate,
} from "./dates";

export interface PublicEvent {
    id: string;
    name?: string;
    /** Precision-aware (§3.1): a festival may be dated to a month. */
    start?: PrecisionDate;
    end?: PrecisionDate;
    /** Where it happens, as a place IRI — resolved by the usual join. */
    location?: string;
    sameAs?: string;
}

export async function loadEvents(): Promise<PublicEvent[]> {
    const rows = await select(
        `PREFIX schema: <https://schema.org/>
         PREFIX app: <did:ng:z:cairns/>
         PREFIX owl: <http://www.w3.org/2002/07/owl#>
         SELECT ?s ?n ?start ?end ?loc ?same WHERE { GRAPH ?g {
            ?s a schema:Event .
            # A memory is a schema:Event too (§3). It is not a public event.
            FILTER NOT EXISTS { ?s a app:Memory }
            OPTIONAL { ?s schema:name ?n }
            OPTIONAL { ?s schema:startDate ?start }
            OPTIONAL { ?s schema:endDate ?end }
            OPTIONAL { ?s schema:location ?loc }
            OPTIONAL { ?s owl:sameAs ?same }
         } }`
    );
    const byId = new Map<string, PublicEvent>();
    for (const b of rows as any[]) {
        // One row per optional combination; first non-empty value wins.
        const seen = byId.get(b.s.value);
        byId.set(b.s.value, {
            id: b.s.value,
            name: seen?.name ?? b.n?.value,
            start: seen?.start ?? parsePrecisionDate(b.start?.value),
            end: seen?.end ?? parsePrecisionDate(b.end?.value),
            location: seen?.location ?? b.loc?.value,
            sameAs: seen?.sameAs ?? b.same?.value,
        });
    }
    return [...byId.values()];
}

export function findEvent(
    all: PublicEvent[],
    iri: string
): PublicEvent | undefined {
    return all.find((e) => e.id === iri);
}

/**
 * When it happens, at the precision it was stated. An event dated to a month
 * covers that month — the collation rule of §3.1, applied to somebody else's
 * data rather than to a memory.
 */
export function eventSpan(e: PublicEvent): Interval | undefined {
    if (!e.start) return undefined;
    const s = interval(e.start);
    if (!e.end) return s;
    return { earliest: s.earliest, latest: interval(e.end).latest };
}

/**
 * §4.2: "a festival is live in June and historical in September". Expired means
 * the whole of its span is behind us — an event dated to 2019 is expired, an
 * event dated to this month is not, whatever day it is.
 *
 * An undated event is never expired. It may be a recurring thing whose dates
 * nobody wrote down, and §8's rule about coarse dates applies the same way:
 * never invent what was not stated.
 */
export function isExpired(e: PublicEvent, now = Date.now()): boolean {
    const span = eventSpan(e);
    return span ? span.latest < now : false;
}

/** Whether it is under way right now, which is the strongest thing S-01 says. */
export function isLive(e: PublicEvent, now = Date.now()): boolean {
    const span = eventSpan(e);
    return !!span && span.earliest <= now && span.latest >= now;
}

/** Loaded once per screen; nothing in this app writes an event (yet). */
export function useEvents() {
    let all = $state<PublicEvent[]>([]);
    let ready = $state(false);
    loadEvents()
        .then((e) => (all = e))
        .catch((e) => console.error("events", e))
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
