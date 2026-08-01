<script lang="ts">
    import {
        atPrecision,
        parsePrecisionDate,
        type Precision,
        type PrecisionDate,
    } from "../lib/dates";

    let {
        value,
        onchange,
    }: { value: PrecisionDate; onchange: (d: PrecisionDate) => void } =
        $props();

    const precisions: { p: Precision; label: string }[] = [
        { p: "year", label: "Year" },
        { p: "month", label: "Month" },
        { p: "day", label: "Day" },
        { p: "dateTime", label: "Date & time" },
    ];

    function switchPrecision(p: Precision) {
        onchange(atPrecision(value, p));
    }

    // Native input value formats per precision.
    const inputValue = $derived.by(() => {
        if (value.precision === "dateTime") {
            // datetime-local wants YYYY-MM-DDTHH:MM
            return value.lexical.slice(0, 16);
        }
        return value.lexical;
    });

    function onInput(e: Event) {
        const v = (e.target as HTMLInputElement).value;
        if (!v) return;
        const lexical =
            value.precision === "dateTime" && v.length === 16 ? `${v}:00` : v;
        const parsed = parsePrecisionDate(lexical);
        if (parsed && parsed.precision === value.precision) onchange(parsed);
    }
</script>

<div class="flex flex-col gap-2">
    <div class="join" role="radiogroup" aria-label="Date precision">
        {#each precisions as { p, label }}
            <button
                type="button"
                class="join-item btn btn-xs"
                class:btn-primary={value.precision === p}
                aria-pressed={value.precision === p}
                onclick={() => switchPrecision(p)}
            >
                {label}
            </button>
        {/each}
    </div>

    {#if value.precision === "year"}
        <input
            type="number"
            class="input input-bordered w-32"
            min="0"
            max="9999"
            value={inputValue}
            oninput={(e) => {
                const y = (e.target as HTMLInputElement).value;
                const parsed = parsePrecisionDate(y.padStart(4, "0"));
                if (parsed) onchange(parsed);
            }}
        />
    {:else if value.precision === "month"}
        <input
            type="month"
            class="input input-bordered w-48"
            value={inputValue}
            oninput={onInput}
        />
    {:else if value.precision === "day"}
        <input
            type="date"
            class="input input-bordered w-48"
            value={inputValue}
            oninput={onInput}
        />
    {:else}
        <input
            type="datetime-local"
            class="input input-bordered w-64"
            value={inputValue}
            oninput={onInput}
        />
    {/if}
</div>
