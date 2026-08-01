<script lang="ts">
    import { useShape } from "@ng-org/orm/svelte";
    import { OrmSubscription } from "@ng-org/orm";
    import { normalizeScope } from "@ng-org/orm";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import type { Memory } from "../shapes/orm/memoryShape.typings";

    let {
        graphs,
        onready,
    }: { graphs: string[] | string; onready?: (ms: number) => void } = $props();

    const t0 = performance.now();
    const memories = useShape(MemoryShapeType, { graphs });

    // Same pooled subscription: awaiting its readyPromise gives the fill time.
    const sub = OrmSubscription.getOrCreate(
        MemoryShapeType,
        normalizeScope({ graphs })
    );
    sub.readyPromise.then(() => onready?.(performance.now() - t0));

    const sorted = $derived(
        ([...memories] as unknown as Memory[]).sort((a, b) =>
            (a.name ?? "").localeCompare(b.name ?? "")
        )
    );
</script>

<div class="border rounded p-2 my-2">
    <div class="font-mono text-sm">live count: {memories.size}</div>
    <ul class="text-sm max-h-40 overflow-y-auto">
        {#each sorted.slice(0, 10) as m (`${m["@graph"]}|${m["@id"]}`)}
            <li>
                <code>{m.name ?? "(unnamed)"}</code> — {m.startDate}
                <span class="opacity-50">({m["@graph"].substring(0, 20)}…)</span>
            </li>
        {/each}
        {#if sorted.length > 10}<li>… and {sorted.length - 10} more</li>{/if}
    </ul>
</div>
