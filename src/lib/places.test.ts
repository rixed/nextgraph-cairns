import { describe, expect, it } from "vitest";
import {
    containingChain,
    coordTriples,
    draftOf,
    isIdentified,
    isWithin,
    locationTriples,
    nestedIn,
    placeLabel,
    type Place,
} from "./places";

const place = (id: string, over: Partial<Place> = {}): Place => ({
    doc: id,
    id,
    ...over,
});

describe("identity", () => {
    it("a document of its own is identified", () => {
        expect(isIdentified("did:ng:o:abc:v:def")).toBe(true);
    });

    it("a location minted inside a memory is not", () => {
        expect(isIdentified("did:ng:o:abc:v:def#place-0")).toBe(false);
        expect(nestedIn("did:ng:o:abc:v:def#place-0")).toBe(
            "did:ng:o:abc:v:def"
        );
        expect(nestedIn("did:ng:o:abc:v:def")).toBeUndefined();
    });
});

describe("placeLabel", () => {
    it("prefers the name", () => {
        expect(placeLabel(place("p", { name: "Sintra" }), "p")).toBe("Sintra");
    });

    it("falls back to coordinates", () => {
        expect(placeLabel(place("p", { lat: 38.7, lon: -9.1 }), "p")).toBe(
            "38.70000, -9.10000"
        );
    });

    it("says what it cannot resolve, rather than nothing (§8)", () => {
        expect(placeLabel(undefined, "did:ng:o:abc")).toMatch(/not synced/);
        expect(placeLabel(undefined, "did:ng:o:abc#place-0")).toBe(
            "a location"
        );
    });
});

describe("isWithin", () => {
    const all = [
        place("beach", { containedIn: "lisbon" }),
        place("lisbon", { containedIn: "portugal" }),
        place("portugal"),
    ];

    it("follows the containing chain", () => {
        expect(isWithin(all, "beach", "portugal")).toBe(true);
        expect(isWithin(all, "beach", "beach")).toBe(true);
        expect(isWithin(all, "portugal", "beach")).toBe(false);
    });

    it("terminates on a cycle", () => {
        const cyclic = [place("a", { containedIn: "b" }), place("b", { containedIn: "a" })];
        expect(isWithin(cyclic, "a", "elsewhere")).toBe(false);
    });
});

describe("containingChain", () => {
    const all = [
        place("beach", { name: "the beach", containedIn: "lisbon" }),
        place("lisbon", { name: "Lisboa", containedIn: "portugal" }),
        place("portugal", { name: "Portugal" }),
    ];

    it("walks outwards, and does not include the place itself", () => {
        expect(containingChain(all, "beach").map((s) => s.iri)).toEqual([
            "lisbon",
            "portugal",
        ]);
        expect(containingChain(all, "portugal")).toEqual([]);
    });

    it("labels a step that has not synced without dropping it", () => {
        const orphan = [place("beach", { containedIn: "nowhere" })];
        expect(containingChain(orphan, "beach")).toEqual([
            { iri: "nowhere", label: "a place not synced here yet" },
        ]);
    });

    it("stops at a place already named, so a cycle repeats no step", () => {
        // Foreign data is free to say Lisboa is in the beach as well.
        const cyclic = [
            place("beach", { containedIn: "lisbon" }),
            place("lisbon", { containedIn: "beach" }),
        ];
        const chain = containingChain(cyclic, "beach");
        expect(chain.map((s) => s.iri)).toEqual(["lisbon"]);
        expect(new Set(chain.map((s) => s.iri)).size).toBe(chain.length);
    });

    it("survives a place that contains itself", () => {
        const selfish = [place("a", { containedIn: "a" })];
        expect(containingChain(selfish, "a")).toEqual([]);
    });

    it("has no chain for a place the store does not know", () => {
        expect(containingChain(all, "unknown")).toEqual([]);
    });
});

describe("locationTriples", () => {
    const mem = "did:ng:o:mem:v:1";

    it("references an identified place and writes nothing about it", () => {
        const t = locationTriples(mem, [{ kind: "place", iri: "did:ng:o:p" }]);
        expect(t).toEqual([`<${mem}> schema:location <did:ng:o:p>`]);
    });

    it("mints an unnamed location inside the memory's own document", () => {
        const t = locationTriples(mem, [
            { kind: "unnamed", lat: 38.68, lon: -9.33, name: "the beach" },
        ]);
        expect(t[0]).toBe(`<${mem}> schema:location <${mem}#place-0>`);
        expect(t).toContain(`<${mem}#place-0> a schema:Place`);
        expect(t).toContain(
            `<${mem}#place-0> schema:name "the beach"`
        );
    });

    it("writes coordinates both flat and as schema:geo", () => {
        // The flat pair is what this app can read back today; schema:geo is
        // what §3.2 asks for and what another app will read.
        const t = coordTriples("did:ng:o:p", 38.7075, -9.1364);
        expect(t).toContain(`<did:ng:o:p> geo:lat "38.7075"^^xsd:decimal`);
        expect(t).toContain(`<did:ng:o:p> schema:geo <did:ng:o:p#geo>`);
        expect(t).toContain(
            `<did:ng:o:p#geo> schema:latitude "38.7075"^^xsd:decimal`
        );
    });

    it("keeps the coordinates node out of a second fragment", () => {
        const t = coordTriples("did:ng:o:mem#place-0", 1, 2);
        expect(t).toContain(
            `<did:ng:o:mem#place-0> schema:geo <did:ng:o:mem#place-0-geo>`
        );
    });
});

describe("draftOf", () => {
    it("reads an identified location back as a reference", () => {
        expect(draftOf("did:ng:o:p", [])).toEqual({
            kind: "place",
            iri: "did:ng:o:p",
        });
    });

    it("reads an unnamed one back with its coordinates", () => {
        const all = [
            place("did:ng:o:mem#place-0", {
                lat: 38.68,
                lon: -9.33,
                name: "the beach",
            }),
        ];
        expect(draftOf("did:ng:o:mem#place-0", all)).toEqual({
            kind: "unnamed",
            lat: 38.68,
            lon: -9.33,
            name: "the beach",
        });
    });
});
