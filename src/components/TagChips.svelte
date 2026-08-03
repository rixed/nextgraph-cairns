<script lang="ts">
    // Tags as they are read (§3.5). The full path, not the leaf: "food/lisboa"
    // and "portugal/lisboa" are different tags, and a chip saying only
    // "lisboa" would make them look like one.
    import { useShape } from "@ng-org/orm/svelte";
    import { ConceptShapeType } from "../shapes/orm/tagShape.shapeTypes";
    import { pathOf, type Concept } from "../lib/tagPaths";

    let { iris }: { iris: Iterable<string> } = $props();

    const concepts = useShape(ConceptShapeType, "did:ng:i");

    const all = $derived(
        [...concepts].map(
            (c): Concept => ({
                id: c["@id"],
                label: c.prefLabel ?? "",
                broader: [...(c.broader ?? [])][0],
            })
        )
    );

    const labels = $derived(
        [...iris].map(
            // A concept whose document has not arrived resolves to nothing;
            // show the tail of the reference rather than an empty chip (§8).
            (iri) => pathOf(all, iri) || iri.split(/[#/]/).pop()!.slice(0, 12)
        )
    );
</script>

{#each labels as label}
    <span class="badge badge-outline badge-sm">{label}</span>
{/each}
