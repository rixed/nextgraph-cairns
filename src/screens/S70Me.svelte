<script lang="ts">
    // S-70 Me: profile and the menu into the app's own accounting. Counters
    // first, because they are the honest answer to "what is in here".
    // Stats, tags and settings are not built yet and say so (§8).
    import { useShape } from "@ng-org/orm/svelte";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import { useAllMedia } from "../lib/mediaFeed.svelte";
    import { router } from "../lib/router.svelte";

    const memories = useShape(MemoryShapeType, "did:ng:i");
    const feed = useAllMedia();

    const counts = $derived([
        { label: "memories", value: [...memories].length },
        { label: "photographs & clips", value: feed.all.length },
        {
            label: "tags in use",
            value: new Set(
                [...memories].flatMap((m: any) => [...(m.subject ?? [])])
            ).size,
        },
    ]);

    const rows = [
        {
            label: "What Cairns can see",
            hint: "the shapes it recognises in your store",
            route: "visible",
        },
        { label: "Stats", hint: "not built yet" },
        { label: "Tags", hint: "not built yet" },
        { label: "Settings", hint: "not built yet" },
    ] as const;
</script>

<div class="p-4 max-w-2xl mx-auto flex flex-col gap-4">
    <h1 class="text-xl font-bold">Me</h1>

    <div class="flex gap-6">
        {#each counts as c (c.label)}
            <div>
                <div class="text-2xl font-semibold">{c.value}</div>
                <div class="text-xs opacity-60">{c.label}</div>
            </div>
        {/each}
    </div>

    <ul class="menu bg-base-200 rounded-box">
        {#each rows as r (r.label)}
            <li>
                <button
                    disabled={!("route" in r)}
                    onclick={() =>
                        "route" in r &&
                        router.push({ name: "visible" })}
                >
                    <span>{r.label}</span>
                    <span class="text-xs opacity-60 ml-auto">{r.hint}</span>
                </button>
            </li>
        {/each}
    </ul>
</div>
