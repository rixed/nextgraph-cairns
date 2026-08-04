import { describe, it, expect } from "vitest";
import {
    parsePrecisionDate,
    datatypeOf,
    interval,
    memoryInterval,
    compareIntervals,
    compareRecent,
    formatPrecisionDate,
    groupByDerivedHeaders,
    atPrecision,
    XSD,
    type PrecisionDate,
} from "./dates";

const d = (lexical: string): PrecisionDate => {
    const parsed = parsePrecisionDate(lexical);
    if (!parsed) throw new Error(`unparsable: ${lexical}`);
    return parsed;
};

describe("parsePrecisionDate", () => {
    it("derives precision from the lexical shape (§3.1 table)", () => {
        expect(d("2019").precision).toBe("year");
        expect(d("2019-08").precision).toBe("month");
        expect(d("2019-08-14").precision).toBe("day");
        expect(d("2019-08-14T19:30:00+01:00").precision).toBe("dateTime");
        expect(d("2019-08-14T19:30:00").precision).toBe("dateTime");
    });

    it("rejects junk", () => {
        expect(parsePrecisionDate("")).toBeUndefined();
        expect(parsePrecisionDate(undefined)).toBeUndefined();
        expect(parsePrecisionDate("hello")).toBeUndefined();
        expect(parsePrecisionDate("2019-8")).toBeUndefined();
    });

    it("maps to the right XSD datatypes", () => {
        expect(datatypeOf(d("2019"))).toBe(`${XSD}gYear`);
        expect(datatypeOf(d("2019-08"))).toBe(`${XSD}gYearMonth`);
        expect(datatypeOf(d("2019-08-14"))).toBe(`${XSD}date`);
        expect(datatypeOf(d("2019-08-14T19:30:00"))).toBe(`${XSD}dateTime`);
    });
});

describe("interval", () => {
    it("expands each precision to its full span", () => {
        const y = interval(d("2019"));
        expect(new Date(y.earliest).getFullYear()).toBe(2019);
        expect(new Date(y.latest).getFullYear()).toBe(2019);
        expect(new Date(y.latest + 1).getFullYear()).toBe(2020);

        const m = interval(d("2019-08"));
        expect(new Date(m.earliest).getMonth()).toBe(7);
        expect(new Date(m.latest).getMonth()).toBe(7);
        expect(new Date(m.latest + 1).getMonth()).toBe(8);

        const day = interval(d("2019-08-14"));
        expect(new Date(day.earliest).getDate()).toBe(14);
        expect(new Date(day.latest).getDate()).toBe(14);

        const t = interval(d("2019-08-14T19:30:00"));
        expect(t.earliest).toBe(t.latest);
    });

    it("covers [start.earliest, end.latest] when an end date exists", () => {
        const span = memoryInterval(d("2019-08"), d("2019-10"));
        expect(new Date(span.earliest).getMonth()).toBe(7);
        expect(new Date(span.latest).getMonth()).toBe(9);
    });
});

describe("collation (§3.1)", () => {
    it("sorts by earliest, ties by latest — coarse before fine", () => {
        const items = [
            d("2019-08-14"),
            d("2019"), // the umbrella: same earliest year boundary? no — Jan 1 vs Aug 14
            d("2019-03"),
            d("2018-12-31"),
            d("2019-01-01"),
        ];
        const sorted = [...items].sort((a, b) =>
            compareIntervals(interval(a), interval(b))
        );
        expect(sorted.map((x) => x.lexical)).toEqual([
            "2018-12-31",
            "2019", // ties on earliest broken coarse-first: umbrella heads its span
            "2019-01-01",
            "2019-03",
            "2019-08-14",
        ]);
    });

    it("puts the umbrella memory at the head of its span", () => {
        // "The Van Year", dated 2019, sorts above everything else in 2019.
        const van = d("2019");
        const finer = [d("2019-01-01"), d("2019-06-15"), d("2019-12-31")];
        for (const f of finer) {
            expect(
                compareIntervals(interval(van), interval(f))
            ).toBeLessThan(0);
        }
    });
});

