import { describe, expect, it } from "vitest";
import { parseWkt } from "./tracks.svelte";

describe("parseWkt", () => {
    it("reads a linestring in WKT's longitude-first order", () => {
        expect(parseWkt("LINESTRING(-9.14 38.71, -9.13 38.72)")).toEqual([
            [-9.14, 38.71],
            [-9.13, 38.72],
        ]);
    });

    it("tolerates the whitespace a real writer leaves", () => {
        expect(parseWkt("  LINESTRING (1 2,3 4 )  ")).toEqual([
            [1, 2],
            [3, 4],
        ]);
    });

    it("returns nothing for geometries this app does not draw", () => {
        // A store may hold polygons and points; the map layer is a line layer,
        // and half-reading a polygon would draw a shape nobody published.
        expect(parseWkt("POLYGON((0 0, 1 0, 1 1, 0 0))")).toEqual([]);
        expect(parseWkt("POINT(1 2)")).toEqual([]);
    });

    it("drops coordinates it cannot read rather than plotting NaN", () => {
        expect(parseWkt("LINESTRING(1 2, north 4, 5 6)")).toEqual([
            [1, 2],
            [5, 6],
        ]);
    });

    it("survives a truncated literal", () => {
        expect(parseWkt("LINESTRING")).toEqual([]);
        expect(parseWkt("")).toEqual([]);
    });
});
