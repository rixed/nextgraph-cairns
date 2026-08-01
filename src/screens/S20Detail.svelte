<script lang="ts">
    // S-20 Memory detail: title or date as heading; date at stored precision.
    import { useShape } from "@ng-org/orm/svelte";
    import { OrmSubscription, normalizeScope } from "@ng-org/orm";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import {
        parsePrecisionDate,
        formatPrecisionDate,
    } from "../lib/dates";
    import { deleteMemory } from "../lib/memories";
    import { router } from "../lib/router.svelte";
    import TagChips from "../components/TagChips.svelte";

    const doc = router.current.params!.doc;
    const memories = useShape(MemoryShapeType, "did:ng:i");

    let ready = $state(false);
    OrmSubscription.getOrCreate(
        MemoryShapeType,
        normalizeScope("did:ng:i")
    ).readyPromise.then(() => (ready = true));

    const memory = $derived([...memories].find((m) => m["@graph"] === doc));
    const start = $derived(
        memory ? parsePrecisionDate(memory.startDate) : undefined
    );
    const end = $derived(
        memory ? parsePrecisionDate(memory.endDate ?? undefined) : undefined
    );

    let confirming = $state(false);
    let deleting = $state(false);

    async function doDelete() {
        deleting = true;
        try {
            await deleteMemory(doc);
            router.replaceRoot({ name: "browse" });
        } catch (e) {
            deleting = false;
            confirming = false;
            console.error(e);
        }
    }
</script>

<div class="p-4 max-w-2xl mx-auto flex flex-col gap-3">
    <button class="btn btn-ghost btn-sm self-start" onclick={() => router.pop()}>
        ← back
    </button>

    {#if memory && start}
        <h1 class="text-2xl font-bold">
            {memory.name ?? formatPrecisionDate(start)}
        </h1>
        <div class="opacity-70">
            {formatPrecisionDate(start)}{end
                ? ` → ${formatPrecisionDate(end)}`
                : ""}
        </div>

        {#if memory.subject?.size}
            <div class="flex gap-1 flex-wrap">
                <TagChips iris={memory.subject} />
            </div>
        {/if}

        {#if memory.description}
            <p class="italic opacity-80">{memory.description}</p>
        {/if}

        {#if memory.text}
            <p class="whitespace-pre-wrap">{memory.text}</p>
        {/if}

        <div class="flex gap-2 mt-4">
            <button
                class="btn btn-sm"
                onclick={() =>
                    router.push({ name: "editor", params: { doc } })}
            >
                Edit
            </button>
            {#if confirming}
                <button
                    class="btn btn-sm btn-error"
                    disabled={deleting}
                    onclick={doDelete}
                >
                    Really delete
                </button>
                <button
                    class="btn btn-sm"
                    disabled={deleting}
                    onclick={() => (confirming = false)}
                >
                    Keep
                </button>
            {:else}
                <button
                    class="btn btn-sm btn-outline btn-error"
                    onclick={() => (confirming = true)}
                >
                    Delete
                </button>
            {/if}
        </div>
    {:else if !ready}
        <span class="loading loading-spinner"></span>
    {:else}
        <!-- S-80 flavored inline state: deleted or not yet synced. -->
        <div class="alert">
            <span>
                This memory is unavailable — it may have been deleted, or not
                synced to this device yet.
            </span>
        </div>
    {/if}
</div>
