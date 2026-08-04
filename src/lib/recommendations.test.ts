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
    const named = (referents: string[]) => ({ referents, points: [] });
    const ids = (p: ReturnType<typeof promptedBy>) =>
        p.map((x) => x.rec.id);

    it("offers every recommendation about what the memory names", () => {
        expect(ids(promptedBy(all, named(["alfama"])))).toEqual(["r1", "r3"]);
    });

    it("matches a public event referent as readily as a place", () => {
        expect(promptedBy([rec("r", "festival")], named(["festival"])))
            .toHaveLength(1);
    });

    it("offers nothing when nothing is named and nowhere is known", () => {
        expect(promptedBy(all, named([]))).toEqual([]);
    });

    // The workflow this rule exists for: Anna points at a natural pool on a
    // map, Sasha swims there months later and writes it up from photographs.
    // The two coordinates are close and the two IRIs never meet.
    const POOL = { lat: 38.7, lon: -9.4 };
    /** ~340 m east of the pool: what a finger on a map is worth. */
    const NEARLY = { lat: 38.7, lon: -9.3961 };
    const FAR = { lat: 38.75, lon: -9.4 };
    const at = (p: Record<string, { lat: number; lon: number }>) =>
        (r: Recommendation) => p[r.item];

    it("offers what you were told about near where the memory was", () => {
        const [only] = promptedBy(
            [rec("pool", "the-pool")],
            { referents: [], points: [NEARLY] },
            at({ "the-pool": POOL })
        );
        expect(only.rec.id).toBe("pool");
        expect(only.distanceKm).toBeCloseTo(0.34, 1);
    });

    it("leaves alone what you were told about somewhere else", () => {
        // ~5.5 km: the next valley, and not what anybody meant.
        expect(
            promptedBy(
                [rec("pool", "the-pool")],
                { referents: [], points: [FAR] },
                at({ "the-pool": POOL })
            )
        ).toEqual([]);
    });

    it("takes the nearest of everything the memory can offer", () => {
        // A memory that names a place far off and carries a photograph taken
        // at the pool is still a memory of having been at the pool.
        const [only] = promptedBy(
            [rec("pool", "the-pool")],
            { referents: [], points: [FAR, NEARLY] },
            at({ "the-pool": POOL })
        );
        expect(only.distanceKm).toBeCloseTo(0.34, 1);
    });

    it("honours the radius it is given", () => {
        const claims = { referents: [], points: [FAR] };
        expect(
            promptedBy([rec("pool", "the-pool")], claims, at({ "the-pool": POOL }), 10)
        ).toHaveLength(1);
    });

    it("puts what the memory named ahead of what it was merely near", () => {
        const p = promptedBy(
            [rec("near", "the-pool"), rec("named", "alfama")],
            { referents: ["alfama"], points: [NEARLY] },
            at({ "the-pool": POOL })
        );
        expect(ids(p)).toEqual(["named", "near"]);
        expect(p[0].distanceKm).toBeUndefined();
    });

    it("says nothing about a referent whose coordinates it cannot resolve", () => {
        // A place document that has not synced yet is a broken reference (§8),
        // not a reason to guess.
        expect(
            promptedBy([rec("r", "unsynced")], {
                referents: [],
                points: [NEARLY],
            })
        ).toEqual([]);
    });
});
