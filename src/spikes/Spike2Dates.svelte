<script lang="ts">
    import { useShape } from "@ng-org/orm/svelte";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import { createGraphDoc, createMemoryDoc, select, fmt } from "./spikeUtils";
    import { sessionPromise } from "../lib/ngSession";

    let log = $state<string[]>([]);
    const say = (s: string) => {
        log = [...log, s];
        console.log("[spike2]", s);
    };

    // Whole-dataset subscription: all memories regardless of doc.
    const memories = useShape(MemoryShapeType, { graphs: "did:ng:i" });

    // Insert one memory per precision level via SPARQL with typed literals.
    async function insertTypedViaSparql() {
        const cases: [string, string][] = [
            ["2019-08-14T19:30:00", "dateTime"],
            ["2019-08-14", "date"],
            ["2019-08", "gYearMonth"],
            ["2019", "gYear"],
        ];
        for (const [lit, dt] of cases) {
            const doc = await createMemoryDoc(`sparql-${dt}`, lit, dt);
            say(`inserted "${lit}"^^xsd:${dt} in ${doc.substring(0, 25)}…`);
        }
        say("→ check the live list: do all four SPARQL-typed memories appear?");
    }

    // Insert via the ORM: what datatype does the engine store?
    async function insertViaOrm() {
        const s = await sessionPromise;
        const doc = await createGraphDoc();
        memories.add({
            "@graph": doc,
            "@id": "",
            "@type": new Set(["did:ng:z:cairns/Memory"]) as any,
            name: "orm-written",
            startDate: "2021-03",
        } as any);
        say(`ORM-inserted startDate "2021-03" (intended gYearMonth) into ${doc.substring(0, 25)}…`);
        // Flush the microtask batch before querying.
        await new Promise((r) => setTimeout(r, 500));
        await inspectDatatypes();
    }

    async function inspectDatatypes() {
        const rows = await select(
            `PREFIX schema: <https://schema.org/>
             SELECT ?name ?d (DATATYPE(?d) AS ?dt) WHERE {
                GRAPH ?g { ?s schema:startDate ?d ; schema:name ?name }
             }`
        );
        for (const r of rows) {
            say(`stored: name=${r.name?.value} value=${r.d?.value} datatype=${r.dt?.value ?? r.d?.datatype ?? "?"}`);
        }
    }
</script>

<div>
    <h2 class="text-lg font-semibold">Spike 2 — variable-precision dates</h2>
    <div class="flex flex-wrap gap-2 my-2">
        <button class="btn btn-sm" onclick={insertTypedViaSparql}>insert 4 typed via SPARQL</button>
        <button class="btn btn-sm" onclick={insertViaOrm}>insert via ORM + inspect</button>
        <button class="btn btn-sm" onclick={inspectDatatypes}>inspect stored datatypes</button>
    </div>

    <div class="border rounded p-2 my-2">
        <div class="font-mono text-sm">live memories: {memories.size}</div>
        <ul class="text-sm max-h-40 overflow-y-auto">
            {#each [...memories] as m (`${m["@graph"]}|${m["@id"]}`)}
                <li><code>{m.name}</code> — startDate=<code>{m.startDate}</code></li>
            {/each}
        </ul>
    </div>

    <pre class="text-xs bg-base-200 p-2 rounded max-h-64 overflow-y-auto">{log.join("\n")}</pre>
</div>
