<script lang="ts">
    // The time scrubber §6.2 asks of S-22b, bound to the filter's date range
    // rather than to a state of its own. Dragging it narrows every projection
    // at once, because the facets are the shell's — the map is not showing a
    // different archive from the list, only a different view of it.
    //
    // Years, not days: the archive's whole span has to fit in a thumb's travel,
    // and §3.1's variable precision means a year is a date the app already
    // understands. Two sliders rather than one dual-thumb control — a real
    // range input has one thumb, and faking two costs more than it explains.
    import { browse } from "../lib/browse.svelte";

    interface Props {
        /** The archive's own bounds, in years. */
        min: number;
        max: number;
    }
    const { min, max }: Props = $props();

    const year = (lexical: string) => Number(lexical.slice(0, 4));
    const at = (y: number) => ({ lexical: String(y), precision: "year" as const });

    const from = $derived(
        browse.facets.from ? year(browse.facets.from.lexical) : min
    );
    const to = $derived(browse.facets.to ? year(browse.facets.to.lexical) : max);
    const whole = $derived(!browse.facets.from && !browse.facets.to);

    /** Neither handle may cross the other: an empty range is not a gesture. */
    function setFrom(y: number) {
        browse.facets.from = at(y);
        if (y > to) browse.facets.to = at(y);
    }
    function setTo(y: number) {
        browse.facets.to = at(y);
        if (y < from) browse.facets.from = at(y);
    }
    function clear() {
        browse.facets.from = undefined;
        browse.facets.to = undefined;
    }
</script>

<div class="flex flex-col gap-1">
    <div class="flex items-center gap-2 text-xs">
        <span class="opacity-70">
            {whole ? `${min} – ${max}` : `${from} – ${to}`}
        </span>
        {#if !whole}
            <button class="btn btn-ghost btn-xs" onclick={clear}>
                whole archive
            </button>
        {/if}
    </div>
    <!-- Labelled, because two bars side by side otherwise read as one that
         has been dragged, rather than as the two ends of a range. -->
    <div class="flex items-center gap-2">
        <span class="text-xs opacity-50 w-8 text-right">from</span>
        <input
            class="range range-xs flex-1"
            type="range"
            aria-label="From year"
            {min}
            {max}
            value={from}
            oninput={(e) => setFrom(+e.currentTarget.value)}
        />
        <span class="text-xs opacity-50 w-6 text-right">to</span>
        <input
            class="range range-xs flex-1"
            type="range"
            aria-label="To year"
            {min}
            {max}
            value={to}
            oninput={(e) => setTo(+e.currentTarget.value)}
        />
    </div>
</div>
