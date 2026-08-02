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

// The two S-01 cards. Built on ResolvedRecommendation directly: `resolve` is
// plumbing over three lookups, and what is worth pinning down is which of the
// two cards a given thing lands on — the rule §6.2 states and the one place
// where "nearby" and "soon" have to agree.
import { bestMoment, nearbyRecommended } from "./heardAbout";
import type { ResolvedRecommendation } from "./heardAbout";

const rec = (
    id: string,
    r: Partial<ResolvedRecommendation> & { fulfilled?: boolean } = {}
): ResolvedRecommendation => ({
    rec: {
        doc: "d",
        id,
        item: "i",
        tags: [],
        fulfilledBy: r.fulfilled ? "a-memory" : undefined,
    },
    label: id,
    ...r,
    // Derived, never passed in: a fixture that could claim "upcoming" while
    // holding a span from 2019 would test nothing.
    urgency: urgencyOf(r, NOW),
});

describe("bestMoment", () => {
    const near = { distanceKm: 3 };

    it("wants both halves: happening soon and nearby", () => {
        const rows = [
            rec("here and now", {
                ...near,
                span: span(NOW + DAY, NOW + 2 * DAY),
            }),
            rec("soon but far", {
                distanceKm: 900,
                span: span(NOW + DAY, NOW + 2 * DAY),
            }),
            rec("near but undated", near),
            rec("near but over", { ...near, span: span(NOW - 40 * DAY) }),
        ];
        expect(bestMoment(rows, NOW).map((r) => r.label)).toEqual([
            "here and now",
        ]);
    });

    it("keeps something already under way", () => {
        expect(
            bestMoment(
                [rec("started yesterday", { ...near, span: span(NOW - DAY, NOW + DAY) })],
                NOW
            )
        ).toHaveLength(1);
    });

    it("drops one you have already been to", () => {
        // The card is a prompt to go somewhere, and you went.
        expect(
            bestMoment(
                [
                    rec("been there", {
                        ...near,
                        span: span(NOW + DAY),
                        fulfilled: true,
                    }),
                ],
                NOW
            )
        ).toEqual([]);
    });
});

describe("nearbyRecommended", () => {
    it("takes a nearby place whether or not it has a date", () => {
        expect(
            nearbyRecommended(
                [
                    rec("a bar", { distanceKm: 1 }),
                    rec("far away", { distanceKm: 400 }),
                ],
                NOW
            ).map((r) => r.label)
        ).toEqual(["a bar"]);
    });

    it("never repeats what the first card already showed", () => {
        const rows = [
            rec("the festival", { distanceKm: 2, span: span(NOW + DAY) }),
        ];
        expect(bestMoment(rows, NOW)).toHaveLength(1);
        expect(nearbyRecommended(rows, NOW)).toEqual([]);
    });

    it("leaves out something whose date has passed", () => {
        expect(
            nearbyRecommended(
                [rec("last year's fair", { distanceKm: 1, span: span(NOW - 300 * DAY) })],
                NOW
            )
        ).toEqual([]);
    });
});
