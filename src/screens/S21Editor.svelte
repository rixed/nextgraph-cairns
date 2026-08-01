<script lang="ts">
    // S-21 Memory capture / editor. Only a date is required, defaulting to now
    // at day precision.
    import { useShape } from "@ng-org/orm/svelte";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import {
        parsePrecisionDate,
        today,
        type PrecisionDate,
    } from "../lib/dates";
    import { spanOf } from "../lib/media";
    import { createMemory, updateMemory } from "../lib/memories";
    import { router } from "../lib/router.svelte";
    import PrecisionDatePicker from "../components/PrecisionDatePicker.svelte";
    import TagMultiselect from "../components/TagMultiselect.svelte";
    import MediaPicker from "../components/MediaPicker.svelte";

    const editedDoc = router.current.params?.doc;
    const memories = useShape(MemoryShapeType, "did:ng:i");

    let start = $state<PrecisionDate>(today());
    let end = $state<PrecisionDate | undefined>(undefined);
    let name = $state("");
    let description = $state("");
    let text = $state("");
    let tags = $state<string[]>([]);
    let media = $state<string[]>([]);
    let saving = $state(false);
    let error = $state("");

    // Edit mode: initialize from the live object once it is available.
    let initialized = $state(!editedDoc);
    $effect(() => {
        if (initialized || !editedDoc) return;
        const m = [...memories].find((m) => m["@graph"] === editedDoc);
        if (!m) return;
        const s = parsePrecisionDate(m.startDate);
        if (s) start = s;
        end = parsePrecisionDate(m.endDate ?? undefined);
        name = m.name ?? "";
        description = m.description ?? "";
        text = m.text ?? "";
        tags = [...(m.subject ?? [])];
        media = [...(m.subjectOf ?? [])];
        initialized = true;
    });

    // The span drives the picker: change the date and the photographs that
    // would associate on their own change with it, live.
    const span = $derived(spanOf(start.lexical, end?.lexical));

    const toggleMedia = (doc: string) => {
        media = media.includes(doc)
            ? media.filter((m) => m !== doc)
            : [...media, doc];
    };

    const toggleTag = (iri: string) => {
        tags = tags.includes(iri)
            ? tags.filter((t) => t !== iri)
            : [...tags, iri];
    };

    async function save() {
        saving = true;
        error = "";
        try {
            const fields = {
                startDate: start,
                endDate: end,
                name: name.trim() || undefined,
                description: description.trim() || undefined,
                text: text.trim() || undefined,
                tags,
                media,
            };
            if (editedDoc) {
                await updateMemory(editedDoc, fields);
                router.pop();
            } else {
                const doc = await createMemory(fields);
                router.pop();
                router.push({ name: "detail", params: { doc } });
            }
        } catch (e) {
            error = String(e);
            saving = false;
        }
    }
</script>

<div class="p-4 max-w-2xl mx-auto flex flex-col gap-4">
    <h1 class="text-xl font-bold">
        {editedDoc ? "Edit memory" : "New memory"}
    </h1>

    {#if editedDoc && !initialized}
        <span class="loading loading-spinner"></span>
    {:else}
        <div>
            <div class="label"><span class="label-text">When *</span></div>
            <PrecisionDatePicker value={start} onchange={(d) => (start = d)} />
        </div>

        <div>
            {#if end}
                <div class="label"><span class="label-text">Until</span></div>
                <div class="flex items-start gap-2">
                    <PrecisionDatePicker
                        value={end}
                        onchange={(d) => (end = d)}
                    />
                    <button
                        class="btn btn-ghost btn-xs"
                        onclick={() => (end = undefined)}
                    >
                        ✕
                    </button>
                </div>
            {:else}
                <button
                    class="btn btn-ghost btn-xs"
                    onclick={() => (end = { ...start })}
                >
                    + end date
                </button>
            {/if}
        </div>

        <label class="form-control">
            <div class="label"><span class="label-text">Title</span></div>
            <input
                class="input input-bordered"
                bind:value={name}
                placeholder="Optional"
            />
        </label>

        <label class="form-control">
            <div class="label"><span class="label-text">Short note</span></div>
            <input
                class="input input-bordered"
                bind:value={description}
                placeholder="One line, shown in lists"
            />
        </label>

        <label class="form-control">
            <div class="label"><span class="label-text">Narrative</span></div>
            <textarea
                class="textarea textarea-bordered min-h-32"
                bind:value={text}
                placeholder="What happened?"
            ></textarea>
        </label>

        <TagMultiselect selected={tags} ontoggle={toggleTag} />

        <MediaPicker {span} attached={media} ontoggle={toggleMedia} />

        {#if error}
            <div class="alert alert-error text-sm">{error}</div>
        {/if}

        <div class="flex gap-2 justify-end">
            <button class="btn" onclick={() => router.pop()} disabled={saving}>
                Cancel
            </button>
            <button class="btn btn-primary" onclick={save} disabled={saving}>
                {#if saving}<span class="loading loading-spinner loading-xs"
                    ></span>{/if}
                Save
            </button>
        </div>
    {/if}
</div>
