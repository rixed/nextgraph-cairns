import { describe, expect, it } from "vitest";
import {
    classify,
    excerpt,
    groupHits,
    searchQuery,
    toHits,
    type Hit,
} from "./search";

const APP = "did:ng:z:cairns/";
const SCHEMA = "https://schema.org/";

describe("classify", () => {
    it("calls a memory a memory, though it is a schema:Event too", () => {
        expect(classify([`${APP}Memory`, `${SCHEMA}Event`])).toBe("memory");
    });

    it("calls a public event an event", () => {
        expect(classify([`${SCHEMA}Event`])).toBe("event");
    });

    it("calls a recommendation one, though it is a ListItem too", () => {
        expect(
            classify([`${APP}Recommendation`, `${SCHEMA}ListItem`])
        ).toBe("recommendation");
    });

    it("knows places, people and concepts", () => {
        expect(classify([`${SCHEMA}Place`])).toBe("place");
        expect(classify(["http://xmlns.com/foaf/0.1/Person"])).toBe("person");
        expect(
            classify(["http://www.w3.org/2004/02/skos/core#Concept"])
        ).toBe("tag");
    });

    it("keeps what it does not model rather than dropping it", () => {
        expect(classify([`${SCHEMA}LodgingReservation`])).toBe("other");
        expect(classify([])).toBe("other");
    });
});

describe("the query", () => {
    it("lowercases the needle on both sides", () => {
        const q = searchQuery("Lisboa");
        expect(q).toContain('CONTAINS(LCASE(STR(?lit)), "lisboa")');
    });

    it("escapes a needle that would otherwise end the literal", () => {
        expect(searchQuery('say "hi"')).toContain('\\"hi\\"');
    });

    it("does not build a regex out of user input", () => {
        // A stray bracket is a search, not a syntax error.
        expect(searchQuery("(")).toContain('"("');
        expect(searchQuery("(")).not.toContain("REGEX");
    });
});

describe("toHits", () => {
    it("splits the concatenated types and classifies each row", () => {
        const hits = toHits([
            {
                s: { value: "did:ng:o:a" },
                g: { value: "did:ng:o:a" },
                types: { value: `${APP}Memory ${SCHEMA}Event` },
                snippet: { value: "a walk in Lisboa" },
            },
        ]);
        expect(hits[0].kind).toBe("memory");
        expect(hits[0].types).toHaveLength(2);
        expect(hits[0].snippet).toBe("a walk in Lisboa");
    });

    it("survives a subject with no type at all", () => {
        const hits = toHits([
            { s: { value: "did:ng:o:a" }, g: { value: "did:ng:o:a" } },
        ]);
        expect(hits[0]).toMatchObject({ kind: "other", types: [] });
    });
});

describe("groupHits", () => {
    const hit = (id: string, kind: Hit["kind"]): Hit => ({
        id,
        graph: id,
        types: [],
        kind,
    });
    const times: Record<string, number | undefined> = {
        a: 3,
        b: 1,
        c: undefined,
        p: 9,
    };
    const timeOf = (h: Hit) => times[h.id];

    it("groups by type in the specified order", () => {
        const g = groupHits(
            [hit("p", "place"), hit("a", "memory")],
            timeOf
        );
        expect(g.map((x) => x.kind)).toEqual(["memory", "place"]);
    });

    it("orders each group newest first, undated last", () => {
        const g = groupHits(
            [hit("b", "memory"), hit("c", "memory"), hit("a", "memory")],
            timeOf
        );
        expect(g[0].hits.map((h) => h.id)).toEqual(["a", "b", "c"]);
    });

    it("has no group for a type nothing matched", () => {
        expect(groupHits([hit("a", "memory")], timeOf)).toHaveLength(1);
    });
});

describe("excerpt", () => {
    it("leaves a short line alone", () => {
        expect(excerpt("a walk in Lisboa", "lisboa")).toBe("a walk in Lisboa");
    });

    it("centres a long one on the needle", () => {
        const text = `${"x".repeat(200)} Lisboa ${"y".repeat(200)}`;
        const e = excerpt(text, "Lisboa");
        expect(e).toContain("Lisboa");
        expect(e.startsWith("…")).toBe(true);
        expect(e.endsWith("…")).toBe(true);
        expect(e.length).toBeLessThan(100);
    });

    it("still shows something when the needle is not in the snippet", () => {
        // The hit may have matched another literal of the same subject.
        expect(excerpt("something else entirely", "lisboa")).toBe(
            "something else entirely"
        );
    });
});
