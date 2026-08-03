import { describe, expect, it } from "vitest";
import {
    coordsOf,
    frequentPlace,
    suggestions,
    type GroupingContext,
} from "./grouping";
import type { Place } from "./places";
import type { Memory } from "../shapes/orm/memoryShape.typings";

const memory = (
    doc: string,
    fields: Partial<Memory> & { startDate: string }
): Memory =>
    ({
        "@graph": doc,
        "@id": doc,
        "@type": new Set(["did:ng:z:cairns/Memory"]),
        ...fields,
    }) as Memory;

const place = (id: string, lat?: number, lon?: number): Place => ({
    doc: id,
    id,
    name: id,
    lat,
    lon,
});

// Lisbon, and Sintra ~25 km away; Porto is ~275 km from both.
const LISBON = place("did:ng:o:lisbon", 38.72, -9.14);
const SINTRA = place("did:ng:o:sintra", 38.8, -9.39);
const PORTO = place("did:ng:o:porto", 41.15, -8.61);

const ctx = (over: Partial<GroupingContext> = {}): GroupingContext => ({
    places: [LISBON, SINTRA, PORTO],
    ...over,
});

/** Three consecutive days, no tags, nowhere in particular. */
const trip = (prefix: string, days: string[], at?: Place) =>
    days.map((d, i) =>
        memory(`${prefix}${i}`, {
            startDate: d,
            location: at ? new Set([at.id]) : undefined,
        })
    );

describe("clustering in time", () => {
    it("proposes a run of consecutive days", () => {
        const c = suggestions(
            trip("did:ng:o:t", ["2024-05-02", "2024-05-03", "2024-05-04"]),
            ctx()
        );
        expect(c).toHaveLength(1);
        expect(c[0].members.map((m) => m["@graph"])).toEqual([
            "did:ng:o:t0",
            "did:ng:o:t1",
            "did:ng:o:t2",
        ]);
    });

    it("tolerates one empty day but not two", () => {
        // 2, 4, 6 May: each gap is a single day.
        expect(
            suggestions(
                trip("did:ng:o:a", ["2024-05-02", "2024-05-04", "2024-05-06"]),
                ctx()
            )
        ).toHaveLength(1);
        // 2, 5, 8 May: two empty days each time, three separate episodes.
        expect(
            suggestions(
                trip("did:ng:o:b", ["2024-05-02", "2024-05-05", "2024-05-08"]),
                ctx()
            )
        ).toEqual([]);
    });

    it("needs three members", () => {
        expect(
            suggestions(
                trip("did:ng:o:c", ["2024-05-02", "2024-05-03"]),
                ctx()
            )
        ).toEqual([]);
    });

    it("ignores memories with unreadable dates", () => {
        const rows = trip("did:ng:o:d", [
            "2024-05-02",
            "not a date",
            "2024-05-03",
        ]);
        expect(suggestions(rows, ctx())).toEqual([]);
    });

    it("spans the whole run, and names the place its members share", () => {
        const c = suggestions(
            trip(
                "did:ng:o:e",
                ["2024-05-02", "2024-05-03", "2024-05-04"],
                SINTRA
            ),
            ctx()
        );
        expect(c[0].place).toBe(SINTRA.id);
        expect(new Date(c[0].span.earliest).getUTCMonth()).toBe(4);
        expect(c[0].span.latest).toBeGreaterThan(c[0].span.earliest);
    });
});

