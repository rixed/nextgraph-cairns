import { describe, expect, it } from "vitest";
import {
    blame,
    emptyFacets,
    matches,
    mediaMatching,
    type Facets,
    type MatchContext,
} from "./browseFilter";
import type { Media } from "./media";
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

const ctx = (over: Partial<MatchContext> = {}): MatchContext => ({
    media: [],
    places: [],
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