describe("compareRecent — the collation rule read backwards", () => {
    const sorted = (lexicals: string[]) =>
        [...lexicals]
            .map(d)
            .sort((a, b) => compareRecent(interval(a), interval(b)))
            .map((x) => x.lexical);

    it("leads with what happened last", () => {
        expect(sorted(["2019-03", "2018-12-31", "2019-08-14"])).toEqual([
            "2019-08-14",
            "2019-03",
            "2018-12-31",
        ]);
    });

    it("keeps the umbrella at the head of its span, not the foot", () => {
        // The whole reason this is not `-compareIntervals`: negating the
        // collation rule sorts by earliest descending, and 2019's earliest is
        // the smallest in 2019 — the umbrella would end up below everything it
        // refers to.
        expect(sorted(["2019-01-01", "2019", "2019-06-15", "2019-12-31"])).toEqual(
            ["2019", "2019-12-31", "2019-06-15", "2019-01-01"]
        );
    });

    it("holds at every granularity, not just the year", () => {
        // A memory dated 2019-07 heads July exactly as 2019 heads the year.
        expect(sorted(["2019-07-20", "2019-07", "2019-08-05"])).toEqual([
            "2019-08-05",
            "2019-07",
            "2019-07-20",
        ]);
    });
});

describe("formatting shows stored precision, never more", () => {
    it("formats each precision", () => {
        expect(formatPrecisionDate(d("2019"), "en")).toBe("2019");
        expect(formatPrecisionDate(d("2019-08"), "en")).toBe("August 2019");
        expect(formatPrecisionDate(d("2019-08-14"), "en")).toBe(
            "August 14, 2019"
        );
        expect(formatPrecisionDate(d("2019-08-14T19:30:00"), "en")).toContain(
            "August 14, 2019"
        );
    });
});

describe("groupByDerivedHeaders", () => {
    const sortByCollation = (xs: PrecisionDate[]) =>
        [...xs].sort((a, b) => compareIntervals(interval(a), interval(b)));

    it("segments by year; mixed months give a year header, a lone month gives its month", () => {
        const groups = groupByDerivedHeaders(
            sortByCollation([d("2018-05-01"), d("2019-03"), d("2019-08-14")]),
            (x) => x,
            "en"
        );
        expect(groups.map((g) => g.header)).toEqual(["May 2018", "2019"]);
    });

    it("uses the month when the whole group shares it", () => {
        const groups = groupByDerivedHeaders(
            sortByCollation([d("2019-08-02"), d("2019-08"), d("2019-08-14")]),
            (x) => x,
            "en"
        );
        expect(groups).toHaveLength(1);
        expect(groups[0].header).toBe("August 2019");
    });

    it("falls back to the year when a coarse member is present", () => {
        const groups = groupByDerivedHeaders(
            sortByCollation([d("2019"), d("2019-08-14")]),
            (x) => x,
            "en"
        );
        expect(groups[0].header).toBe("2019");
        // and the umbrella is first in the group
        expect(groups[0].items[0].lexical).toBe("2019");
    });

    it("gives a year one header even when a span reaches out of it", () => {
        // Sorted newest-first by span end, a memory running from December into
        // the next year sits among the later year's rows while belonging to the
        // earlier one. Grouping by runs would emit "2019" twice, split around
        // it; grouping by year cannot.
        const crossing = memoryInterval(d("2019-12-15"), d("2020-01-10"));
        const rows = [
            { start: d("2020-06-01"), span: interval(d("2020-06-01")) },
            { start: d("2019-12-15"), span: crossing },
            { start: d("2019-05-01"), span: interval(d("2019-05-01")) },
        ].sort((a, b) => compareRecent(a.span, b.span));
        const groups = groupByDerivedHeaders(rows, (r) => r.start, "en");
        // "June 2020" rather than "2020": that group has one member and the
        // header takes the coarsest unit its members share.
        expect(groups.map((g) => g.header)).toEqual(["June 2020", "2019"]);
        expect(groups[1].items).toHaveLength(2);
        // The crossing memory belongs to the year it started in, and leads it.
        expect(groups[1].items[0].start.lexical).toBe("2019-12-15");
    });
});

describe("atPrecision", () => {
    it("truncates and extends between precisions", () => {
        const day = d("2019-08-14");
        expect(atPrecision(day, "year").lexical).toBe("2019");
        expect(atPrecision(day, "month").lexical).toBe("2019-08");
        expect(atPrecision(d("2019"), "day").lexical).toBe("2019-01-01");
        expect(atPrecision(day, "dateTime").precision).toBe("dateTime");
    });
});
