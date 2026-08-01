<script lang="ts">
    // S-22c Media projection: the grid of discovered media, grouped by day.
    // Opened whole, or scoped to one memory from S-20 — which, per §6.2, is
    // only a pre-set filter rather than a different screen.
    //
    // Thumbnails only, never a full-size image shrunk to fit (§3.4, B-01);
    // media without one occupy a placeholder tile rather than vanishing.
    import { useShape } from "@ng-org/orm/svelte";
    import { OrmSubscription, normalizeScope } from "@ng-org/orm";
    import { ImageShapeType } from "../shapes/orm/mediaShape.shapeTypes";
    import type { Image } from "../shapes/orm/mediaShape.typings";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import type { Memory } from "../shapes/orm/memoryShape.typings";
    import {
        toMedia,
        takenAtMs,
        spanOf,
        mediaInSpan,
        type Media,
    } from "../lib/media";
    import { isMediaSuppressed } from "../lib/rejections.svelte";
    import { router } from "../lib/router.svelte";
    import MediaTile from "../components/MediaTile.svelte";

    const scopedTo = router.current.params?.memory;

    const images = useShape(ImageShapeType, "did:ng:i");
    const memories = useShape(MemoryShapeType, "did:ng:i");

    let ready = $state(false);
    OrmSubscription.getOrCreate(
        ImageShapeType,
        normalizeScope("did:ng:i")
    ).readyPromise.then(() => (ready = true));

    const all = $derived(([...images] as unknown as Image[]).map(toMedia));
    const memory = $derived(
        scopedTo
            ? ([...memories].find((m) => m["@graph"] === scopedTo) as
                  | Memory
                  | undefined)
            : undefined
    );

    const shown = $derived.by(() => {
        if (!scopedTo) return all;
        if (!memory) return [];
        const explicit = [...(memory.subjectOf ?? [])];
        const span = spanOf(memory.startDate, memory.endDate);
        const byOverlap = span
            ? mediaInSpan(all, span)
                  .filter((m) => !isMediaSuppressed(scopedTo, m.doc))
                  .map((m) => m.doc)
            : [];
        const wanted = new Set([...explicit, ...byOverlap]);
        return all.filter((m) => wanted.has(m.doc));
    });

    /** Grouped by the day the camera recorded, undated media last. */
    const groups = $derived.by(() => {
        const byDay = new Map<string, Media[]>();
        for (const m of [...shown].sort(
            (a, b) => (takenAtMs(a) ?? Infinity) - (takenAtMs(b) ?? Infinity)
        )) {
            const t = takenAtMs(m);
            const key = t
                ? new Date(t).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                  })
                : "Undated";
            (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(m);
        }
        return [...byDay.entries()].map(([header, items]) => ({
            header,
            items,
        }));
    });

    const placeholders = $derived(shown.filter((m) => !m.thumbnailUrl).length);

    const open = (m: Media) =>
        router.push({
            name: "media",
            params: scopedTo ? { doc: m.doc, from: scopedTo } : { doc: m.doc },
        });
</script>

<div class="p-4 max-w-4xl mx-auto">
    <div class="flex items-center gap-2 mb-2">
        {#if router.depth > 1}
            <button class="btn btn-ghost btn-sm" onclick={() => router.pop()}>
                ← back
            </button>
        {/if}
        <h1 class="text-xl font-bold">
            {scopedTo ? "Photographs of this memory" : "Photographs"}
        </h1>
    </div>

    {#if !ready}
        <div class="flex items-center gap-2 text-sm opacity-70 my-2">
            <span class="loading loading-bars loading-xs"></span>
            looking for photographs…
        </div>
    {/if}

    {#if ready && shown.length === 0}
        <div class="text-center py-16 opacity-70">
            <p>No photographs here.</p>
            <p class="text-sm mt-2">
                Cairns shows what other applications have written into your
                store; it never takes or stores pictures itself.
            </p>
        </div>
    {:else}
        {#if placeholders}
            <p class="text-xs opacity-60 mb-2">
                {placeholders} of {shown.length} publish no thumbnail and show as
                placeholders.
            </p>
        {/if}

        {#each groups as group (group.header)}
            <h2
                class="sticky top-0 bg-base-100 z-[5] text-sm font-semibold opacity-70 py-1 border-b"
            >
                {group.header}
                <span class="font-normal opacity-60">({group.items.length})</span>
            </h2>
            <div
                class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1 my-2"
            >
                {#each group.items as m (m.doc)}
                    <MediaTile media={m} onclick={() => open(m)} />
                {/each}
            </div>
        {/each}
    {/if}
</div>
