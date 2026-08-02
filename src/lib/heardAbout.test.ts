import { describe, expect, it } from "vitest";
import { sortHeardAbout, urgencyOf, type Rankable } from "./heardAbout";

const DAY = 86_400_000;
const NOW = Date.parse("2026-08-02T12:00:00Z");

interface Row extends Rankable {
    id: string;
}

const row = (id: string, r: Rankable = {}): Row => ({ id, ...r });
const span = (from: number, to = from) => ({ earliest: from, latest: to });
const ids = (rows: Row[]) => rows.map((r) => r.id);

describe("urgencyOf", () => {
    it("distinguishes the four states an item can be in", () => {
        expect(urgencyOf({ span: span(NOW - DAY, NOW + DAY) }, NOW)).toBe("live");
        expect(urgencyOf({ span: span(NOW + 5 * DAY) }, NOW)).toBe("upcoming");
        expect(urgencyOf({ span: span(NOW - 5 * DAY) }, NOW)).toBe("past");
        expect(urgencyOf({}, NOW)).toBe("undated");
    });
});

describe("sortHeardAbout", () => {
    it("puts what is happening first, then places, then what is over", () => {
        expect(
            ids(
                sortHeardAbout(
                    [
                        row("past", { span: span(NOW - 30 * DAY) }),
                        row("place"),
                        row("soon", { span: span(NOW + 3 * DAY) }),
                    ],
                    NOW
                )
            )
        ).toEqual(["soon", "place", "past"]);
    });

    it("ranks a festival under way ahead of one starting next month", () => {
        // Live and upcoming share a bucket; "soonest" means by start date, so
        // the one that began yesterday and runs all week comes first.
        expect(
            ids(
                sortHeardAbout(
                    [
                        row("next month", { span: span(NOW + 30 * DAY) }),
                        row("under way", { span: span(NOW - DAY, NOW + 5 * DAY) }),
                    ],
                    NOW
                )
            )
        ).toEqual(["under way", "next month"]);
    });

    it("breaks a tie by distance, and then by when you were told", () => {
        expect(
            ids(
                sortHeardAbout(
                    [
                        row("far", { distanceKm: 400 }),
                        row("near, old news", {
                            distanceKm: 2,
                            toldMs: NOW - 300 * DAY,
                        }),
                        row("near, fresh", { distanceKm: 2, toldMs: NOW - DAY }),
                    ],
                    NOW
                )
            )
        ).toEqual(["near, fresh", "near, old news", "far"]);
    });

    it("sorts an unknown distance last rather than as zero", () => {
        // No position, or a place with no coordinates: it must not win the
        // "nearest" tiebreak by default.
        expect(
            ids(
                sortHeardAbout(
                    [row("nowhere"), row("somewhere", { distanceKm: 90 })],
                    NOW
                )
            )
        ).toEqual(["somewhere", "nowhere"]);
    });

    it("shows the most recently missed of the expired ones first", () => {
        // §8: marked, never hidden. A festival that just passed comes round
        // again sooner than one from 2019.
        expect(
            ids(
                sortHeardAbout(
                    [
                        row("long gone", { span: span(NOW - 900 * DAY) }),
                        row("just missed", { span: span(NOW - 2 * DAY) }),
                    ],
                    NOW
                )
            )
        ).toEqual(["just missed", "long gone"]);
    });

    it("does not mutate what it was given", () => {
        const input = [row("b", { span: span(NOW + DAY) }), row("a")];
        sortHeardAbout(input, NOW);
        expect(ids(input)).toEqual(["b", "a"]);
    });
});
