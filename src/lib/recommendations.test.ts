import { describe, expect, it } from "vitest";
import { fulfilments, promptedBy, type Recommendation } from "./recommendations";

const rec = (id: string, item: string): Recommendation => ({
    doc: "list",
    id,
    item,
    tags: [],
});

describe("fulfilments", () => {
    it("reads what the memories say, and nothing else (§4.1)", () => {
        expect(
            fulfilments([
                { "@graph": "m1", wasInfluencedBy: ["rec-a"] },
                { "@graph": "m2", wasInfluencedBy: ["rec-b", "rec-a"] },
                { "@graph": "m3" },
            ])
        ).toEqual(
            new Map([
                ["rec-a", ["m1", "m2"]],
                ["rec-b", ["m2"]],
            ])
        );
    });

    it("keeps both visits when you went twice", () => {
        // The second visit does not undo the first, and either is a way back
        // to a memory, so neither may be dropped.
        expect(
            fulfilments([
                { "@graph": "spring", wasInfluencedBy: ["rec"] },
                { "@graph": "autumn", wasInfluencedBy: ["rec"] },
            ]).get("rec")
        ).toEqual(["spring", "autumn"]);
    });

    it("is empty for an archive that names none", () => {
        expect(fulfilments([{ "@graph": "m1" }]).size).toBe(0);
    });
});

describe("promptedBy", () => {
    const all = [rec("r1", "alfama"), rec("r2", "porto"), rec("r3", "alfama")];

    it("offers every recommendation about what the memory claims", () => {
        expect(promptedBy(all, ["alfama"]).map((r) => r.id)).toEqual([
            "r1",
            "r3",
        ]);
    });

    it("matches a public event referent as readily as a place", () => {
        expect(promptedBy([rec("r", "festival")], ["festival"])).toHaveLength(1);
    });

    it("offers nothing for a memory that claims nowhere identified", () => {
        // A dropped pin never appears in the referent list: nothing can point
        // at it (§1.3), a recommendation least of all.
        expect(promptedBy(all, [])).toEqual([]);
    });
});
