<script lang="ts">
    // A reservation, shown and never edited (§5's second rule: discovered
    // objects are displayed, and the only outbound action is to open the app
    // that owns them — which P0 has no way to do, so there is no action at all).
    import { KIND_LABEL, type Reservation } from "../lib/reservations.svelte";

    interface Props {
        r: Reservation;
        /** Sizes it for a list on S-01 versus a footnote on a memory. */
        compact?: boolean;
    }
    const { r, compact = false }: Props = $props();

    const fmt = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    });
    const day = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

    /**
     * Exactly what was recorded, never rounded into "tomorrow": a confirmation
     * time is the one number here the user may need to act on.
     */
    const when = $derived.by(() => {
        if (r.startMs === undefined) return "";
        const start = fmt.format(r.startMs);
        if (r.endMs === undefined || r.endMs === r.startMs) return start;
        const sameDay =
            new Date(r.startMs).toDateString() ===
            new Date(r.endMs).toDateString();
        return `${start} → ${sameDay ? fmt.format(r.endMs).split(", ").pop() : day.format(r.endMs)}`;
    });

    const label = $derived(KIND_LABEL[r.kind] ?? KIND_LABEL.Reservation);
</script>

<div
    class="flex items-baseline gap-2 {compact ? 'text-xs' : 'text-sm'}"
    title={r.number ? `Confirmation ${r.number}` : undefined}
>
    <span>{label.icon}</span>
    <span class="font-medium">{r.forName ?? label.noun}</span>
    <span class="opacity-70">{when}</span>
    {#if r.number && !compact}
        <span class="opacity-50 ml-auto font-mono text-xs">{r.number}</span>
    {/if}
</div>
