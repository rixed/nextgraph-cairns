// Tags are skos:Concepts in a scheme the app does not own (§3.5, §5). Reading
// is wildcard-scoped (foreign schemes are welcome); writing appends concepts to
// a locally-owned fallback scheme, created on first use.
//
// §5's licence is narrow and this file is where it is honoured: **append only**.
// Nothing here renames, merges, deletes, or re-parents a concept — including
// one this app wrote. Creating a missing parent on the way to a new leaf is an
// append, and is the only structural act performed.
//
// The hierarchy the user types (`portugal/lisboa`) is turned into
// `skos:broader` links by tagPaths.ts, which owns the path convention. What is
// stored is ordinary SKOS: a label per concept and a parent link, legible to an
// application that has never heard of the slash.

import { insertObject } from "@ng-org/orm";
import { sessionPromise } from "./ngSession";
import { SPARQL_PREFIXES, stringLiteral } from "./typedLiterals";
import { ConceptShapeType } from "../shapes/orm/tagShape.shapeTypes";
import { findPath, splitPath, type Concept } from "./tagPaths";

const SKOS = "http://www.w3.org/2004/02/skos/core#";

let schemePromise: Promise<string> | undefined;

/** The locally-owned scheme document, created on first use. */
export function schemeDoc(): Promise<string> {
    return (schemePromise ??= findOrCreateScheme());
}

async function findOrCreateScheme(): Promise<string> {
    const s = await sessionPromise;
    const ret = await s.ng.sparql_query(
        s.session_id,
        `SELECT ?doc WHERE { GRAPH ?doc { ?s a <${SKOS}ConceptScheme> } }`,
        undefined,
        undefined
    );
    const found = ret?.results?.bindings?.[0]?.doc?.value;
    if (found) return found;

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
         INSERT DATA { GRAPH <${doc}> {
            <${doc}> a skos:ConceptScheme ;
                skos:prefLabel ${stringLiteral("Cairns tags")} .
         } }`,
        doc
    );
    return doc;
}

/**
 * A concept's subject IRI inside the scheme document. Derived from a random
 * suffix rather than from the label: two devices adding "lisboa" offline would
 * otherwise mint the same IRI for what the CRDT would then merge into one
 * concept — which happens to be right for tags, and is right by accident, so
 * it is not what this relies on. A label is also renamable in principle by the
 * app that owns the vocabulary, and an IRI that encodes it would then lie.
 */
function mintConceptIri(doc: string): string {
    return `${doc}#c-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
}

/**
 * Create every concept along `path` that does not exist yet, and return the
 * leaf's IRI. Existing concepts are reused whatever their case, so typing
 * "Portugal/sintra" beside an existing "portugal" extends that branch rather
 * than starting a rival one.
 *
 * One update for the whole path (spike 8): three new levels are written
 * together or not at all, so a failure cannot leave a parent behind with no
 * child and no way to reach it.
 */
export async function ensurePath(
    all: Concept[],
    path: string
): Promise<string | undefined> {
    const segments = splitPath(path);
    if (!segments.length) return undefined;

    const existing = findPath(all, segments);
    if (existing) return existing.id;

    const doc = await schemeDoc();
    const s = await sessionPromise;

    // Walk down as far as the store already goes, then write the rest.
    const triples: string[] = [];
    let parent: string | undefined;
    let depth = 0;
    for (; depth < segments.length; depth++) {
        const here = findPath(all, segments.slice(0, depth + 1));
        if (!here) break;
        parent = here.id;
    }
    let leaf = parent;
    for (let i = depth; i < segments.length; i++) {
        const iri = mintConceptIri(doc);
        triples.push(
            `<${iri}> a skos:Concept`,
            `<${iri}> skos:prefLabel ${stringLiteral(segments[i])}`,
            `<${iri}> skos:inScheme <${doc}>`
        );
        if (leaf) triples.push(`<${iri}> skos:broader <${leaf}>`);
        leaf = iri;
    }

    await s.ng.sparql_update(
        s.session_id,
        `${SPARQL_PREFIXES}
         INSERT DATA { GRAPH <${doc}> {\n${triples.join(" .\n")} .\n} }`,
        doc
    );
    return leaf;
}

/** Append a flat concept to the locally-owned scheme. Idempotent per label. */
export async function appendConcept(label: string): Promise<void> {
    const trimmed = label.trim();
    if (!trimmed) return;
    const doc = await schemeDoc();
    const s = await sessionPromise;
    const existing = await s.ng.sparql_query(
        s.session_id,
        `${SPARQL_PREFIXES}
         SELECT ?c WHERE { GRAPH <${doc}> {
            ?c a skos:Concept ; skos:prefLabel ${stringLiteral(trimmed)} } }`,
        undefined,
        undefined
    );
    if (existing?.results?.bindings?.length) return;
    await insertObject(ConceptShapeType, {
        "@graph": doc,
        "@id": "",
        "@type": new Set([`${SKOS}Concept`]),
        prefLabel: trimmed,
        inScheme: doc,
    } as any);
}
