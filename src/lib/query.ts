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
