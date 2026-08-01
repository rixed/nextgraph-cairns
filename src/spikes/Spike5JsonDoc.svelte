<script lang="ts">
    // Spike 5 — the discrete (JSON) document behind Specs §3.9.
    //
    // Every rejection the user makes (suppressed media association, declined
    // derived location, dismissed grouping) goes in ONE app-private JSON
    // document, keyed by the URIs it concerns. Nothing in the app touches a
    // non-graph document yet, so this measures: can such a document be found
    // again by SPARQL (only the graph part is queryable), do URI-shaped object
    // keys survive the patch path encoding, does it round-trip, and do two
    // subscriptions to it see each other.
    import { DiscreteOrmSubscription } from "@ng-org/orm";
    import { sessionPromise } from "../lib/ngSession";
    import { select, update, fmt } from "./spikeUtils";

    const REJECTIONS_CLASS = "did:ng:z:cairns/Rejections";

    // Keys the real app would use: NURIs (colons), and an app-vocabulary IRI
    // (slashes) to find where key encoding breaks, if it does.
    const MEMORY_KEY = "did:ng:o:memory1234:v:overlay5678";
    const MEDIA_KEY = "did:ng:j:file9999:k:key0000";
    const SLASH_KEY = "did:ng:z:cairns/Memory#odd key";

    let log = $state<string[]>([]);
    let jsonDoc = $state<string | undefined>();
    // Not $state: subscriptions hold proxies that must not cross the bridge.
    let sub: DiscreteOrmSubscription | undefined;

    const say = (s: string) => {
        log = [...log, s];
        console.log("[spike5]", s);
    };

    async function createJsonDoc() {
        try {
            const s = await sessionPromise;
            const t0 = performance.now();
            const doc: string = await s.ng.doc_create(
                s.session_id,
                "Automerge",
                "data:json",
                "store",
                undefined
            );
            say(`doc_create(Automerge/data:json) → ${doc} in ${fmt(performance.now() - t0)}`);

            // Q1: does the graph part of a discrete document accept triples?
            // That is the only way to find this document again on next launch.
            try {
                await update(
                    `INSERT DATA { GRAPH <${doc}> {
                        <${doc}> a <${REJECTIONS_CLASS}> } }`,
                    doc
                );
                say("graph part accepted a tag triple");
            } catch (e) {
                say(`graph part REFUSED the tag triple: ${e}`);
            }
            jsonDoc = doc;
        } catch (e) {
            say(`ERROR: ${e}`);
        }
    }

    async function findBySparql() {
        try {
            const t0 = performance.now();
            const rows = await select(
                `SELECT ?doc WHERE { GRAPH ?doc { ?s a <${REJECTIONS_CLASS}> } }`
            );
            say(
                `SPARQL found ${rows.length} rejections doc(s) in ${fmt(performance.now() - t0)}`
            );
            rows.forEach((r) => say(`  ${r.doc?.value}`));
            if (!jsonDoc && rows[0]) jsonDoc = rows[0].doc.value;
        } catch (e) {
            say(`ERROR: ${e}`);
        }
    }

    async function subscribe() {
        if (!jsonDoc) return say("create or find the document first");
        try {
            const t0 = performance.now();
            sub = DiscreteOrmSubscription.getOrCreate(jsonDoc);
            await sub.readyPromise;
            say(
                `subscribed; signalObject = ${JSON.stringify(sub.signalObject)} in ${fmt(performance.now() - t0)}`
            );
        } catch (e) {
            say(`ERROR: ${e}`);
        }
    }

    /** Write the shape the app would actually keep: URI-keyed rejections. */
    async function writeRejections() {
        if (!sub?.signalObject) return say("subscribe first");
        try {
            const d = sub.signalObject as any;
            const t0 = performance.now();
            d.version ??= 1;
            d.suppressedMedia ??= {};
            d.suppressedMedia[MEMORY_KEY] = [MEDIA_KEY];
            d.declinedDerivedLocation ??= {};
            d.declinedDerivedLocation[MEMORY_KEY] = true;
            d.dismissedGroupings ??= [];
            d.dismissedGroupings.push({ key: SLASH_KEY, at: "2026-08-01" });
            await Promise.resolve(); // flush the batched patches
            say(`wrote rejections in ${fmt(performance.now() - t0)}`);
            say(`local view: ${JSON.stringify(sub.signalObject)}`);
        } catch (e) {
            say(`ERROR: ${e}`);
        }
    }

    /** Q2: does a second suppression on the SAME key merge or clobber? */
    async function appendToSameKey() {
        if (!sub?.signalObject) return say("subscribe first");
        try {
            const d = sub.signalObject as any;
            d.suppressedMedia[MEMORY_KEY].push("did:ng:j:second:k:media");
            await Promise.resolve();
            say(
                `after append: ${JSON.stringify(d.suppressedMedia[MEMORY_KEY])}`
            );
        } catch (e) {
            say(`ERROR: ${e}`);
        }
    }

    /** Q3: does it round-trip? Close, re-subscribe, compare. */
    async function reopen() {
        if (!jsonDoc) return say("nothing to reopen");
        try {
            sub?.close();
            sub = undefined;
            // Pooling keeps a closed subscription alive for a few hundred ms;
            // wait it out so this is a genuine re-read.
            await new Promise((r) => setTimeout(r, 1500));
            const t0 = performance.now();
            sub = DiscreteOrmSubscription.getOrCreate(jsonDoc);
            await sub.readyPromise;
            say(`reopened in ${fmt(performance.now() - t0)}`);
            say(`persisted: ${JSON.stringify(sub.signalObject)}`);
            const d = sub.signalObject as any;
            const keyOk = Array.isArray(d?.suppressedMedia?.[MEMORY_KEY]);
            say(
                keyOk
                    ? "URI-shaped object keys survived the round trip"
                    : "URI-shaped object keys did NOT survive — use an array of records"
            );
        } catch (e) {
            say(`ERROR: ${e}`);
        }
    }

    /** Q4: two subscriptions (two screens) on one document. */
    async function twoSubscriptions() {
        if (!jsonDoc) return say("nothing to open");
        try {
            const a = DiscreteOrmSubscription.getOrCreate(jsonDoc);
            await a.readyPromise;
            const b = DiscreteOrmSubscription.getOrCreate(jsonDoc);
            await b.readyPromise;
            say(`pooled to the same object: ${a === b}`);
            (a.signalObject as any).probe = performance.now();
            await Promise.resolve();
            say(`b sees probe = ${(b.signalObject as any)?.probe}`);
            b.close();
            a.close();
        } catch (e) {
            say(`ERROR: ${e}`);
        }
    }

    /** Q5: cost of many rejections at once — the bulk-suppress case. */
    async function bulkWrite() {
        if (!sub?.signalObject) return say("subscribe first");
        try {
            const d = sub.signalObject as any;
            d.bulk ??= {};
            const N = 200;
            const t0 = performance.now();
            sub.beginTransaction();
            for (let i = 0; i < N; i++)
                d.bulk[`did:ng:o:bulk${i}:v:overlay`] = [`did:ng:j:m${i}:k:k`];
            await sub.commitTransaction();
            say(`${N} keyed entries in one transaction: ${fmt(performance.now() - t0)}`);
        } catch (e) {
            say(`ERROR: ${e}`);
        }
    }
</script>

<div>
    <h2 class="text-lg font-semibold">Spike 5 — the rejections JSON document</h2>
    <div class="flex flex-wrap gap-2 my-2">
        <button class="btn btn-sm" onclick={createJsonDoc}>1 · create + tag</button>
        <button class="btn btn-sm" onclick={findBySparql}>2 · find by SPARQL</button>
        <button class="btn btn-sm" onclick={subscribe}>3 · subscribe</button>
        <button class="btn btn-sm" onclick={writeRejections}>4 · write rejections</button>
        <button class="btn btn-sm" onclick={appendToSameKey}>5 · append to a key</button>
        <button class="btn btn-sm" onclick={reopen}>6 · reopen</button>
        <button class="btn btn-sm" onclick={twoSubscriptions}>7 · two subscriptions</button>
        <button class="btn btn-sm" onclick={bulkWrite}>8 · 200 entries</button>
    </div>

    <pre class="text-xs bg-base-200 p-2 rounded max-h-72 overflow-y-auto">{log.join("\n")}</pre>
</div>
