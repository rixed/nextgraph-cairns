// Rejected inferences (Specs §3.9). The app infers; it never stores what it
// inferred, but it does store the user's "no" — and the rule over all of them
// is that a rejected proposal is never proposed again.
//
// All rejections live in ONE app-private discrete (JSON) document, keyed by the
// URIs they concern. Spike 5 established the shape: a JSON document also has a
// graph part, so it can be tagged and found by SPARQL like any other document,
// and URI-shaped keys survive verbatim.

import { useDiscrete } from "@ng-org/orm/svelte";
import { sessionPromise } from "./ngSession";

const REJECTIONS_CLASS = "did:ng:z:cairns/Rejections";

let docPromise: Promise<string> | undefined;

/** The rejections document, created on first use. */
export function rejectionsDoc(): Promise<string> {
    return (docPromise ??= findOrCreate());
}

async function findOrCreate(): Promise<string> {
    const s = await sessionPromise;
    const ret = await s.ng.sparql_query(
        s.session_id,
        `SELECT ?doc WHERE { GRAPH ?doc { ?s a <${REJECTIONS_CLASS}> } }`,
        undefined,
        undefined
    );
    const found = ret?.results?.bindings?.[0]?.doc?.value;
    if (found) return found;

    const doc: string = await s.ng.doc_create(
        s.session_id,
        "Automerge",
        "data:json",
        "store",
        undefined
    );
    // Tag the graph part: SPARQL never sees the JSON side, so this triple is
    // the only way to find the document again.
    await s.ng.sparql_update(
        s.session_id,
        `INSERT DATA { GRAPH <${doc}> { <${doc}> a <${REJECTIONS_CLASS}> } }`,
        doc
    );
    return doc;
}

interface RejectionsDoc {
    version?: number;
    /** memory NURI → media document NURIs the user said do not belong. */
    suppressedMedia?: Record<string, string[]>;
}

let root = $state.raw<RejectionsDoc | undefined>(undefined);

/**
 * Bind the document to app state. Must be called once, during the
 * initialisation of a component that outlives the session — the Shell — since
 * `useDiscrete` closes its subscription when its caller is destroyed.
 */
export function bindRejections() {
    const bound = useDiscrete(rejectionsDoc());
    $effect(() => {
        const doc = bound.doc as RejectionsDoc | undefined;
        if (doc && doc.version === undefined) doc.version = 1;
        root = doc;
    });
}

/** True while the document has not arrived: nothing is suppressed yet. */
export const rejectionsReady = () => root !== undefined;

/** Did the user say this photograph does not belong to this memory? */
export function isMediaSuppressed(memoryDoc: string, mediaDoc: string): boolean {
    return !!root?.suppressedMedia?.[memoryDoc]?.includes(mediaDoc);
}

/** Every suppression recorded for a memory (for "show what I dismissed"). */
export function suppressedMediaOf(memoryDoc: string): string[] {
    return root?.suppressedMedia?.[memoryDoc] ?? [];
}

/**
 * Record that a derived association is wrong. Suppressing is per pairing: it
 * says nothing about the photograph, the memory, or any other pair.
 */
export function suppressMedia(memoryDoc: string, mediaDoc: string) {
    const doc = root;
    if (!doc) return;
    doc.suppressedMedia ??= {};
    doc.suppressedMedia[memoryDoc] ??= [];
    if (!doc.suppressedMedia[memoryDoc].includes(mediaDoc))
        doc.suppressedMedia[memoryDoc].push(mediaDoc);
}

/**
 * Undo a suppression — which happens when the user attaches the same media
 * explicitly, an act that plainly overrides the earlier "no".
 */
export function unsuppressMedia(memoryDoc: string, mediaDoc: string) {
    const list = root?.suppressedMedia?.[memoryDoc];
    if (!list) return;
    const i = list.indexOf(mediaDoc);
    if (i >= 0) list.splice(i, 1);
}
