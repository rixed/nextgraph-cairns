import { describe, expect, it } from "vitest";
import { spanOf, mediaInSpan, coverFor, takenAtMs, type Media } from "./media";
import type { Memory } from "../shapes/orm/memoryShape.typings";

const media = (
    doc: string,
    takenAt?: string,
    thumb = true,
    kind: Media["kind"] = "image"
): Media => ({
    kind,
    doc,
    id: doc,
    contentUrl: `${doc}#full`,
    thumbnailUrl: thumb ? `${doc}#thumb` : undefined,
    takenAt,
});

const memory = (fields: Partial<Memory> & { startDate: string }): Memory =>
    ({
        "@graph": "mem1",
        "@id": "mem1",
        "@type": new Set(["did:ng:z:cairns/Memory"]),
        ...fields,
    }) as Memory;

const never = () => false;

describe("spanOf", () => {
    it("expands a day to the day it names", () => {
        const s = spanOf("2019-08-14")!;
        expect(new Date(s.earliest).getDate()).toBe(14);
        expect(new Date(s.latest).getDate()).toBe(14);
        expect(s.latest - s.earliest).toBe(86400000 - 1);
    });

    it("runs from the start of the first to the end of the last", () => {
        const s = spanOf("2019-08", "2019-09")!;
        expect(new Date(s.earliest).getMonth()).toBe(7);
        expect(new Date(s.latest).getMonth()).toBe(8);
    });

    it("is undefined when the date is unusable", () => {
        expect(spanOf(undefined)).toBeUndefined();
        expect(spanOf("not a date")).toBeUndefined();
    });
});

describe("mediaInSpan", () => {
    const span = spanOf("2019-08-14")!;

    it("keeps what the camera dated inside the span, in order", () => {
        const found = mediaInSpan(
            [
                media("late", "2019-08-14T18:00:00"),
                media("early", "2019-08-14T09:00:00"),
                media("nextDay", "2019-08-15T09:00:00"),
                media("prevDay", "2019-08-13T23:59:59"),
            ],
            span
        );
        expect(found.map((m) => m.doc)).toEqual(["early", "late"]);
    });

    it("includes the edges of the day", () => {
        const found = mediaInSpan(
            [
                media("first", "2019-08-14T00:00:00"),
                media("last", "2019-08-14T23:59:59"),
            ],
            span
        );
        expect(found).toHaveLength(2);
    });

    it("never associates a photograph the camera did not date", () => {
        expect(mediaInSpan([media("undated", undefined)], span)).toEqual([]);
        expect(takenAtMs(media("junk", "whenever"))).toBeUndefined();
    });
});

describe("coverFor", () => {
    const all = [
        media("photoA", "2019-08-14T09:00:00"),
        media("photoB", "2019-08-14T10:00:00"),
        media("noThumb", "2019-08-14T08:00:00", false),
        media("elsewhere", "2020-01-01T09:00:00"),
    ];

    it("uses the cover the user designated", () => {
        const m = memory({ startDate: "2019-08-14", image: "photoB" });
        expect(coverFor(m, all, never)?.doc).toBe("photoB");
    });

    it("prefers an attached photograph over one merely overlapping", () => {
        const m = memory({
            startDate: "2019-08-14",
            subjectOf: new Set(["elsewhere"]),
        });
        expect(coverFor(m, all, never)?.doc).toBe("elsewhere");
    });

    it("falls back to the first of the day that can be pictured", () => {
        const m = memory({ startDate: "2019-08-14" });
        // noThumb is earlier, but a placeholder cannot stand for a memory.
        expect(coverFor(m, all, never)?.doc).toBe("photoA");
    });

    it("never proposes one the user rejected", () => {
        const m = memory({ startDate: "2019-08-14" });
        const suppressed = (_mem: string, med: string) => med === "photoA";
        expect(coverFor(m, all, suppressed)?.doc).toBe("photoB");
    });

    it("will not let a recording stand in for a photograph", () => {
        // Audio publishes no thumbnail, so it can never be a cover.
        const only = [media("voice", "2019-08-14T09:00:00", false, "audio")];
        expect(coverFor(memory({ startDate: "2019-08-14" }), only, never))
            .toBeUndefined();
    });

    it("has nothing to show when nothing overlaps", () => {
        expect(coverFor(memory({ startDate: "1999" }), all, never)).toBeUndefined();
    });
});
