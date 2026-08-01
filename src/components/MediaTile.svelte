<script lang="ts">
    // One media tile. Three renderings, all of them states the spec requires
    // (§8): the picture, a placeholder for a descriptor without a thumbnail,
    // and a placeholder naming the cause when the file cannot be read.
    //
    // A tile never fetches a full-size image to shrink it (§3.4, B-01): a
    // source that publishes no thumbnails yields placeholders, and that gap is
    // stated rather than engineered around.
    import { fileUrl, type Media } from "../lib/media";

    let {
        media,
        selected = false,
        onclick,
    }: {
        media: Media;
        selected?: boolean;
        onclick?: () => void;
    } = $props();

    let url = $state<string | undefined>();
    let failed = $state(false);

    $effect(() => {
        const thumb = media.thumbnailUrl;
        if (!thumb) return;
        let live = true;
        failed = false;
        fileUrl(thumb, media.doc)
            .then((u) => live && (url = u))
            .catch(() => live && (failed = true));
        return () => (live = false);
    });

    // Keep the descriptor's own proportions when there is nothing to show, so
    // a placeholder occupies the space the photograph would have.
    const ratio = $derived(
        media.width && media.height ? media.width / media.height : 1
    );
</script>

<button
    class="relative block w-full overflow-hidden rounded bg-base-200 border {selected
        ? 'border-primary border-2'
        : 'border-base-300'}"
    style="aspect-ratio: {ratio}"
    {onclick}
    title={media.caption ?? media.takenAt ?? ""}
>
    {#if url}
        <img src={url} alt={media.caption ?? ""} class="w-full h-full object-cover" />
    {:else if failed}
        <span class="absolute inset-0 flex items-center justify-center text-xs opacity-60 px-1 text-center">
            not readable here
        </span>
    {:else if media.thumbnailUrl}
        <span class="absolute inset-0 flex items-center justify-center">
            <span class="loading loading-spinner loading-xs opacity-40"></span>
        </span>
    {:else}
        <!-- No thumbnail: an ordinary empty tile for the user. A development
             build marks it and names its source, so the boundary stays
             visible to whoever is deciding it (§3.4, B-01). -->
        <span class="absolute inset-0 flex items-center justify-center opacity-30">
            🖼
        </span>
        {#if import.meta.env.DEV}
            <span
                class="absolute bottom-0 left-0 right-0 bg-warning/80 text-[9px] leading-tight px-0.5 truncate"
                title="B-01: no schema:thumbnailUrl on {media.doc}"
            >
                no thumbnail
            </span>
        {/if}
    {/if}
</button>
