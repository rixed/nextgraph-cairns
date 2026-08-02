import { describe, expect, it } from "vitest";
import {
    eventSpan,
    isExpired,
    isLive,
    type PublicEvent,
} from "./events.svelte";
import { parsePrecisionDate } from "./dates";

const ev = (start?: string, end?: string): PublicEvent => ({
    id: "e",
    start: parsePrecisionDate(start),
    end: parsePrecisionDate(end),
});

const at = (iso: string) => Date.parse(iso);

describe("eventSpan", () => {
    it("covers the whole of a coarsely dated event", () => {
        // "Some time in June" is live for all of June, not on the 1st only.
        const span = eventSpan(ev("2026-06"))!;
        expect(new Date(span.earliest).getMonth()).toBe(5);
        expect(new Date(span.latest).getMonth()).toBe(5);
        expect(new Date(span.latest).getDate()).toBe(30);
    });

    it("runs from the start of the first day to the end of the last", () => {
        const span = eventSpan(ev("2026-06-01", "2026-06-03"))!;
        expect(new Date(span.earliest).getDate()).toBe(1);
        expect(new Date(span.latest).getDate()).toBe(3);
    });

    it("has no span at all when nobody dated it", () => {
        expect(eventSpan(ev())).toBeUndefined();
    });
});

describe("isExpired", () => {
    it("is historical once the whole span is behind us (§4.2)", () => {
        expect(isExpired(ev("2019-08-03", "2019-08-11"), at("2026-08-02"))).toBe(
            true
        );
    });

    it("is not expired mid-run", () => {
        expect(isExpired(ev("2026-08-01", "2026-08-05"), at("2026-08-02"))).toBe(
            false
        );
    });

    it("counts a month-precision event as live all month", () => {
        // The coarse-date rule of §8: never invent a finer moment than was
        // stated, in either direction.
        expect(isExpired(ev("2026-08"), at("2026-08-30"))).toBe(false);
    });

    it("never expires an undated event", () => {
        // A recurring thing whose dates nobody wrote down is not over.
        expect(isExpired(ev(), at("2026-08-02"))).toBe(false);
    });
});

describe("isLive", () => {
    it("is live inside its span and not outside it", () => {
        const e = ev("2026-08-01", "2026-08-05");
        expect(isLive(e, at("2026-08-02"))).toBe(true);
        expect(isLive(e, at("2026-07-30"))).toBe(false);
        expect(isLive(e, at("2026-08-09"))).toBe(false);
    });

    it("says nothing about an event with no dates", () => {
        expect(isLive(ev(), at("2026-08-02"))).toBe(false);
    });
});
