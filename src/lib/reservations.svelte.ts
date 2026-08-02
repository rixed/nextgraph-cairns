// Reservation-shaped documents (Specs §5): "flights, lodging, trains,
// restaurants, tickets, with exact xsd:dateTime and confirmation numbers.
// Shown on Here-and-Now when imminent, and on a memory by date overlap."
//
// Foreign evidence, like media and tracks — read, never written, never edited.
// Read by SPARQL rather than through a generated shape: five types share one
// treatment, the interesting values hang off a nested `reservationFor` node
// that the ORM cannot resolve anyway (B-14), and nothing subscribes because
// nothing in this app writes one.
//
// `make seed-foreign` writes some, which is the only reason this could be
// built and driven at all.

import { select } from "./query";

const SCHEMA = "https://schema.org/";

/** The five §5 lists, plus the generic type a document may carry alone. */
export const RESERVATION_TYPES = [
    "Reservation",
    "LodgingReservation",
    "FlightReservation",
    "TrainReservation",
    "FoodEstablishmentReservation",
    "EventReservation",
] as const;

export type ReservationKind = (typeof RESERVATION_TYPES)[number];

/** What each kind is called and looks like, in the user's terms. */
export const KIND_LABEL: Record<ReservationKind, { icon: string; noun: string }> =
    {
        Reservation: { icon: "🎫", noun: "booking" },
        LodgingReservation: { icon: "🛏️", noun: "stay" },
        FlightReservation: { icon: "✈️", noun: "flight" },
        TrainReservation: { icon: "🚆", noun: "train" },
        FoodEstablishmentReservation: { icon: "🍽️", noun: "table" },
        EventReservation: { icon: "🎟️", noun: "ticket" },
    };

export interface Reservation {
    id: string;
    kind: ReservationKind;
    number?: string;
    /** What it is for, as the writing application named it. */
    forName?: string;
    startMs?: number;
    endMs?: number;
}

const ms = (v?: string) => {
    if (!v) return undefined;
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : undefined;
};

/** A specific type beats the generic one when a document asserts both. */
function mostSpecific(a: ReservationKind, b: ReservationKind): ReservationKind {
    if (a === "Reservation") return b;
    return a;
}

export async function loadReservations(): Promise<Reservation[]> {
    const values = RESERVATION_TYPES.map((t) => `schema:${t}`).join(" ");
    const rows = await select(
        `PREFIX schema: <${SCHEMA}>
         SELECT ?s ?type ?num ?forName ?checkin ?checkout ?start ?dep ?arr
         WHERE { GRAPH ?g {
            VALUES ?type { ${values} }
            ?s a ?type .
            OPTIONAL { ?s schema:reservationNumber ?num }
            OPTIONAL { ?s schema:checkinTime ?checkin }
            OPTIONAL { ?s schema:checkoutTime ?checkout }
            OPTIONAL { ?s schema:startTime ?start }
            OPTIONAL {
                ?s schema:reservationFor ?for .
                OPTIONAL { ?for schema:name ?forName }
                OPTIONAL { ?for schema:departureTime ?dep }
                OPTIONAL { ?for schema:arrivalTime ?arr }
            }
         } }`
    );

    // One row per type asserted, so the same reservation can arrive twice.
    const byId = new Map<string, Reservation>();
    for (const b of rows as any[]) {
        const id = b.s.value;
        const kind = b.type.value.slice(SCHEMA.length) as ReservationKind;
        // Whichever field the writing application used: a stay has a check-in,
        // a flight a departure, a table a start time. None is required.
        const startMs =
            ms(b.checkin?.value) ?? ms(b.dep?.value) ?? ms(b.start?.value);
        const endMs = ms(b.checkout?.value) ?? ms(b.arr?.value);
        const seen = byId.get(id);
        byId.set(id, {
            id,
            kind: seen ? mostSpecific(seen.kind, kind) : kind,
            number: seen?.number ?? b.num?.value,
            forName: seen?.forName ?? b.forName?.value,
            startMs: seen?.startMs ?? startMs,
            endMs: seen?.endMs ?? endMs,
        });
    }
    return [...byId.values()].sort(
        (a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity)
    );
}

/**
 * §6.2's second card: "a reservation-shaped document within the next day or
 * two". Something already under way counts as imminent — a stay you are in the
 * middle of is exactly the logistics worth surfacing.
 */
export function imminent(
    all: Reservation[],
    now = Date.now(),
    withinDays = 2
): Reservation[] {
    const horizon = now + withinDays * 86_400_000;
    return all.filter((r) => {
        if (r.startMs === undefined) return false;
        if (r.startMs > horizon) return false;
        return (r.endMs ?? r.startMs) >= now;
    });
}

/** Reservations whose time overlaps a memory's span (§5). */
export function overlapping(
    all: Reservation[],
    span: { earliest: number; latest: number }
): Reservation[] {
    return all.filter((r) => {
        if (r.startMs === undefined) return false;
        return r.startMs <= span.latest && (r.endMs ?? r.startMs) >= span.earliest;
    });
}

/** Loaded once per screen; see the note above on why nothing subscribes. */
export function useReservations() {
    let all = $state<Reservation[]>([]);
    let ready = $state(false);
    loadReservations()
        .then((r) => (all = r))
        .catch((e) => console.error("reservations", e))
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
