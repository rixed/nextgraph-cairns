import { sessionPromise } from "../lib/ngSession";

export const APP_CLASS = "did:ng:z:cairns/Memory";

/** Create one Graph document in the private store, returns its NURI. */
export async function createGraphDoc(): Promise<string> {
    const s = await sessionPromise;
    return await s.ng.doc_create(
        s.session_id,
        "Graph",
        "data:graph",
        "store",
        undefined
    );
}

/** Insert a minimal memory into its own new document. Returns the doc NURI. */
export async function createMemoryDoc(
    name: string,
    startDate: string,
    datatype: string
): Promise<string> {
    const s = await sessionPromise;
    const doc = await createGraphDoc();
    await s.ng.sparql_update(
        s.session_id,
        `PREFIX app: <did:ng:z:cairns/>
         PREFIX schema: <https://schema.org/>
         PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
         INSERT DATA { GRAPH <${doc}> {
            <${doc}> a app:Memory ;
                schema:name "${name}" ;
                schema:startDate "${startDate}"^^xsd:${datatype} .
         } }`,
        doc
    );
    return doc;
}

/** All documents containing an app:Memory. */
export async function enumerateMemoryDocs(): Promise<string[]> {
    const s = await sessionPromise;
    const ret = await s.ng.sparql_query(
        s.session_id,
        `SELECT DISTINCT ?doc WHERE { GRAPH ?doc { ?s a <${APP_CLASS}> } }`,
        undefined,
        undefined
    );
    return (ret?.results?.bindings ?? []).map((b: any) => b.doc.value);
}

/** Run a SELECT and return bindings (for ad-hoc inspection). */
export async function select(query: string): Promise<any[]> {
    const s = await sessionPromise;
    const ret = await s.ng.sparql_query(s.session_id, query, undefined, undefined);
    return ret?.results?.bindings ?? [];
}

export async function update(query: string, nuri?: string): Promise<void> {
    const s = await sessionPromise;
    await s.ng.sparql_update(s.session_id, query, nuri);
}

export function fmt(ms: number): string {
    return `${ms.toFixed(0)} ms`;
}

// Debug hooks: let the headless driver run ad-hoc queries inside the app.
// `spikeUpdate` exists so a scenario can clean up what it wrote through a
// surface the app deliberately does not offer — there is no "delete a contact"
// in P0, and a test run should still leave the store as it found it.
(window as any).spikeSelect = select;
(window as any).spikeUpdate = update;
