<script lang="ts">
    import { router } from "../lib/router.svelte";

    const label = $derived(router.current.params?.label ?? "This screen");
</script>

<div class="p-8 text-center opacity-60">
    <h1 class="text-xl font-bold mb-2">{label}</h1>
    <p>Coming in a later milestone.</p>
</div>
