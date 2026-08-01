<script lang="ts">
    import MemoryList from "./MemoryList.svelte";
    import {
        createMemoryDoc,
        enumerateMemoryDocs,
        fmt,
    } from "./spikeUtils";

    let log = $state<string[]>([]);
    let busy = $state(false);
    let docs = $state<string[]>([]);
    // Subscription under test: undefined = none, "wildcard" = did:ng:i, "explicit" = docs list
    let mode = $state<"none" | "wildcard" | "explicit">("none");
    let listKey = $state(0);

    const say = (s: string) => {
        log = [...log, s];
        console.log("[spike1]", s);
    };

    async function createMany(n: number) {
        busy = true;
        const t0 = performance.now();
        for (let i = 0; i < n; i++) {
            const year = 2015 + (i % 10);
            await createMemoryDoc(
                `mem-${Date.now()}-${i}`,
                `${year}-06-1${i % 9}`,
                "date"
            );
        }
        const dt = performance.now() - t0;
        say(`created ${n} memory docs in ${fmt(dt)} (${fmt(dt / n)}/doc)`);
        busy = false;
    }

    async function enumerate() {
        const t0 = performance.now();
        docs = await enumerateMemoryDocs();
        say(`enumerated ${docs.length} memory docs in ${fmt(performance.now() - t0)}`);
    }

    function subscribe(m: "wildcard" | "explicit") {
        mode = m;
        listKey++;
        say(`subscribing with ${m === "wildcard" ? '["did:ng:i"]' : `${docs.length} explicit graphs`}`);
    }

    async function addWhileSubscribed() {
        const doc = await createMemoryDoc(`late-${Date.now()}`, "2025-01-01", "date");
        say(`created one more doc while subscribed: ${doc.substring(0, 30)}… — watch whether it appears in the live list`);
    }

    const onready = (ms: number) => say(`subscription ready in ${fmt(ms)}`);
</script>

<div>
    <h2 class="text-lg font-semibold">Spike 1 — doc-per-memory subscription scope</h2>

    <div class="flex flex-wrap gap-2 my-2">
        <button class="btn btn-sm" disabled={busy} onclick={() => createMany(10)}>create 10 docs</button>
        <button class="btn btn-sm" disabled={busy} onclick={() => createMany(50)}>create 50 docs</button>
        <button class="btn btn-sm" onclick={enumerate}>enumerate</button>
        <button class="btn btn-sm btn-primary" onclick={() => subscribe("wildcard")}>subscribe did:ng:i</button>
        <button class="btn btn-sm btn-primary" disabled={docs.length === 0} onclick={() => subscribe("explicit")}>subscribe explicit list</button>
        <button class="btn btn-sm" disabled={mode === "none"} onclick={addWhileSubscribed}>+1 doc while subscribed</button>
        <button class="btn btn-sm" onclick={() => { mode = "none"; }}>unsubscribe</button>
    </div>

    {#if mode !== "none"}
        {#key listKey}
            <MemoryList
                graphs={mode === "wildcard" ? "did:ng:i" : docs}
                {onready}
            />
        {/key}
    {/if}

    <pre class="text-xs bg-base-200 p-2 rounded max-h-64 overflow-y-auto">{log.join("\n")}</pre>
</div>
