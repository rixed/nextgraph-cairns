import { describe, expect, it } from "vitest";
import { oneEach } from "./identity";

describe("oneEach", () => {
    const rec = (id: string, from: string) => ({ id, from });

    it("shows a subject once, however many documents describe it", () => {
        const all = oneEach(
            [rec("lisboa", "gazetteer"), rec("lisboa", "someone else"), rec("porto", "gazetteer")],
            (x) => x.id
        );
        expect(all.map((x) => x.id)).toEqual(["lisboa", "porto"]);
    });

    it("keeps the first record read, not the last", () => {
        const all = oneEach(
            [rec("lisboa", "gazetteer"), rec("lisboa", "someone else")],
            (x) => x.id
        );
        expect(all[0].from).toBe("gazetteer");
    });

    it("leaves distinct subjects alone, in the order they arrived", () => {
        const all = [rec("b", "x"), rec("a", "x"), rec("c", "x")];
        expect(oneEach(all, (x) => x.id)).toEqual(all);
    });

    it("has nothing to say about an empty set", () => {
        expect(oneEach([], (x: { id: string }) => x.id)).toEqual([]);
    });
});
