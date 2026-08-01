<script lang="ts">
    // S-22c Media projection: the grid of discovered media, grouped by day.
    // Opened whole, or scoped to one memory from S-20 — which, per §6.2, is
    // only a pre-set filter rather than a different screen.
    //
    // Thumbnails only, never a full-size image shrunk to fit (§3.4, B-01);
    // media without one occupy a placeholder tile rather than vanishing.
    import { useShape } from "@ng-org/orm/svelte";
    import { useAllMedia, mediaReady } from "../lib/mediaFeed.svelte";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import type { Memory } from "../shapes/orm/memoryShape.typings";
    import {
        takenAtMs,
        spanOf,
        mediaInSpan,
        type Media,
    } from "../lib/media";
    import { isMediaSuppressed } from "../lib/rejections.svelte";
    import { router } from "../lib/router.svelte";
    import MediaTile from "../components/MediaTile.svelte";
    import ProjectionSwitcher from "../components/ProjectionSwitcher.svelte";
    import { parsePrecisionDate, formatPrecisionDate } from "../lib/dates";

    const scopedTo = router.current.params?.memory;

    const memories = useShape(MemoryShapeType, "did:ng:i");
    const feed = useAllMedia();

    let ready = $state(false);
    mediaReady().then(() => (ready = true));

    const all = $derived(feed.all);
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

    const placeholders = $derived(
        shown.filter((m) => !m.thumbnailUrl && m.kind !== "audio").length
    );

    let groupBy = $state<"day" | "memory">("day");
    let showKinds = $state(false);

    const attachedHere = $derived(
        new Set(scopedTo ? [...(memory?.subjectOf ?? [])] : [])
    );

    /**
     * Which memory a photograph belongs to: the one that attached it, or the
     * first whose span covers it. Derived on the spot, like every other
     * association (§3.4) — a photograph carries no memory of its own.
     */
    const byMemory = $derived.by(() => {
        const mems = [...memories] as unknown as Memory[];
        const spans = mems.map((m) => ({
            m,
            span: spanOf(m.startDate, m.endDate),
        }));
        const label = (m: Memory) => {
            const d = parsePrecisionDate(m.startDate);
            return m.name ?? (d ? formatPrecisionDate(d) : "Untitled");
        };
        const groups = new Map<string, Media[]>();
        for (const media of shown) {
            const t = takenAtMs(media);
            const owner =
                mems.find((m) => m.subjectOf?.has(media.doc)) ??
                spans.find(
                    ({ m, span }) =>
                        span &&
                        t !== undefined &&
                        t >= span.earliest &&
                        t <= span.latest &&
                        !isMediaSuppressed(m["@graph"], media.doc)
                )?.m;
            const key = owner ? label(owner) : "Not in any memory";
            (groups.get(key) ?? groups.set(key, []).get(key)!).push(media);
        }
        return [...groups.entries()].map(([header, items]) => ({
            header,
            items,
        }));
    });

    const shownGroups = $derived(groupBy === "day" ? groups : byMemory);

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

    {#if !scopedTo}
        <ProjectionSwitcher current="media" />
    {/if}

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
        <div class="flex items-center gap-3 mb-2 text-xs">
            <div class="join">
                <button
                    class="join-item btn btn-xs"
                    class:btn-active={groupBy === "day"}
                    onclick={() => (groupBy = "day")}>by day</button
                >
                <button
                    class="join-item btn btn-xs"
                    class:btn-active={groupBy === "memory"}
                    onclick={() => (groupBy = "memory")}>by memory</button
                >
            </div>
            {#if scopedTo}
                <button
                    class="opacity-60 hover:opacity-100 underline"
                    onclick={() => (showKinds = !showKinds)}
                >
                    {showKinds ? "hide" : "show"} how each got here
                </button>
            {/if}
            {#if placeholders}
                <span class="opacity-60 ml-auto">
                    {placeholders} of {shown.length} could be pictured and are not
                </span>
            {/if}
        </div>

        {#each shownGroups as group (group.header)}
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
                    <div class="flex flex-col gap-0.5">
                        <MediaTile media={m} onclick={() => open(m)} />
                        {#if showKinds}
                            <span class="text-[10px] opacity-60 text-center">
                                {attachedHere.has(m.doc)
                                    ? "attached"
                                    : "overlap"}
                            </span>
                        {/if}
                    </div>
                {/each}
            </div>
        {/each}
    {/if}
</div>
