// Recommendations (Specs §4). "Ana told me about this in March", not "I plan to
// go here" — provenance first, which is what keeps them in a memory app and
// what makes them the landing zone for the P1 social phase with no model
// change.
//
// The one thing the app owns that does not get a document each: all of them are
// subjects inside a single `schema:ItemList` document (§3.7), addressed by
// fragment. Spike 10 established that this works in every direction that
// matters — a new sibling reaches a live subscription without a reload, one item
// deletes without disturbing its neighbours, and precision dates survive.
//
// Reads go through the shape over the wildcard scope, like places and people.
// Writes go through SPARQL, because `dcterms:date` is precision-aware (spike 2).

import { useShape } from "@ng-org/orm/svelte";
import { OrmSubscription, normalizeScope } from "@ng-org/orm";
import { sessionPromise } from "./ngSession";
import { select } from "./query";
import { oneEach } from "./identity";
import { RecommendationShapeType } from "../shapes/orm/recommendationShape.shapeTypes";
import type { Recommendation as RecShape } from "../shapes/orm/recommendationShape.typings";
import { SPARQL_PREFIXES, dateLiteral, stringLiteral } from "./typedLiterals";
import { parsePrecisionDate, type PrecisionDate } from "./dates";

/** A recommendation as the app cares about it, flattened from the shape. */
export interface Recommendation {
    /** The list document it lives in. */
    doc: string;
    /** The subject IRI, `<list>#rec-…`. */
    id: string;
    /** What was recommended: a place or an event (§4.2). */
    item: string;
    /** Who told you, when they are a contact. */
    attributedTo?: string;
    /** Who told you otherwise: a URL, or free text. */
    source?: string;
    /** When you were told (§4.1), at whatever precision was stated. */
    told?: PrecisionDate;
    note?: string;
    tags: string[];
}

export function toRecommendation(r: RecShape): Recommendation {
    return {
        doc: r["@graph"],
        id: r["@id"],
        item: r.item,
        attributedTo: r.wasAttributedTo,
        source: r.source,
        told: parsePrecisionDate(r.date),
        note: r.description,
        tags: [...(r.subject ?? [])],
    };
}

/** Call during component initialisation, like any other subscription hook. */
export function useRecommendations() {
    const recs = useShape(RecommendationShapeType, "did:ng:i");
    return {
        get all(): Recommendation[] {
            return oneEach(
                ([...recs] as unknown as RecShape[])
                    .map(toRecommendation)
                    // A subject appears as soon as it matches the shape, and the
                    // rest of its triples follow (§8, "partially loaded"). One
                    // without a referent yet is not something to show — it is
                    // not a recommendation about anything until the IRI lands,
                    // and every screen would otherwise have to guard the join.
                    .filter((r) => !!r.item),
                // Ours to write, so two records of one is not expected — but
                // the lists key on the IRI like every other (lib/identity.ts).
                (r) => r.id
            );
        },
    };
}

export function recommendationsReady(): Promise<unknown> {
    return OrmSubscription.getOrCreate(
        RecommendationShapeType as any,
        normalizeScope("did:ng:i")
    ).readyPromise;
}

export function findRecommendation(
    all: Recommendation[],
    id: string
): Recommendation | undefined {
    return all.find((r) => r.id === id);
}

