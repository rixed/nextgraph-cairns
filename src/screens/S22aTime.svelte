<script lang="ts">
    // S-22a Time projection: chronological list grouped per the §3.1 collation
    // rule. No filter bar yet; empty filter = whole archive.
    //
    // Deferred: the S-22 shell proper — filter facets, selection, and the §4.4
    // bulk actions — which every projection shares and none of them owns. It is
    // a slice of its own rather than a gap in this screen.
    import { useShape } from "@ng-org/orm/svelte";
    import { OrmSubscription, normalizeScope } from "@ng-org/orm";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import type { Memory } from "../shapes/orm/memoryShape.typings";
    import {
        parsePrecisionDate,
        memoryInterval,
        compareIntervals,
        groupByDerivedHeaders,
        formatPrecisionDate,
        type PrecisionDate,
        type Interval,
    } from "../lib/dates";
    import { router } from "../lib/router.svelte";
    import TagChips from "../components/TagChips.svelte";
    import MediaTile from "../components/MediaTile.svelte";
    import ProjectionSwitcher from "../components/ProjectionSwitcher.svelte";
    import { useAllMedia } from "../lib/mediaFeed.svelte";
    import { coverFor, type Media } from "../lib/media";
    import { isMediaSuppressed } from "../lib/rejections.svelte";

    const memories = useShape(MemoryShapeType, "did:ng:i");
    const mediaFeed = useAllMedia();
    const allMedia = $derived(mediaFeed.all);

    let ready = $state(false);
    OrmSubscription.getOrCreate(
        MemoryShapeType,
        normalizeScope("did:ng:i")
    ).readyPromise.then(() => (ready = true));

    interface Row {
        m: Memory;
        start: PrecisionDate;
        span: Interval;
    }

    const rows = $derived(
        ([...memories] as unknown as Memory[])
            .flatMap((m): Row[] => {
                const start = parsePrecisionDate(m.startDate);
                if (!start) return []; // junk dates render nowhere rather than wrongly
                const end = parsePrecisionDate(m.endDate ?? undefined);
                return [{ m, start, span: memoryInterval(start, end) }];
            })
            .sort((a, b) => compareIntervals(a.span, b.span))
    );

    const groups = $derived(groupByDerivedHeaders(rows, (r) => r.start));

    // A memory shows the cover it was given, or the first photograph that can
    // stand for it — computed here, never written back (§1.3).
    const covers = $derived.by(() => {
        const m = new Map<string, Media>();
        for (const r of rows) {
            const c = coverFor(r.m, allMedia, isMediaSuppressed);
            if (c) m.set(r.m["@graph"], c);
        }
        return m;
    });

    const open = (r: Row) =>
        router.push({ name: "detail", params: { doc: r.m["@graph"] } });
</script>

<div class="p-4 max-w-2xl mx-auto">
    <h1 class="text-xl font-bold mb-2">Browse</h1>

    <ProjectionSwitcher current="time" />

    {#if !ready}
        <div class="flex items-center gap-2 text-sm opacity-70 my-2">
            <span class="loading loading-bars loading-xs"></span>
            syncing your memories…
        </div>
    {/if}

    {#if ready && rows.length === 0}
        <div class="text-center py-16">
            <p class="mb-4 opacity-70">No memories yet. Only a date is needed.</p>
            <button
                class="btn btn-primary"
                onclick={() => router.push({ name: "editor" })}
            >
                Capture your first memory
            </button>
        </div>
    {:else}
        {#each groups as group (group.header)}
            <h2
                class="sticky top-0 bg-base-100 z-[5] text-sm font-semibold opacity-70 py-1 border-b"
            >
                {group.header}
            </h2>
            <ul class="mb-4">
                {#each group.items as r (`${r.m["@graph"]}|${r.m["@id"]}`)}
                    <li>
                        <button
                            class="w-full text-left py-2 px-1 hover:bg-base-200 rounded flex gap-3 items-start"
                            onclick={() => open(r)}
                        >
                            {#if covers.get(r.m["@graph"])}
                                <span class="w-16 shrink-0">
                                    <MediaTile
                                        media={covers.get(r.m["@graph"])!}
                                    />
                                </span>
                            {/if}
                            <span class="flex flex-col gap-0.5 min-w-0">
                            <span class="font-medium">
                                {r.m.name ?? formatPrecisionDate(r.start)}
                            </span>
                            <span class="text-xs opacity-60">
                                {formatPrecisionDate(r.start)}{r.m.endDate
                                    ? ` → ${formatPrecisionDate(parsePrecisionDate(r.m.endDate)!)}`
                                    : ""}
                            </span>
                            {#if r.m.description}
                                <span class="text-sm opacity-80">
                                    {r.m.description}
                                </span>
                            {/if}
                            {#if r.m.subject?.size}
                                <span class="flex gap-1 flex-wrap">
                                    <TagChips iris={r.m.subject} />
                                </span>
                            {/if}
                            </span>
                        </button>
                    </li>
                {/each}
            </ul>
        {/each}
    {/if}
</div>
