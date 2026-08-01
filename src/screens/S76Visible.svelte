<script lang="ts">
    // S-76 What Cairns can see (Specs §6.2).
    //
    // A census of the store as this app understands it: which shapes it
    // recognises, how many documents match each, and what coverage the
    // properties it actually uses have. Coverage is the useful figure, since it
    // predicts whether the media grid and the map will be rich or sparse.
    //
    // No notion of which application wrote anything — documents belong to the
    // user, not to the app that created them. No toggles either: the store is
    // the store, and filtering belongs in Browse. Nothing about bytes, caches
    // or replication; the framework owns those (§1.2).
    import { census, type CensusRow } from "../lib/census";
    import { router } from "../lib/router.svelte";

    let rows = $state<CensusRow[] | undefined>();
    $effect(() => {
        census().then((r) => (rows = r));
    });

    const present = $derived((rows ?? []).filter((r) => r.subjects > 0));
    const absent = $derived((rows ?? []).filter((r) => r.subjects === 0));
    const pct = (have: number, of: number) => Math.round((have / of) * 100);
</script>

<div class="p-4 max-w-2xl mx-auto flex flex-col gap-4">
    <div class="flex items-center gap-2">
        <button class="btn btn-ghost btn-sm" onclick={() => router.pop()}>
            ← back
        </button>
        <h1 class="text-xl font-bold">What Cairns can see</h1>
    </div>

    <p class="text-sm opacity-70">
        Cairns imports nothing. It recognises certain shapes of data and uses
        them wherever they appear in your store, whichever application wrote
        them — and writes only its own memories, plus concepts appended to a
        vocabulary no app owns.
    </p>

    {#if !rows}
        <div class="flex items-center gap-2 text-sm opacity-70">
            <span class="loading loading-bars loading-xs"></span>
            reading the store…
        </div>
    {:else}
        {#each present as row (row.label)}
            <section class="border rounded p-3 flex flex-col gap-1">
                <div class="flex items-baseline gap-2">
                    <h2 class="font-semibold">{row.label}</h2>
                    <span class="text-sm opacity-70">
                        {row.subjects} in {row.documents}
                        {row.documents === 1 ? "document" : "documents"}
                    </span>
                    {#if row.own}
                        <span class="badge badge-sm ml-auto">written here</span>
                    {/if}
                </div>
                <p class="text-sm opacity-70">{row.use}</p>

                {#if row.coverage.length}
                    <ul class="text-sm mt-1 flex flex-col gap-1">
                        {#each row.coverage as c (c.label)}
                            <li class="flex items-center gap-2">
                                <progress
                                    class="progress w-24"
                                    value={c.have}
                                    max={row.subjects}
                                ></progress>
                                <span
                                    class:opacity-60={c.have === row.subjects}
                                >
                                    {c.have} of {row.subjects}
                                    {c.label}
                                    <span class="opacity-60">
                                        ({pct(c.have, row.subjects)}%)
                                    </span>
                                </span>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </section>
        {/each}

        {#if import.meta.env.DEV}
            <section class="border border-warning rounded p-3 flex flex-col gap-2">
                <h2 class="font-semibold">Development build</h2>

                {#if absent.length}
                    <div>
                        <p class="text-sm">
                            Shapes Cairns looks for and does not find here:
                        </p>
                        <ul class="text-sm list-disc pl-5">
                            {#each absent as row (row.label)}
                                <li>{row.label} — {row.use}</li>
                            {/each}
                        </ul>
                    </div>
                {/if}

                <div>
                    <p class="text-sm">Responsibilities this build is borrowing:</p>
                    <ul class="text-sm list-disc pl-5">
                        <li>
                            <strong>B-01</strong> — nobody publishes derived
                            representations, so descriptors without a thumbnail
                            show as placeholder tiles rather than pictures.
                        </li>
                        <li>
                            <strong>B-02</strong> — the concept scheme is a
                            locally-owned stopgap, appended to and never
                            restructured, awaiting a vocabulary manager.
                        </li>
                        <li>
                            <strong>B-11</strong> — overlap in time is computed
                            here, memory by memory, for want of a query
                            capability that joins documents by span.
                        </li>
                        <li>
                            <strong>B-12</strong> — this census probes shape by
                            shape, since there is no registry to ask what the
                            store contains.
                        </li>
                        <li>
                            <strong>B-13</strong> — what happens when a file's
                            blocks have not synced is unmeasured, so "media
                            unreachable" is written blind.
                        </li>
                    </ul>
                </div>
            </section>
        {/if}
    {/if}
</div>