describe("clustering in space", () => {
    it("splits a run that jumps too far", () => {
        const rows = [
            memory("did:ng:o:a", {
                startDate: "2024-05-02",
                location: new Set([LISBON.id]),
            }),
            memory("did:ng:o:b", {
                startDate: "2024-05-03",
                location: new Set([SINTRA.id]),
            }),
            memory("did:ng:o:c", {
                startDate: "2024-05-04",
                location: new Set([PORTO.id]),
            }),
        ];
        // Lisbon → Sintra is within the radius, Sintra → Porto is not, so the
        // run breaks and neither half is big enough.
        expect(suggestions(rows, ctx())).toEqual([]);
    });

    it("lets an unplaced memory join on time alone", () => {
        const rows = [
            memory("did:ng:o:a", {
                startDate: "2024-05-02",
                location: new Set([SINTRA.id]),
            }),
            memory("did:ng:o:b", { startDate: "2024-05-03" }),
            memory("did:ng:o:c", {
                startDate: "2024-05-04",
                location: new Set([SINTRA.id]),
            }),
        ];
        expect(suggestions(rows, ctx())[0].members).toHaveLength(3);
    });
});

describe("what is not worth proposing", () => {
    const days = ["2024-05-02", "2024-05-03", "2024-05-04"];

    it("says nothing about memories that already share a tag", () => {
        const rows = days.map((d, i) =>
            memory(`did:ng:o:t${i}`, {
                startDate: d,
                subject: new Set(["did:ng:o:tag-surf"]),
            })
        );
        expect(suggestions(rows, ctx())).toEqual([]);
    });

    it("says nothing about memories already about one public event", () => {
        const rows = days.map((d, i) =>
            memory(`did:ng:o:v${i}`, {
                startDate: d,
                about: new Set(["did:ng:o:festa"]),
            })
        );
        expect(suggestions(rows, ctx())).toEqual([]);
    });

    it("still proposes when only some of them share the tag", () => {
        const rows = days.map((d, i) =>
            memory(`did:ng:o:w${i}`, {
                startDate: d,
                subject: i < 2 ? new Set(["did:ng:o:tag-surf"]) : undefined,
            })
        );
        expect(suggestions(rows, ctx())).toHaveLength(1);
    });

    it("says nothing about a run at home", () => {
        const rows = trip("did:ng:o:h", days, LISBON);
        expect(
            suggestions(rows, ctx({ home: { lat: 38.72, lon: -9.14 } }))
        ).toEqual([]);
        // The same days away from it are a trip.
        expect(
            suggestions(
                trip("did:ng:o:p", days, PORTO),
                ctx({ home: { lat: 38.72, lon: -9.14 } })
            )
        ).toHaveLength(1);
    });

    it("proposes an unplaced run even when there is a home", () => {
        expect(
            suggestions(
                trip("did:ng:o:u", days),
                ctx({ home: { lat: 38.72, lon: -9.14 } })
            )
        ).toHaveLength(1);
    });
});

describe("the frequent place", () => {
    const at = (doc: string, iri: string) =>
        memory(doc, { startDate: "2024-05-02", location: new Set([iri]) });

    it("is the one most memories name", () => {
        const all = [
            at("did:ng:o:a", LISBON.id),
            at("did:ng:o:b", LISBON.id),
            at("did:ng:o:c", LISBON.id),
            at("did:ng:o:d", PORTO.id),
        ];
        expect(frequentPlace(all, ctx().places)).toEqual({
            lat: 38.72,
            lon: -9.14,
        });
    });

    it("is nobody's, in an archive with no centre", () => {
        const all = [at("did:ng:o:a", LISBON.id), at("did:ng:o:b", PORTO.id)];
        expect(frequentPlace(all, ctx().places)).toBeUndefined();
    });

    it("ignores unnamed places, which are one memory's own", () => {
        const all = ["a", "b", "c"].map((d) =>
            at(`did:ng:o:${d}`, `did:ng:o:${d}#place-0`)
        );
        expect(frequentPlace(all, ctx().places)).toBeUndefined();
    });
});

describe("coordsOf", () => {
    it("takes the first location that knows where it is", () => {
        const m = memory("did:ng:o:a", {
            startDate: "2024-05-02",
            location: new Set(["did:ng:o:nowhere", PORTO.id]),
        });
        expect(coordsOf(m, ctx().places)).toEqual({ lat: 41.15, lon: -8.61 });
    });
});