/** Every recommendation pointing at this place or event. */
export function about(all: Recommendation[], referent: string): Recommendation[] {
    return all.filter((r) => r.item === referent);
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export interface RecommendationFields {
    /** The referent: a place or event IRI. Required — §4.1's `schema:item`. */
    item: string;
    attributedTo?: string;
    source?: string;
    told?: PrecisionDate;
    note?: string;
    tags?: string[];
}

/**
 * The list document, found by the recommendations it already holds.
 *
 * Deliberately not "any `schema:ItemList` in the store": another application's
 * shopping list is an ItemList too, and appending to it would be exactly the
 * restructuring §5 forbids. Keying on the items means the list is recognised by
 * what it is for rather than by its type alone — at the price of not
 * recognising an empty one, which is why the first item and the list are
 * written in the same statement below and an empty list never exists.
 *
 * §6.2 gives the real answer eventually: S-00 creates the list at onboarding
 * and Preferences record which one it is. Until Preferences exist, this.
 */
async function findList(): Promise<string | undefined> {
    const rows = await select(
        `${SPARQL_PREFIXES}
         SELECT ?g WHERE { GRAPH ?g {
            ?l a schema:ItemList ; schema:itemListElement ?i .
            ?i a app:Recommendation .
         } } LIMIT 1`
    );
    return rows[0]?.g?.value;
}

/**
 * A fresh subject inside the list. Random rather than counted: two devices may
 * both be adding one offline, and a counter would have them mint the same IRI
 * for different recommendations — which the CRDT would merge into one mangled
 * item rather than two.
 */
function mintFragment(): string {
    return `rec-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
}

function fieldTriples(subject: string, f: RecommendationFields): string[] {
    const t = [
        // Both types, for the same reason a memory asserts schema:Event: an
        // application that has never heard of Cairns still reads a list item.
        `<${subject}> a app:Recommendation`,
        `<${subject}> a schema:ListItem`,
        `<${subject}> schema:item <${f.item}>`,
    ];
    if (f.attributedTo)
        t.push(`<${subject}> prov:wasAttributedTo <${f.attributedTo}>`);
    if (f.source?.trim())
        t.push(`<${subject}> dcterms:source ${stringLiteral(f.source.trim())}`);
    if (f.told) t.push(`<${subject}> dcterms:date ${dateLiteral(f.told)}`);
    if (f.note?.trim())
        t.push(`<${subject}> schema:description ${stringLiteral(f.note.trim())}`);
    for (const tag of f.tags ?? [])
        t.push(`<${subject}> dcterms:subject <${tag}>`);
    return t;
}

/** Add one, creating the list document if this is the first. Returns its IRI. */
export async function addRecommendation(
    f: RecommendationFields
): Promise<string> {
    const s = await sessionPromise;
    const existing = await findList();
    const doc =
        existing ??
        ((await s.ng.doc_create(
            s.session_id,
            "Graph",
            "data:graph",
            "store",
            undefined
        )) as string);
    const id = `${doc}#${mintFragment()}`;
    const t = [
        `<${doc}> schema:itemListElement <${id}>`,
        ...fieldTriples(id, f),
    ];
    // The list itself only when it is new, so the first item and the list it
    // belongs to arrive together and a list with no items never exists.
    if (!existing) t.unshift(`<${doc}> a schema:ItemList`);
    await s.ng.sparql_update(
        s.session_id,
        `${SPARQL_PREFIXES}
         INSERT DATA { GRAPH <${doc}> {\n${t.join(" .\n")} .\n} }`,
        doc
    );
    return id;
}

/**
 * Everything the editor owns — which is everything a recommendation has. There
 * is no fulfilment field to preserve across an edit, because fulfilment lives
 * on the memory (§4.1); editing what Ana said cannot forget that you went.
 */
const EDITABLE = [
    "schema:item",
    "prov:wasAttributedTo",
    "dcterms:source",
    "dcterms:date",
    "schema:description",
    "dcterms:subject",
];

export async function updateRecommendation(
    id: string,
    f: RecommendationFields
): Promise<void> {
    const doc = docOf(id);
    const s = await sessionPromise;
    const ops = EDITABLE.map(
        (p) => `DELETE WHERE { GRAPH <${doc}> { <${id}> ${p} ?v } }`
    );
    ops.push(
        `INSERT DATA { GRAPH <${doc}> {\n${fieldTriples(id, f).join(" .\n")} .\n} }`
    );
    await s.ng.sparql_update(
        s.session_id,
        `${SPARQL_PREFIXES}\n` + ops.join(" ;\n"),
        doc
    );
}

/**
 * Remove one. Two statements rather than one conjunctive pattern: a single
 * `DELETE WHERE` naming both the membership triple and the item's own would
 * match nothing at all for an item that somehow lost its link — the lesson
 * `dropNestedPlaces` learned, and spike 10 confirmed here.
 *
 * Note that §4.2 forbids deleting an *expired* recommendation on the app's own
 * initiative. This is the user asking.
 */
export async function removeRecommendation(id: string): Promise<void> {
    const doc = docOf(id);
    const s = await sessionPromise;
    await s.ng.sparql_update(
        s.session_id,
        `${SPARQL_PREFIXES}
         DELETE WHERE { GRAPH <${doc}> {
            <${doc}> schema:itemListElement <${id}> } } ;
         DELETE WHERE { GRAPH <${doc}> { <${id}> ?p ?o } }`,
        doc
    );
}

/** The document a fragment subject lives in. */
function docOf(id: string): string {
    const hash = id.indexOf("#");
    return hash < 0 ? id : id.slice(0, hash);
}

/**
 * Which recommendations a set of memories says were acted on (§4.1: "a
 * recommendation is fulfilled when a memory references it via
 * prov:wasInfluencedBy"). Derived on every read, like every other inference in
 * this app (§1.3.16) — there is nothing to write and nothing to keep in step.
 *
 * Several memories may point at one recommendation: you can go twice, and the
 * first visit is not undone by the second.
 */
export function fulfilments(
    memories: readonly {
        "@graph": string;
        wasInfluencedBy?: Iterable<string>;
    }[]
): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const m of memories)
        for (const rec of m.wasInfluencedBy ?? [])
            out.set(rec, [...(out.get(rec) ?? []), m["@graph"]]);
    return out;
}

/**
 * Recommendations whose referent a memory's claims match — what S-21 offers to
 * link (§6.2: "capturing at a recommended place or event offers to link that
 * recommendation to the memory"). An offer, not a mark: whether you went
 * because Ana said so is a claim about your own intent, and the app does not
 * get to make it for you.
 *
 * `referents` are the identified places and public events the memory claims. A
 * dropped pin is not among them: nothing can point at it (§1.3), including a
 * recommendation.
 */
export function promptedBy(
    all: Recommendation[],
    referents: string[]
): Recommendation[] {
    return all.filter((r) => referents.includes(r.item));
}
