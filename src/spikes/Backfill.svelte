<script lang="ts">
    // One-off maintenance, dev-only.
    //
    // Memories written before schema:Event was asserted (§3, §3.6) carry only
    // app:Memory, so no application that has not heard of Cairns recognises
    // them as events. This adds the missing type and nothing else: it never
    // removes a triple, and running it twice is a no-op because it only
    // touches subjects that lack the type.
    import { sessionPromise } from "../lib/ngSession";
    import { select } from "./spikeUtils";

    const PREFIXES = `PREFIX app: <did:ng:z:cairns/>
        PREFIX schema: <https://schema.org/>`;

    let log = $state<string[]>([]);
    let running = $state(false);

    const say = (s: string) => {
        log = [...log, s];
        console.log("[backfill]", s);
    };

    async function missing(): Promise<{ doc: string; s: string }[]> {
        const rows = await select(
            `${PREFIXES}
             SELECT ?doc ?s WHERE { GRAPH ?doc {
                ?s a app:Memory .
                FILTER NOT EXISTS { ?s a schema:Event }
             } }`
        );
        return rows.map((r: any) => ({ doc: r.doc.value, s: r.s.value }));
    }

    async function survey() {
        const rows = await missing();
        say(
            rows.length
                ? `${rows.length} memories are not typed schema:Event`
                : "every memory is already typed schema:Event"
        );
    }

    async function backfill() {
        running = true;
        try {
            const rows = await missing();
            say(`backfilling ${rows.length} memories…`);
            const s = await sessionPromise;
            for (const { doc, s: subject } of rows) {
                await s.ng.sparql_update(
                    s.session_id,
                    `${PREFIXES}
                     INSERT DATA { GRAPH <${doc}> {
                        <${subject}> a schema:Event } }`,
                    doc
                );
            }
            const left = await missing();
            say(
                left.length === 0
                    ? `done — ${rows.length} updated, none left untyped`
                    : `WARNING: ${left.length} still untyped`
            );
        } catch (e) {
            say(`ERROR: ${e}`);
        } finally {
            running = false;
        }
    }
</script>

<div>
    <h2 class="text-lg font-semibold">Backfill — schema:Event on memories</h2>
    <p class="text-sm opacity-70 my-1">
        Adds the missing type to memories written before it was asserted. Adds
        triples only; never removes one.
    </p>
    <div class="flex flex-wrap gap-2 my-2">
        <button class="btn btn-sm" onclick={survey} disabled={running}>
            1 · how many are untyped
        </button>
        <button class="btn btn-sm btn-primary" onclick={backfill} disabled={running}>
            2 · backfill
        </button>
    </div>

    <pre class="text-xs bg-base-200 p-2 rounded max-h-72 overflow-y-auto">{log.join("\n")}</pre>
</div>
