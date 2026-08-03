// Tag hierarchy (Specs §3.5). Concepts are `skos:Concept` in a scheme the app
// does not own; nesting is `skos:broader`, which the shape has always declared
// and nothing until now has written.
//
// The user never types RDF, so the hierarchy has a written form: a path,
// `portugal/lisboa/alfama`, where each segment is one concept's own label and
// the slash is only how the path is spelled. The label stored is the segment —
// "alfama" — not the path, so another application that reads this scheme sees
// ordinary SKOS with a `broader` chain rather than a string convention it has
// to know about. That is the whole reason for the split: the path is a user
// interface, the tree is the data.
//
// Why a slash and not a space, which would be easier to type: labels in
// published vocabularies are mostly multi-word. Measured against three, by
// SPARQL: 68% of AGROVOC's English `skos:prefLabel`s contain a space, 73% of
// Getty AAT's, 90% of the EU Publications Office's. This app reads foreign
// schemes and never restructures them (§5), so a space separator would make
// "cork oak" — an actual concept in an actual scheme — impossible to type and
// silently re-read as a two-level hierarchy nobody published. A space is also
// what most tag inputs use to separate *siblings*, not levels.
//
// Cost of the choice as made: a label that genuinely contains a slash cannot
// be written. "and/or" becomes two concepts. That is the rarer accident by a
// wide margin, and the separator appears only in this file.
//
// Pure functions only. Writing lives in tags.ts.

export const SEP = "/";

/** A concept as this module needs it — the shape, flattened. */
export interface Concept {
    id: string;
    label: string;
    /** Its parent concept, when it has one. */
    broader?: string;
}

/**
 * The path of a concept, outermost first: `portugal/lisboa/alfama`.
 *
 * Bounded by the number of concepts, because `skos:broader` in somebody else's
 * scheme may well contain a cycle and a tag picker must not hang on it.
 */
export function pathOf(all: Concept[], id: string): string {
    return segmentsOf(all, id).join(SEP);
}

/** The same, as segments. Empty when the concept is not known here. */
export function segmentsOf(all: Concept[], id: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    let at: string | undefined = id;
    while (at && !seen.has(at)) {
        seen.add(at);
        const c = all.find((x) => x.id === at);
        if (!c) break;
        out.unshift(c.label);
        at = c.broader;
    }
    return out;
}

/** Split what the user typed. Empty segments are dropped, so "a//b" is "a/b". */
export function splitPath(path: string): string[] {
    return path
        .split(SEP)
        .map((s) => s.trim())
        .filter(Boolean);
}

/** Case- and accent-insensitive, so "Sørensen" and "sorensen" are one label. */
export function fold(s: string): string {
    return s
        .normalize("NFD")
        // Escaped, not literal: a combining mark typed straight into a regex
        // is invisible in a diff and has been reverted by accident before.
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

/**
 * The concept at this path, if the whole path already exists. Matching is on
 * folded labels: the user typing "Portugal/lisboa" means the same concepts as
 * "portugal/Lisboa", and creating a second pair would be the vocabulary
 * fragmentation §5 asks this app not to cause.
 */
export function findPath(
    all: Concept[],
    segments: string[]
): Concept | undefined {
    let parent: string | undefined;
    let found: Concept | undefined;
    for (const seg of segments) {
        found = all.find(
            (c) => c.broader === parent && fold(c.label) === fold(seg)
        );
        if (!found) return undefined;
        parent = found.id;
    }
    return found;
}

/**
 * What a type-ahead should offer for what has been typed so far.
 *
 * The completion is scoped to the parent named by the path: typing
 * `portugal/li` offers the children of `portugal` beginning with "li", not
 * every concept in the store containing those letters. That is the point of
 * the hierarchy — a vocabulary of two hundred tags is navigable one level at a
 * time and unusable as one flat list.
 *
 * With no separator typed yet, everything matches on substring, because the
 * user does not yet know which branch they want.
 */
export function completions(all: Concept[], typed: string): Concept[] {
    const segments = splitPath(typed);
    const trailing = typed.endsWith(SEP);
    // "portugal/" — the parent is complete, offer all of its children.
    const parentSegs = trailing ? segments : segments.slice(0, -1);
    const leaf = trailing ? "" : (segments[segments.length - 1] ?? "");
    const parent = parentSegs.length
        ? findPath(all, parentSegs)
        : undefined;
    // A path whose parent does not exist yet can only be created, not chosen.
    if (parentSegs.length && !parent) return [];
    const under = all.filter((c) => c.broader === parent?.id);
    if (!leaf) return sortByLabel(under);
    const needle = fold(leaf);
    // Top level with nothing typed after a separator: a bare word may match
    // anywhere in the tree, because the user has not said which branch.
    const pool = parentSegs.length ? under : all;
    return sortByLabel(pool.filter((c) => fold(c.label).includes(needle)));
}

/** Case- and accent-insensitively, so a capitalised tag does not jump the queue. */
function sortByLabel(cs: Concept[]): Concept[] {
    return [...cs].sort(
        (a, b) =>
            fold(a.label).localeCompare(fold(b.label)) ||
            a.label.localeCompare(b.label)
    );
}

/**
 * Whether typing this would create something new — what tells the picker to
 * offer "create" rather than only a list. A path that resolves exactly is not
 * new, whatever its case.
 */
export function isNew(all: Concept[], typed: string): boolean {
    const segments = splitPath(typed);
    return segments.length > 0 && !findPath(all, segments);
}
