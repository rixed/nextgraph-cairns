// Tags are skos:Concepts in a scheme the app does not own (§3.5, §5). Reading
// is wildcard-scoped (foreign schemes are welcome); writing appends concepts to
// a locally-owned fallback scheme, created on first use.

import { insertObject } from "@ng-org/orm";
import { sessionPromise } from "./ngSession";
import { SPARQL_PREFIXES, stringLiteral } from "./typedLiterals";
import { ConceptShapeType } from "../shapes/orm/tagShape.shapeTypes";

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

/** Append a concept to the locally-owned scheme. Idempotent per label. */
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
