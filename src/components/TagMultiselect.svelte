<script lang="ts">
    import { useShape } from "@ng-org/orm/svelte";
    import { ConceptShapeType } from "../shapes/orm/tagShape.shapeTypes";

    let {
        selected,
        ontoggle,
    }: { selected: string[]; ontoggle: (iri: string) => void } = $props();

    // Wildcard scope: concepts from any scheme in the dataset (§5 — foreign
    // schemes are read when present).
    const concepts = useShape(ConceptShapeType, "did:ng:i");
    const sorted = $derived(
        [...concepts].sort((a, b) => a.prefLabel.localeCompare(b.prefLabel))
    );
</script>

<details class="dropdown">
    <summary class="btn btn-sm btn-outline">
        Tags{selected.length ? ` (${selected.length})` : ""}
    </summary>
    <div
        class="dropdown-content z-10 menu bg-base-100 rounded-box shadow w-64 max-h-64 overflow-y-auto flex-nowrap"
    >
        {#if sorted.length === 0}
            <div class="p-2 text-sm opacity-70">
                No tags yet. Concepts can be seeded from the dev screen.
            </div>
        {:else}
            {#each sorted as c (c["@id"])}
                <label class="label cursor-pointer justify-start gap-2 py-1">
                    <input
                        type="checkbox"
                        class="checkbox checkbox-sm"
                        checked={selected.includes(c["@id"])}
                        onchange={() => ontoggle(c["@id"])}
                    />
                    <span class="label-text">{c.prefLabel}</span>
                </label>
            {/each}
        {/if}
    </div>
</details>
