<script lang="ts">
    // The media strip on a memory (S-20). Explicitly attached photographs and
    // those the overlap rule associates are shown alike, with the distinction
    // available on demand (§6.2) — because to the user they are simply the
    // photographs of that day.
    //
    // Conditional like every foreign section (§5): when nothing is associated,
    // the strip is silently absent rather than advertising an app the user may
    // not have.
    import { useAllMedia } from "../lib/mediaFeed.svelte";
    import type { Memory } from "../shapes/orm/memoryShape.typings";
    import {
        toMedia,
        spanOf,
        mediaInSpan,
        type Media,
    } from "../lib/media";
    import { isMediaSuppressed } from "../lib/rejections.svelte";
    import { router } from "../lib/router.svelte";
    import MediaTile from "./MediaTile.svelte";

    let { memory }: { memory: Memory } = $props();

    const feed = useAllMedia();
    const all = $derived(feed.all);
    const doc = $derived(memory["@graph"]);

    const explicit = $derived(
        [...(memory.subjectOf ?? [])]
            .map((d) => all.find((m) => m.doc === d))
            .filter((m): m is Media => !!m)
    );

    /** Associated by overlap, minus the pairings the user rejected (§3.9). */
    const inSpan = $derived.by(() => {
        const span = spanOf(memory.startDate, memory.endDate);
        if (!span) return [];
        const attached = new Set(explicit.map((m) => m.doc));
        return mediaInSpan(all, span).filter((m) => !attached.has(m.doc));
    });

    const byOverlap = $derived(
        inSpan.filter((m) => !isMediaSuppressed(doc, m.doc))
    );
    /**
     * The ones dismissed. Masked rather than gone (§8): the rule is that a
     * rejected proposal is never proposed again, which is not the same as the
     * user losing the way back to what they dismissed.
     */
    const suppressed = $derived(
        inSpan.filter((m) => isMediaSuppressed(doc, m.doc))
    );
    let showSuppressed = $state(false);

    const shown = $derived([...explicit, ...byOverlap]);
    const placeholders = $derived(
        shown.filter((m) => !m.thumbnailUrl && m.kind !== "audio").length
    );

    let showKinds = $state(false);

    const open = (m: Media) =>
        router.push({ name: "media", params: { doc: m.doc, from: doc } });
</script>

<!-- Also when everything on offer was dismissed: the reveal is the only way
     back to those, and a memory whose whole strip was rejected is exactly the
     case where losing it would matter. -->
{#if shown.length || suppressed.length}
    <section class="flex flex-col gap-1">
        <div class="flex items-baseline gap-2">
            <h2 class="font-semibold">Photographs</h2>
            <button
                class="text-xs opacity-60 hover:opacity-100 underline"
                onclick={() => (showKinds = !showKinds)}
            >
                {explicit.length} attached · {byOverlap.length} by overlap
            </button>
            <button
                class="text-xs opacity-60 hover:opacity-100 underline ml-auto"
                onclick={() =>
                    router.push({
                        name: "mediagrid",
                        params: { memory: doc },
                    })}
            >
                see all
            </button>
        </div>

        <div class="flex gap-2 overflow-x-auto pb-1" class:hidden={!shown.length}>
            {#each shown as m (m.doc)}
                <div class="w-24 shrink-0 flex flex-col gap-0.5">
                    <MediaTile media={m} onclick={() => open(m)} />
                    {#if showKinds}
                        <span class="text-[10px] opacity-60 text-center">
                            {explicit.includes(m) ? "attached" : "overlap"}
                        </span>
                    {/if}
                </div>
            {/each}
        </div>

        {#if placeholders}
            <p class="text-xs opacity-50">
                {placeholders} of these publish no thumbnail and show as
                placeholders.
            </p>
        {/if}

        {#if suppressed.length}
            <button
                class="text-xs opacity-60 hover:opacity-100 underline self-start"
                onclick={() => (showSuppressed = !showSuppressed)}
            >
                {showSuppressed
                    ? "hide former suggestions"
                    : `see ${suppressed.length} former suggestion${suppressed.length > 1 ? "s" : ""}`}
            </button>
            {#if showSuppressed}
                <!-- Dimmed, and opening one reaches S-51's "Undo 'not this
                     one'": the way back to a dismissal, which is all this
                     reveal is for. -->
                <div class="flex gap-2 overflow-x-auto pb-1 opacity-40">
                    {#each suppressed as m (m.doc)}
                        <div class="w-24 shrink-0">
                            <MediaTile media={m} onclick={() => open(m)} />
                        </div>
                    {/each}
                </div>
            {/if}
        {/if}
    </section>
{/if}
