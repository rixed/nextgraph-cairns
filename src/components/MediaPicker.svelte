<script lang="ts">
    // The S-21 picker. Media are *selected, not uploaded* (§3.4): this is a
    // view over documents other applications already wrote, and the app only
    // records which ones a memory points at.
    //
    // It leads with what the overlap rule would associate anyway, so the user
    // attaches only the exceptions — a photograph from another day, or one the
    // camera never dated.
    import { useAllMedia } from "../lib/mediaFeed.svelte";
    import {
        takenAtMs,
        mediaInSpan,
        type Media,
    } from "../lib/media";
    import type { Interval } from "../lib/dates";
    import MediaTile from "./MediaTile.svelte";

    let {
        span,
        attached,
        ontoggle,
    }: {
        span: Interval | undefined;
        attached: string[];
        ontoggle: (mediaDoc: string) => void;
    } = $props();

    /** How many others to offer: enough to find one, not the whole archive. */
    const OFFERED = 60;

    const feed = useAllMedia();
    const all = $derived(feed.all);

    const byOverlap = $derived(span ? mediaInSpan(all, span) : []);
    const overlapDocs = $derived(new Set(byOverlap.map((m) => m.doc)));

    const attachedMedia = $derived(
        attached
            .map((d) => all.find((m) => m.doc === d))
            .filter((m): m is Media => !!m)
    );

    /** Everything else, most recent first — the exceptions live here. */
    const others = $derived(
        all
            .filter((m) => !overlapDocs.has(m.doc))
            .sort((a, b) => (takenAtMs(b) ?? 0) - (takenAtMs(a) ?? 0))
            .slice(0, OFFERED)
    );

    let open = $state(false);
</script>

<div class="flex flex-col gap-2">
    <div class="label"><span class="label-text">Photographs</span></div>

    {#if span && byOverlap.length}
        <p class="text-sm opacity-70">
            {byOverlap.length} photograph{byOverlap.length > 1 ? "s" : ""} taken
            in this span will appear on this memory on their own — nothing to
            attach.
        </p>
        <div class="flex gap-2 overflow-x-auto pb-1">
            {#each byOverlap.slice(0, 12) as m (m.doc)}
                <div class="w-16 shrink-0"><MediaTile media={m} /></div>
            {/each}
        </div>
    {/if}

    {#if attachedMedia.length}
        <p class="text-sm opacity-70">Attached explicitly:</p>
        <div class="flex gap-2 overflow-x-auto pb-1">
            {#each attachedMedia as m (m.doc)}
                <div class="w-16 shrink-0">
                    <MediaTile
                        media={m}
                        selected
                        onclick={() => ontoggle(m.doc)}
                    />
                </div>
            {/each}
        </div>
    {/if}

    {#if all.length}
        <button
            class="btn btn-sm btn-outline self-start"
            type="button"
            onclick={() => (open = !open)}
        >
            {open ? "Done" : "Attach another photograph…"}
        </button>
    {/if}

    {#if open}
        {#if others.length}
            <div class="grid grid-cols-4 sm:grid-cols-6 gap-1 max-h-64 overflow-y-auto p-1 border rounded">
                {#each others as m (m.doc)}
                    <MediaTile
                        media={m}
                        selected={attached.includes(m.doc)}
                        onclick={() => ontoggle(m.doc)}
                    />
                {/each}
            </div>
            {#if all.length - overlapDocs.size > OFFERED}
                <p class="text-xs opacity-60">
                    Showing the {OFFERED} most recent of {all.length -
                        overlapDocs.size}.
                </p>
            {/if}
        {:else}
            <p class="text-sm opacity-60">
                Every photograph discovered already falls inside this memory's
                span.
            </p>
        {/if}
    {/if}
</div>
