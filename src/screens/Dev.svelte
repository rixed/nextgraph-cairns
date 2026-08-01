<script lang="ts">
    // Dev-only screen (#/dev): the technical spikes (regression probes for
    // docs/SpikeFindings.md) plus small seeding utilities.
    import Spike1DocPerMemory from "../spikes/Spike1DocPerMemory.svelte";
    import Spike2Dates from "../spikes/Spike2Dates.svelte";
    import Spike3Media from "../spikes/Spike3Media.svelte";
    import Spike4Nested from "../spikes/Spike4Nested.svelte";
    import Spike5JsonDoc from "../spikes/Spike5JsonDoc.svelte";
    import Spike6Thumbnails from "../spikes/Spike6Thumbnails.svelte";
    import Spike7Locations from "../spikes/Spike7Locations.svelte";
    import Backfill from "../spikes/Backfill.svelte";
    import { appendConcept } from "../lib/tags";
    import { router } from "../lib/router.svelte";

    const spikes = [
        { name: "1 · doc-per-memory", component: Spike1DocPerMemory },
        { name: "2 · dates", component: Spike2Dates },
        { name: "3 · media", component: Spike3Media },
        { name: "4 · nested", component: Spike4Nested },
        { name: "5 · json doc", component: Spike5JsonDoc },
        { name: "6 · thumbnails", component: Spike6Thumbnails },
        { name: "7 · locations", component: Spike7Locations },
        { name: "backfill", component: Backfill },
    ];
    let current = $state(0);
    const Current = $derived(spikes[current].component);

    let label = $state("");
    let msg = $state("");

    async function addConcept() {
        if (!label.trim()) return;
        try {
            await appendConcept(label);
            msg = `added concept "${label.trim()}"`;
            label = "";
        } catch (e) {
            msg = String(e);
        }
    }
</script>

<div class="p-4 max-w-3xl mx-auto">
    <button class="btn btn-ghost btn-sm" onclick={() => router.replaceRoot({ name: "browse" })}>
        ← app
    </button>
    <h1 class="text-xl font-bold my-2">Dev</h1>

    <section class="border rounded p-3 my-3">
        <h2 class="font-semibold mb-2">Seed a tag concept</h2>
        <div class="flex gap-2">
            <input
                class="input input-bordered input-sm"
                bind:value={label}
                placeholder="e.g. van-year"
                onkeydown={(e) => e.key === "Enter" && addConcept()}
            />
            <button class="btn btn-sm" onclick={addConcept}>append</button>
        </div>
        {#if msg}<p class="text-xs opacity-70 mt-1">{msg}</p>{/if}
    </section>

    <div role="tablist" class="tabs tabs-box mb-4">
        {#each spikes as spike, i}
            <button
                role="tab"
                class="tab"
                class:tab-active={current === i}
                onclick={() => (current = i)}
            >
                {spike.name}
            </button>
        {/each}
    </div>
    <Current />
</div>
