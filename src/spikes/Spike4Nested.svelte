<script lang="ts">
    import { useShape } from "@ng-org/orm/svelte";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import { createGraphDoc, select } from "./spikeUtils";

    let log = $state<string[]>([]);
    const say = (s: string) => {
        log = [...log, s];
        console.log("[spike4]", s);
    };

    const memories = useShape(MemoryShapeType, { graphs: "did:ng:i" });

    // A memory with a nested unnamed location and a nested bare-name person.
    async function insertNested() {
        const doc = await createGraphDoc();
        memories.add({
            "@graph": doc,
            "@id": "",
            "@type": new Set(["did:ng:z:cairns/Memory"]) as any,
            name: "nested-test",
            startDate: "2020-05-01",
            location: new Set([
                {
                    "@id": "",
                    "@type": new Set(["https://schema.org/Place"]),
                    name: "a wasteland",
                    lat: 38.7,
                    long: -9.4,
                },
            ]) as any,
            attendee: {
                "@id": "",
                "@type": new Set(["http://xmlns.com/foaf/0.1/Person"]),
                name: "Ana?",
            } as any,
        } as any);
        say(`inserted memory with nested place + person into ${doc.substring(0, 25)}…`);
        await new Promise((r) => setTimeout(r, 500));
        await inspectTriples(doc);
    }

    async function inspectTriples(doc: string) {
        const rows = await select(
            `SELECT ?s ?p ?o WHERE { GRAPH <${doc}> { ?s ?p ?o } }`
        );
        for (const r of rows) {
            say(`${r.s?.value}  ${r.p?.value}  ${r.o?.value} [${r.o?.type}]`);
        }
    }

    function deleteNestedLocation(m: any) {
        const loc = [...(m.location ?? [])][0];
        if (!loc) return say("no location to delete");
        m.location.delete(loc);
        say("deleted nested location via ORM — re-inspect triples to check cleanup");
    }
</script>

<div>
    <h2 class="text-lg font-semibold">Spike 4 — nested no-URI objects</h2>
    <div class="flex flex-wrap gap-2 my-2">
        <button class="btn btn-sm" onclick={insertNested}>insert memory w/ nested loc+person</button>
    </div>

    <div class="border rounded p-2 my-2">
        <div class="font-mono text-sm">live memories: {memories.size}</div>
        <ul class="text-sm max-h-48 overflow-y-auto">
            {#each [...memories] as m (`${m["@graph"]}|${m["@id"]}`)}
                <li class="mb-1">
                    <code>{m.name}</code>
                    {#each [...(m.location ?? [])] as loc}
                        <span class="badge badge-sm">📍 {loc.name} ({loc.lat}, {loc.long}) id={loc["@id"]?.substring(0, 18)}</span>
                    {/each}
                    {#if m.attendee && typeof m.attendee === "object"}
                        <span class="badge badge-sm">👤 {(m.attendee as any).name}</span>
                    {:else if m.attendee}
                        <span class="badge badge-sm">👤 IRI: {m.attendee}</span>
                    {/if}
                    {#if m.name === "nested-test"}
                        <button class="btn btn-xs" onclick={() => deleteNestedLocation(m)}>del loc</button>
                        <button class="btn btn-xs" onclick={() => inspectTriples(m["@graph"])}>triples</button>
                    {/if}
                </li>
            {/each}
        </ul>
    </div>

    <pre class="text-xs bg-base-200 p-2 rounded max-h-64 overflow-y-auto">{log.join("\n")}</pre>
</div>
