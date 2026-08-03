import { describe, expect, it } from "vitest";
import {
    blame,
    emptyFacets,
    matches,
    mediaMatching,
    without,
    type Facets,
    type MatchContext,
} from "./browseFilter";
import type { Media } from "./media";
import type { Place } from "./places";
import type { Person } from "./people";
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

const media = (doc: string, takenAt?: string): Media => ({
    kind: "image",
    doc,
    id: doc,
    contentUrl: `${doc}#full`,
    thumbnailUrl: `${doc}#thumb`,
    takenAt,
});

const place = (id: string, containedIn?: string): Place => ({
    doc: id,
    id,
    name: id,
    containedIn,
});

const person = (id: string, name?: string): Person => ({ doc: id, id, name });

const ctx = (over: Partial<MatchContext> = {}): MatchContext => ({
    media: [],
    places: [],
    people: [],
    isSuppressed: () => false,
    ...over,
});

const facets = (over: Partial<Facets> = {}): Facets => ({
    ...emptyFacets(),
    ...over,
});

describe("the date facet", () => {
    const m = memory("mem1", { startDate: "2019" });

    it("keeps a memory whose span overlaps the window", () => {
        // A memory dated to a whole year belongs to any month of it: the
        // filter overlaps, it does not contain (§3.1).
        expect(
            matches(
                m,
                facets({
                    from: { lexical: "2019-08", precision: "month" },
                    to: { lexical: "2019-08", precision: "month" },
                }),
                ctx()
            )
        ).toBe(true);
    });

    it("drops one that falls outside it", () => {
        expect(
            matches(
                m,
                facets({ from: { lexical: "2020", precision: "year" } }),
                ctx()
            )
        ).toBe(false);
    });

    it("drops a memory whose date cannot be read", () => {
        expect(
            matches(
                memory("junk", { startDate: "whenever" }),
                facets({ from: { lexical: "2019", precision: "year" } }),
                ctx()
            )
        ).toBe(false);
    });
});

describe("the tag facet", () => {
    const m = memory("mem1", {
        startDate: "2019",
        subject: new Set(["tag:a", "tag:b"]),
    });

    it("any: one tag in common is enough", () => {
        expect(
            matches(m, facets({ tags: ["tag:a", "tag:z"] }), ctx())
        ).toBe(true);
    });

    it("all: every tag must be there", () => {
        expect(
            matches(
                m,
                facets({ tags: ["tag:a", "tag:z"], tagMode: "all" }),
                ctx()
            )
        ).toBe(false);
        expect(
            matches(
                m,
                facets({ tags: ["tag:a", "tag:b"], tagMode: "all" }),
                ctx()
            )
        ).toBe(true);
    });
});

describe("the place facet", () => {
    const places = [place("lisbon", "portugal"), place("portugal")];
    const m = memory("mem1", {
        startDate: "2019",
        location: new Set(["lisbon"]),
    });

    it("matches the place itself", () => {
        expect(matches(m, facets({ place: "lisbon" }), ctx({ places }))).toBe(
            true
        );
    });

    it("matches a place that contains it, transitively", () => {
        expect(matches(m, facets({ place: "portugal" }), ctx({ places }))).toBe(
            true
        );
    });

    it("does not match a sibling", () => {
        expect(matches(m, facets({ place: "spain" }), ctx({ places }))).toBe(
            false
        );
    });

    it("survives a cycle in foreign data", () => {
        const cyclic = [place("a", "b"), place("b", "a")];
        expect(
            matches(
                memory("m", { startDate: "2019", location: new Set(["a"]) }),
                facets({ place: "elsewhere" }),
                ctx({ places: cyclic })
            )
        ).toBe(false);
    });
});

