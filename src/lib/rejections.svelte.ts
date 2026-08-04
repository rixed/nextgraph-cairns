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
    /**
     * memory NURI → recommendation IRIs the user said did not prompt it.
     *
     * Needed once the offer became a guess about nearness (§4.1): while it was
     * exact, a wrong offer was rare and forgetting the "no" cost one glance
     * per edit. A recommendation 300 m from somewhere you often are would come
     * back every time, which is precisely the nagging §3.9 exists to stop.
     */
    declinedPrompts?: Record<string, string[]>;
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

/**
 * A plain copy, for the headless driver. SPARQL never sees the JSON side of a
 * document (spike 5), so a scenario asserting on a stored "no" has no other
 * way to read one — and a rejection that is not asserted on is a rejection
 * nobody knows is there.
 */
export function rejectionsSnapshot(): unknown {
    return root ? JSON.parse(JSON.stringify(root)) : undefined;
}

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

// ---------------------------------------------------------------------------
// Forgetting
//
// A rejection outlives what it is keyed to unless something drops it, and the
// only safe moment to drop one is when the app itself destroys the other side.
//
// Not at startup, which is the tempting place: deleting a memory empties its
// document (`deleteMemory`) rather than removing the NURI, so a deleted memory
// is a NURI holding no triples — which is exactly what a memory that has not
// synced yet looks like (§8). A sweep over "keys with no memory behind them"
// would therefore delete live rejections on any run where sync was incomplete,
// silently, and the symptom would be the app nagging again about something the
// user had already dismissed, with no way to tell why. Cheap to write, and
// wrong at the one moment it would run.
//
// Media documents get no hook: they are foreign (§5), this app never deletes
// one, and a foreign document going away is precisely the case that cannot be
// told from one that has not arrived.
// ---------------------------------------------------------------------------

/** Everything recorded about a memory, dropped with the memory itself. */
export function forgetMemory(memoryDoc: string) {
    const doc = root;
    if (!doc) return;
    delete doc.suppressedMedia?.[memoryDoc];
    delete doc.declinedPrompts?.[memoryDoc];
}

/**
 * A recommendation dropped from every memory that declined it — the other
 * direction, and the same certainty: the user just deleted it.
 */
export function forgetRecommendation(rec: string) {
    const byMemory = root?.declinedPrompts;
    if (!byMemory) return;
    for (const [memoryDoc, list] of Object.entries(byMemory)) {
        const i = list.indexOf(rec);
        if (i >= 0) list.splice(i, 1);
        if (!list.length) delete byMemory[memoryDoc];
    }
}

/** Did the user say this recommendation is not why this memory happened? */
export function isPromptDeclined(memoryDoc: string, rec: string): boolean {
    return !!root?.declinedPrompts?.[memoryDoc]?.includes(rec);
}

/** Every offer declined for a memory — what "see former suggestions" reveals. */
export function declinedPromptsOf(memoryDoc: string): string[] {
    return root?.declinedPrompts?.[memoryDoc] ?? [];
}

/**
 * Record that an offer was wrong. Per pairing, like every other rejection: it
 * says nothing about the recommendation, which is still somewhere you were
 * told about, nor about the memory.
 *
 * Several at once, because a new memory has no NURI to key on until it is
 * saved — the editor holds the "no"s until there is something to attach them
 * to, and a cancelled memory stores none, having never existed.
 */
export function declinePrompts(memoryDoc: string, recs: string[]) {
    const doc = root;
    if (!doc || !recs.length) return;
    doc.declinedPrompts ??= {};
    doc.declinedPrompts[memoryDoc] ??= [];
    for (const rec of recs)
        if (!doc.declinedPrompts[memoryDoc].includes(rec))
            doc.declinedPrompts[memoryDoc].push(rec);
}

/**
 * Undo one — reached through "see former suggestions", and implied by ticking
 * the offer, which plainly overrides the earlier "no".
 */
export function undeclinePrompt(memoryDoc: string, rec: string) {
    const list = root?.declinedPrompts?.[memoryDoc];
    if (!list) return;
    const i = list.indexOf(rec);
    if (i >= 0) list.splice(i, 1);
}
