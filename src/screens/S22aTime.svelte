<script lang="ts">
    // S-22a Time projection: chronological list grouped per the §3.1 collation
    // rule. M1: no filter bar yet; empty filter = whole archive.
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

    const memories = useShape(MemoryShapeType, "did:ng:i");

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

    const open = (r: Row) =>
        router.push({ name: "detail", params: { doc: r.m["@graph"] } });
</script>

<div class="p-4 max-w-2xl mx-auto">
    <h1 class="text-xl font-bold mb-2">Browse</h1>

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
                            class="w-full text-left py-2 px-1 hover:bg-base-200 rounded flex flex-col gap-0.5"
                            onclick={() => open(r)}
                        >
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
                        </button>
                    </li>
                {/each}
            </ul>
        {/each}
    {/if}
</div>
