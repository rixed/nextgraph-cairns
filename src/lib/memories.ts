// Memory mutations. One document per memory (Specs §3); the memory's subject
// IRI is the document NURI itself. Reads happen reactively via useShape with
// the wildcard scope; writes go through SPARQL so date literals keep their
// datatype and all mutations share one code path.

import { sessionPromise } from "./ngSession";
import type { PrecisionDate } from "./dates";
import {
    SPARQL_PREFIXES,
    dateLiteral,
    stringLiteral,
} from "./typedLiterals";
import {
    dropNestedPlaces,
    locationTriples,
    type LocationDraft,
} from "./places";

export interface MemoryFields {
    startDate: PrecisionDate;
    endDate?: PrecisionDate;
    name?: string;
    description?: string;
    text?: string;
    /** Concept IRIs (dcterms:subject). */
    tags?: string[];
    /** Media documents attached explicitly (schema:subjectOf, §3.4). */
    media?: string[];
    /**
     * Locations claimed by this memory (§3.2): references to identified
     * places, and unnamed ones written into this memory's own document.
     */
    locations?: LocationDraft[];
}

function fieldTriples(subject: string, f: MemoryFields): string {
    const t = [
        // app:Memory ⊑ schema:Event (§3). Nothing here reasons over the
        // subclass, so the memory asserts both types itself — that is what
        // makes it legible to an app that has never heard of Cairns (§3.6).
        `<${subject}> a app:Memory`,
        `<${subject}> a schema:Event`,
        `<${subject}> schema:startDate ${dateLiteral(f.startDate)}`,
    ];
    if (f.endDate)
        t.push(`<${subject}> schema:endDate ${dateLiteral(f.endDate)}`);
    if (f.name) t.push(`<${subject}> schema:name ${stringLiteral(f.name)}`);
    if (f.description)
        t.push(
            `<${subject}> schema:description ${stringLiteral(f.description)}`
        );
    if (f.text) t.push(`<${subject}> schema:text ${stringLiteral(f.text)}`);
    for (const tag of f.tags ?? [])
        t.push(`<${subject}> dcterms:subject <${tag}>`);
    for (const m of f.media ?? [])
        t.push(`<${subject}> schema:subjectOf <${m}>`);
    t.push(...locationTriples(subject, f.locations ?? []));
    return t.join(" .\n") + " .";
}

/** Create a new memory in its own document; returns the document NURI. */
export async function createMemory(f: MemoryFields): Promise<string> {
    const s = await sessionPromise;
    const doc: string = await s.ng.doc_create(
        s.session_id,
        "Graph",
        "data:graph",
        "store",
        undefined
    );
    await s.ng.sparql_update(
        s.session_id,
        `${SPARQL_PREFIXES}
         INSERT DATA { GRAPH <${doc}> {\n${fieldTriples(doc, f)}\n} }`,
        doc
    );
    return doc;
}

const EDITABLE = [
    "schema:startDate",
    "schema:endDate",
    "schema:name",
    "schema:description",
    "schema:text",
    "dcterms:subject",
    "schema:subjectOf",
    "schema:location",
];

/** Replace all editable fields of a memory with the given values. */
export async function updateMemory(
    doc: string,
    f: MemoryFields
): Promise<void> {
    const s = await sessionPromise;
    const ops = EDITABLE.map(
        (p) =>
            `DELETE WHERE { GRAPH <${doc}> { <${doc}> ${p} ?v } }`
    );
    // Unlinking an unnamed location would leave its triples behind, still
    // matching the place shape — the same orphan the media notes have (§3.2).
    ops.push(...dropNestedPlaces(doc));
    ops.push(
        `INSERT DATA { GRAPH <${doc}> {\n${fieldTriples(doc, f)}\n} }`
    );
    await s.ng.sparql_update(
        s.session_id,
        `${SPARQL_PREFIXES}\n` + ops.join(" ;\n"),
        doc
    );
}

/**
 * Add concepts to many memories at once — the common bulk action (§4.4).
 * One update per document, because a document is the unit a write commits to;
 * they run in sequence so a failure stops rather than half-applies.
 */
export async function addTags(
    docs: string[],
    tags: string[]
): Promise<void> {
    if (!tags.length) return;
    const s = await sessionPromise;
    for (const doc of docs) {
        const t = tags
            .map((tag) => `<${doc}> dcterms:subject <${tag}>`)
            .join(" .\n");
        await s.ng.sparql_update(
            s.session_id,
            `${SPARQL_PREFIXES}
             INSERT DATA { GRAPH <${doc}> {\n${t} .\n} }`,
            doc
        );
    }
}

/** The reverse: untag in bulk. A tag that was not there is not an error. */
export async function removeTags(
    docs: string[],
    tags: string[]
): Promise<void> {
    if (!tags.length) return;
    const s = await sessionPromise;
    for (const doc of docs) {
        const ops = tags.map(
            (tag) =>
                `DELETE DATA { GRAPH <${doc}> {
                    <${doc}> dcterms:subject <${tag}> } }`
        );
        await s.ng.sparql_update(
            s.session_id,
            `${SPARQL_PREFIXES}\n` + ops.join(" ;\n"),
            doc
        );
    }
}

/**
 * Delete a memory: drop every triple of its document. Recovery is the
 * framework's commit history (§1.2) — nothing is rewritten, a new commit
 * removes the current state.
 */
export async function deleteMemory(doc: string): Promise<void> {
    const s = await sessionPromise;
    await s.ng.sparql_update(
        s.session_id,
        `DELETE WHERE { GRAPH <${doc}> { ?s ?p ?o } }`,
        doc
    );
}
