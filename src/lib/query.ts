// One-shot SPARQL, for the questions the ORM's shapes do not answer — counting
// what exists, and looking for documents without creating them.

import { sessionPromise } from "./ngSession";

export async function select(query: string): Promise<any[]> {
    const s = await sessionPromise;
    const ret = await s.ng.sparql_query(
        s.session_id,
        query,
        undefined,
        undefined
    );
    return ret?.results?.bindings ?? [];
}

/** How many subjects of this type exist, across every document. */
export async function countSubjectsOfType(typeIri: string): Promise<number> {
    const rows = await select(
        `SELECT DISTINCT ?s WHERE { GRAPH ?g { ?s a <${typeIri}> } }`
    );
    return rows.length;
}

/** How many documents hold a subject of this type. */
export async function countDocsOfType(typeIri: string): Promise<number> {
    const rows = await select(
        `SELECT DISTINCT ?doc WHERE { GRAPH ?doc { ?s a <${typeIri}> } }`
    );
    return rows.length;
}
