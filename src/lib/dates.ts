// The Specs §3.1 date model. Precision is intrinsic to the literal's datatype;
// in the app it is derived from the lexical form and everything else (intervals,
// collation, headers, formatting) follows from it. Pure functions only.

export type Precision = "year" | "month" | "day" | "dateTime";

export interface PrecisionDate {
    /** The RDF lexical form, e.g. "2019", "2019-08", "2019-08-14", "2019-08-14T19:30:00+01:00". */
    lexical: string;
    precision: Precision;
}

export interface Interval {
    earliest: number; // epoch ms
    latest: number; // epoch ms
}

const RE = {
    year: /^-?\d{4}$/,
    month: /^-?\d{4}-\d{2}$/,
    day: /^-?\d{4}-\d{2}-\d{2}$/,
} as const;

export const XSD = "http://www.w3.org/2001/XMLSchema#";

const DATATYPE: Record<Precision, string> = {
    year: `${XSD}gYear`,
    month: `${XSD}gYearMonth`,
    day: `${XSD}date`,
    dateTime: `${XSD}dateTime`,
};

/** Short datatype name for SPARQL prefixes (xsd:gYear …). */
export const XSD_NAME: Record<Precision, string> = {
    year: "gYear",
    month: "gYearMonth",
    day: "date",
    dateTime: "dateTime",
};

export function datatypeOf(d: PrecisionDate): string {
    return DATATYPE[d.precision];
}

/** Parse an RDF lexical form; returns undefined for anything unrecognized. */
export function parsePrecisionDate(
    lexical: string | undefined | null
): PrecisionDate | undefined {
    if (!lexical) return undefined;
    const s = lexical.trim();
    if (RE.year.test(s)) return { lexical: s, precision: "year" };
    if (RE.month.test(s)) return { lexical: s, precision: "month" };
    if (RE.day.test(s)) return { lexical: s, precision: "day" };
    if (s.includes("T") && !Number.isNaN(Date.parse(s)))
        return { lexical: s, precision: "dateTime" };
    return undefined;
}

function parts(d: PrecisionDate): { y: number; m: number; day: number } {
    const neg = d.lexical.startsWith("-");
    const body = neg ? d.lexical.slice(1) : d.lexical;
    const [y, m, dd] = body.split(/[-T]/);
    return {
        y: (neg ? -1 : 1) * Number(y),
        m: m ? Number(m) : 1,
        day: dd ? Number(dd) : 1,
    };
}

/**
 * Expand to the [earliest, latest] interval the value covers (§3.1 collation
 * rule). Date-only values are taken in local time, like the lived day they name.
 */
export function interval(d: PrecisionDate): Interval {
    const { y, m, day } = parts(d);
    switch (d.precision) {
        case "year":
            return {
                earliest: new Date(y, 0, 1).getTime(),
                latest: new Date(y + 1, 0, 1).getTime() - 1,
            };
        case "month":
            return {
                earliest: new Date(y, m - 1, 1).getTime(),
                latest: new Date(y, m, 1).getTime() - 1,
            };
        case "day":
            return {
                earliest: new Date(y, m - 1, day).getTime(),
                latest: new Date(y, m - 1, day + 1).getTime() - 1,
            };
        case "dateTime": {
            const t = Date.parse(d.lexical);
            return { earliest: t, latest: t };
        }
    }
}

/** The interval a memory covers: startDate alone, or [start.earliest, end.latest]. */
export function memoryInterval(
    start: PrecisionDate,
    end?: PrecisionDate
): Interval {
    const s = interval(start);
    if (!end) return s;
    return { earliest: s.earliest, latest: interval(end).latest };
}

/**
 * §3.1 collation: smallest earliest first, ties broken by largest latest, so
 * coarser values sort before finer ones within the same span (umbrella
 * memories head their span).
 */
export function compareIntervals(a: Interval, b: Interval): number {
    return a.earliest - b.earliest || b.latest - a.latest;
}

/** Rendering shows exactly the precision stored and never invents more. */
export function formatPrecisionDate(
    d: PrecisionDate,
    locale?: string
): string {
    const { y, m, day } = parts(d);
    switch (d.precision) {
        case "year":
            return String(y);
        case "month":
            return new Intl.DateTimeFormat(locale, {
                year: "numeric",
                month: "long",
            }).format(new Date(y, m - 1, 1));
        case "day":
            return new Intl.DateTimeFormat(locale, {
                year: "numeric",
                month: "long",
                day: "numeric",
            }).format(new Date(y, m - 1, day));
        case "dateTime":
            return new Intl.DateTimeFormat(locale, {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            }).format(new Date(Date.parse(d.lexical)));
    }
}

/** A group of consecutive sorted items under one derived header. */
export interface DateGroup<T> {
    header: string;
    items: T[];
}

/**
 * Group a collation-sorted list into year segments; each header uses the
 * coarsest unit shared by the group (the year, or the month when every member
 * falls inside the same month).
 */
export function groupByDerivedHeaders<T>(
    sorted: T[],
    getStart: (item: T) => PrecisionDate,
    locale?: string
): DateGroup<T>[] {
    const groups: { year: number; items: T[] }[] = [];
    for (const item of sorted) {
        const y = parts(getStart(item)).y;
        const last = groups[groups.length - 1];
        if (last && last.year === y) last.items.push(item);
        else groups.push({ year: y, items: [item] });
    }
    return groups.map((g) => {
        const months = new Set(
            g.items.map((it) => {
                const d = getStart(it);
                return d.precision === "year" ? "coarse" : parts(d).m;
            })
        );
        let header = String(g.year);
        if (months.size === 1 && !months.has("coarse")) {
            const m = [...months][0] as number;
            header = new Intl.DateTimeFormat(locale, {
                year: "numeric",
                month: "long",
            }).format(new Date(g.year, m - 1, 1));
        }
        return { header, items: g.items };
    });
}

/** Today's date at day precision — the S-21 capture default. */
export function today(): PrecisionDate {
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return {
        lexical: `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`,
        precision: "day",
    };
}

/** Truncate/extend a lexical form to a new precision (for the picker switch). */
export function atPrecision(
    d: PrecisionDate | undefined,
    precision: Precision
): PrecisionDate {
    const base = d ?? today();
    const { y, m, day } = parts(base);
    const p = (n: number) => String(n).padStart(2, "0");
    switch (precision) {
        case "year":
            return { lexical: String(y), precision };
        case "month":
            return { lexical: `${y}-${p(m)}`, precision };
        case "day":
            return { lexical: `${y}-${p(m)}-${p(day)}`, precision };
        case "dateTime":
            return { lexical: `${y}-${p(m)}-${p(day)}T12:00:00`, precision };
    }
}
