import { describe, expect, it } from "vitest";
import { imminent, overlapping, type Reservation } from "./reservations.svelte";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = Date.parse("2026-08-02T12:00:00Z");

const r = (
    id: string,
    start?: number,
    end?: number
): Reservation => ({
    id,
    kind: "LodgingReservation",
    startMs: start,
    endMs: end,
});

describe("imminent", () => {
    it("takes what starts within the horizon", () => {
        expect(
            imminent([r("a", NOW + 6 * HOUR), r("b", NOW + 5 * DAY)], NOW).map(
                (x) => x.id
            )
        ).toEqual(["a"]);
    });

    it("keeps a stay already under way", () => {
        // The logistics worth surfacing include the hotel you are in.
        expect(
            imminent([r("a", NOW - 2 * DAY, NOW + 2 * DAY)], NOW)
        ).toHaveLength(1);
    });

    it("drops what is over", () => {
        expect(imminent([r("a", NOW - 5 * DAY, NOW - 4 * DAY)], NOW)).toEqual(
            []
        );
    });

    it("ignores a reservation with no time at all", () => {
        // §8: never invent a moment for a document that did not state one.
        expect(imminent([r("a", undefined)], NOW)).toEqual([]);
    });
});

describe("overlapping", () => {
    const span = { earliest: NOW, latest: NOW + DAY };

    it("takes one that touches the span at either end", () => {
        expect(
            overlapping(
                [
                    r("before", NOW - 2 * DAY, NOW + HOUR),
                    r("after", NOW + DAY - HOUR, NOW + 3 * DAY),
                    r("outside", NOW + 5 * DAY),
                ],
                span
            ).map((x) => x.id)
        ).toEqual(["before", "after"]);
    });

    it("treats an instant as overlapping when it falls inside", () => {
        expect(overlapping([r("dinner", NOW + HOUR)], span)).toHaveLength(1);
    });
});
