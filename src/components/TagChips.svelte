<script lang="ts">
    import { useShape } from "@ng-org/orm/svelte";
    import { ConceptShapeType } from "../shapes/orm/tagShape.shapeTypes";

    let { iris }: { iris: Iterable<string> } = $props();

    const concepts = useShape(ConceptShapeType, "did:ng:i");

    const labels = $derived(
        [...iris].map(
            (iri) =>
                [...concepts].find((c) => c["@id"] === iri)?.prefLabel ??
                iri.split("/").pop()!.substring(0, 12)
        )
    );
</script>

{#each labels as label}
    <span class="badge badge-outline badge-sm">{label}</span>
{/each}
