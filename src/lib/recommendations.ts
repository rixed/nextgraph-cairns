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
    /** The memory that fulfilled it, if one has. */
    fulfilledBy?: string;
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
        fulfilledBy: r.about,
    };
}

/** Call during component initialisation, like any other subscription hook. */
export function useRecommendations() {
    const recs = useShape(RecommendationShapeType, "did:ng:i");
    return {
        get all(): Recommendation[] {
            return (
                ([...recs] as unknown as RecShape[])
                    .map(toRecommendation)
                    // A subject appears as soon as it matches the shape, and the
                    // rest of its triples follow (§8, "partially loaded"). One
                    // without a referent yet is not something to show — it is
                    // not a recommendation about anything until the IRI lands,
                    // and every screen would otherwise have to guard the join.
                    .filter((r) => !!r.item)
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
 * Everything the editor owns. `schema:about` is not here on purpose: fulfilment
 * is a fact about a memory that was captured, not a field of the form, and
 * editing a note must not quietly forget that you went.
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
 * §6.2, S-21: "capturing at a recommended place or event marks that
 * recommendation fulfilled". Called with what the memory claims — its locations
 * and the public event it is about — and the memory's own document.
 *
 * One update for all of them, whatever their number: spike 8's rule, and the
 * reason a memory saved at three recommended places cannot come out half
 * fulfilled. Already-fulfilled recommendations are left alone; the first visit
 * is the one that answers "did I ever go?", and overwriting it with the most
 * recent would lose that.
 */
export async function fulfilRecommendations(
    all: Recommendation[],
    referents: string[],
    memoryDoc: string
): Promise<Recommendation[]> {
    const hit = all.filter(
        (r) => !r.fulfilledBy && referents.includes(r.item)
    );
    if (!hit.length) return [];
    const s = await sessionPromise;
    // They may in principle sit in different list documents; group so each
    // update names the document it commits to.
    const byDoc = new Map<string, Recommendation[]>();
    for (const r of hit) {
        const list = byDoc.get(r.doc) ?? [];
        list.push(r);
        byDoc.set(r.doc, list);
    }
    for (const [doc, items] of byDoc) {
        const t = items
            .map((r) => `<${r.id}> schema:about <${memoryDoc}>`)
            .join(" .\n");
        await s.ng.sparql_update(
            s.session_id,
            `${SPARQL_PREFIXES}
             INSERT DATA { GRAPH <${doc}> {\n${t} .\n} }`,
            doc
        );
    }
    return hit;
}
