import { describe, expect, it } from "vitest";
import {
    completions,
    findPath,
    isNew,
    pathOf,
    splitPath,
    type Concept,
} from "./tagPaths";

const c = (id: string, label: string, broader?: string): Concept => ({
    id,
    label,
    broader,
});

// portugal ─ lisboa ─ alfama
//          └ porto
// food     ─ lisboa            (the same word, a different branch)
// weather
const tree: Concept[] = [
    c("pt", "Portugal"),
    c("lx", "Lisboa", "pt"),
    c("alf", "Alfama", "lx"),
    c("op", "Porto", "pt"),
    c("food", "food"),
    c("food-lx", "lisboa", "food"),
    c("w", "weather"),
];

const labels = (cs: Concept[]) => cs.map((x) => x.label);

describe("pathOf", () => {
    it("reads outermost first", () => {
        expect(pathOf(tree, "alf")).toBe("Portugal/Lisboa/Alfama");
    });

    it("is the label alone at the top", () => {
        expect(pathOf(tree, "pt")).toBe("Portugal");
    });

    it("survives a cycle in somebody else's scheme", () => {
        // A picker that hangs on foreign data is worse than one that shows a
        // truncated path.
        const looped = [c("a", "a", "b"), c("b", "b", "a")];
        expect(pathOf(looped, "a")).toBe("b/a");
    });

    it("says nothing about a concept it has never seen", () => {
        expect(pathOf(tree, "nope")).toBe("");
    });
});

describe("splitPath", () => {
    it("trims and drops empty segments", () => {
        expect(splitPath(" portugal / lisboa //")).toEqual([
            "portugal",
            "lisboa",
        ]);
    });
});

describe("findPath", () => {
    it("resolves a full path regardless of case", () => {
        expect(findPath(tree, ["portugal", "LISBOA"])?.id).toBe("lx");
    });

    it("keeps two branches with the same word apart", () => {
        // "lisboa" under food is not "Lisboa" under Portugal — which is the
        // whole reason the path is scoped rather than the label being unique.
        expect(findPath(tree, ["food", "lisboa"])?.id).toBe("food-lx");
        expect(findPath(tree, ["portugal", "lisboa"])?.id).toBe("lx");
    });

    it("does not match a leaf at the wrong depth", () => {
        expect(findPath(tree, ["alfama"])).toBeUndefined();
    });
});

describe("completions", () => {
    it("offers everything matching, before any separator is typed", () => {
        // Both branches, because nothing has been said about which one — by id,
        // since the two share a label and their relative order is arbitrary.
        expect(
            completions(tree, "lis")
                .map((x) => x.id)
                .sort()
        ).toEqual(["food-lx", "lx"]);
    });

    it("offers the children of the parent once one is named", () => {
        expect(labels(completions(tree, "Portugal/"))).toEqual([
            "Lisboa",
            "Porto",
        ]);
    });

    it("narrows those children by what follows the separator", () => {
        expect(labels(completions(tree, "Portugal/po"))).toEqual(["Porto"]);
    });

    it("does not leak other branches into a scoped completion", () => {
        // "lisboa" exists under food, but the user said Portugal.
        expect(labels(completions(tree, "Portugal/lis"))).toEqual(["Lisboa"]);
    });

    it("offers nothing under a parent that does not exist yet", () => {
        // It can still be created — that is `isNew`'s business, not this one's.
        expect(completions(tree, "narnia/x")).toEqual([]);
    });

    it("offers the top level for an empty box", () => {
        expect(labels(completions(tree, ""))).toEqual([
            "food",
            "Portugal",
            "weather",
        ]);
    });
});

describe("isNew", () => {
    it("is false for a path that already resolves, whatever its case", () => {
        expect(isNew(tree, "portugal/lisboa")).toBe(false);
    });

    it("is true for a new leaf under a parent that exists", () => {
        expect(isNew(tree, "Portugal/Sintra")).toBe(true);
    });

    it("is true for a path whose parents do not exist either", () => {
        expect(isNew(tree, "spain/madrid")).toBe(true);
    });

    it("is false for nothing typed", () => {
        expect(isNew(tree, "  ")).toBe(false);
    });
});