describe("the person facet", () => {
    // A companion is one facet whether or not their bare names have been
    // promoted: two memories naming "Ana" separately are both hers (§3.3).
    const people = [
        person("mem1#person-0", "Ana"),
        person("mem2#person-0", "ana"),
        person("contacts#p-1", "Ana"),
        person("mem3#person-0", "Bruno"),
    ];
    const all = [
        memory("mem1", {
            startDate: "2019",
            attendee: new Set(["mem1#person-0"]),
        }),
        memory("mem2", {
            startDate: "2019",
            attendee: new Set(["mem2#person-0"]),
        }),
        memory("mem3", {
            startDate: "2019",
            attendee: new Set(["mem3#person-0"]),
        }),
    ];

    it("matches every memory naming the same person, unpromoted", () => {
        const shown = all.filter((m) =>
            matches(m, facets({ person: "name:ana" }), ctx({ people }))
        );
        expect(shown.map((m) => m["@graph"])).toEqual(["mem1", "mem2"]);
    });

    it("does not match someone else", () => {
        expect(
            matches(all[2], facets({ person: "name:ana" }), ctx({ people }))
        ).toBe(false);
    });

    it("falls back to the IRI when a person has no name yet", () => {
        // §8, "partially loaded": a record can arrive before its name does.
        const shown = all.filter((m) =>
            matches(m, facets({ person: "iri:mem1#person-0" }), ctx())
        );
        expect(shown.map((m) => m["@graph"])).toEqual(["mem1"]);
    });
});

describe("the has-media facet", () => {
    const all = [media("pic1", "2019-08-14T10:00:00Z")];
    const m = memory("mem1", { startDate: "2019-08-14" });

    it("counts a photograph associated by overlap alone", () => {
        expect(
            matches(m, facets({ hasMedia: true }), ctx({ media: all }))
        ).toBe(true);
    });

    it("does not count one the user refused (§3.9)", () => {
        expect(
            matches(
                m,
                facets({ hasMedia: true }),
                ctx({ media: all, isSuppressed: () => true })
            )
        ).toBe(false);
    });
});

describe("blame", () => {
    const all = [
        memory("mem1", { startDate: "2019", subject: new Set(["tag:a"]) }),
        memory("mem2", { startDate: "2019" }),
    ];

    it("names the facet whose removal brings back the most", () => {
        const f = facets({
            tags: ["tag:z"],
            from: { lexical: "2019", precision: "year" },
        });
        const b = blame(all, f, ctx())!;
        expect(b.facet).toBe("tags");
        expect(b.without).toBe(2);
    });

    it("says nothing when no single facet is responsible", () => {
        const f = facets({
            tags: ["tag:z"],
            from: { lexical: "2030", precision: "year" },
        });
        expect(blame(all, f, ctx())).toBeUndefined();
    });
});

describe("mediaMatching", () => {
    const all = [
        media("pic1", "2019-08-14T10:00:00Z"),
        media("pic2", "2021-01-01T10:00:00Z"),
        media("undated"),
    ];
    const memories = [
        memory("mem1", {
            startDate: "2019-08-14",
            subject: new Set(["tag:a"]),
        }),
    ];

    it("passes everything through when no facet is set", () => {
        expect(
            mediaMatching(memories, emptyFacets(), ctx({ media: all })).length
        ).toBe(3);
    });

    it("a date range excludes undated photographs", () => {
        const shown = mediaMatching(
            memories,
            facets({
                from: { lexical: "2019", precision: "year" },
                to: { lexical: "2019", precision: "year" },
            }),
            ctx({ media: all })
        );
        expect(shown.map((m) => m.doc)).toEqual(["pic1"]);
    });

    it("a memory facet keeps only what those memories account for", () => {
        const shown = mediaMatching(
            memories,
            facets({ tags: ["tag:a"] }),
            ctx({ media: all })
        );
        expect(shown.map((m) => m.doc)).toEqual(["pic1"]);
    });
});

describe("the docs facet — S-02's results handed over as a filter", () => {
    const a = memory("did:ng:o:a", { startDate: "2024-05-02" });
    const b = memory("did:ng:o:b", { startDate: "2024-05-03" });

    it("lets through exactly the named documents", () => {
        const f = facets({ docs: ["did:ng:o:a"] });
        expect(matches(a, f, ctx())).toBe(true);
        expect(matches(b, f, ctx())).toBe(false);
    });

    it("is a facet like any other, so it can be blamed and dropped", () => {
        const f = facets({ docs: ["did:ng:o:nothing"] });
        expect(blame([a, b], f, ctx())).toEqual({ facet: "docs", without: 2 });
        expect(matches(a, without(f, "docs"), ctx())).toBe(true);
    });

    it("combines with the others rather than overriding them", () => {
        const f = facets({ docs: ["did:ng:o:a"], hasMedia: true });
        expect(matches(a, f, ctx())).toBe(false);
    });

    it("an empty result set matches nothing, which is not the same as absent", () => {
        expect(matches(a, facets({ docs: [] }), ctx())).toBe(false);
        expect(matches(a, facets({}), ctx())).toBe(true);
    });
});
