<script lang="ts">
    // S-51 Media detail. A foreign document, shown whole: every piece of its
    // metadata is read-only (§5), and the only things the user can change here
    // live on the memory — a local note, the cover designation, the explicit
    // attachment, and the suppression of a derived association (§3.9).
    //
    // There is no delete: the app cannot remove a document it does not own.
    import { useShape } from "@ng-org/orm/svelte";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import { useAllMedia } from "../lib/mediaFeed.svelte";
    import type { Memory } from "../shapes/orm/memoryShape.typings";
    import {
        fileUrl,
        spanOf,
        mediaInSpan,
        attachMedia,
        detachMedia,
        setCover,
        noteFor,
        setMediaNote,
        type Media,
    } from "../lib/media";
    import {
        isMediaSuppressed,
        suppressMedia,
        unsuppressMedia,
    } from "../lib/rejections.svelte";
    import { router } from "../lib/router.svelte";
    import { parsePrecisionDate, formatPrecisionDate } from "../lib/dates";

    const mediaDoc = router.current.params!.doc;
    /** The memory this was opened from, when it was. */
    const fromMemory = router.current.params?.from;

    const memories = useShape(MemoryShapeType, "did:ng:i");
    const feed = useAllMedia();

    const all = $derived(feed.all);
    const media = $derived(all.find((m) => m.doc === mediaDoc));
    const memory = $derived(
        fromMemory
            ? ([...memories].find((m) => m["@graph"] === fromMemory) as
                  | Memory
                  | undefined)
            : undefined
    );

    /** Siblings: what the memory shows, so paging here matches what led here. */
    const siblings = $derived.by(() => {
        if (!memory) return [];
        const span = spanOf(memory.startDate, memory.endDate);
        const explicit = [...(memory.subjectOf ?? [])];
        const byOverlap = span
            ? mediaInSpan(all, span)
                  .filter((m) => !isMediaSuppressed(fromMemory!, m.doc))
                  .map((m) => m.doc)
            : [];
        const order = [...new Set([...explicit, ...byOverlap])];
        return order
            .map((d) => all.find((m) => m.doc === d))
            .filter((m): m is Media => !!m);
    });
    const index = $derived(siblings.findIndex((m) => m.doc === mediaDoc));

    const isAttached = $derived(!!memory?.subjectOf?.has(mediaDoc));
    const isCover = $derived(memory?.image === mediaDoc);
    const isSuppressed = $derived(
        !!fromMemory && isMediaSuppressed(fromMemory, mediaDoc)
    );

    // Capture time is rendered at the precision the descriptor recorded, like
    // every other date in the app (§3.1) — never as a raw literal.
    const takenAt = $derived.by(() => {
        const d = parsePrecisionDate(media?.takenAt);
        return d ? formatPrecisionDate(d) : media?.takenAt;
    });

    // The full-size fetch is legitimate here: one image, deliberately opened.
    // The thumbnail stands in meanwhile, so the screen renders what it already
    // has rather than a spinner (§8, "partially loaded").
    let url = $state<string | undefined>();
    let poster = $state<string | undefined>();
    let failed = $state(false);
    $effect(() => {
        const m = media;
        if (!m) return;
        let live = true;
        url = undefined;
        poster = undefined;
        failed = false;
        if (m.thumbnailUrl)
            fileUrl(m.thumbnailUrl, m.doc)
                .then((u) => live && (poster = u))
                .catch(() => {});
        fileUrl(m.contentUrl, m.doc)
            .then((u) => live && (url = u))
            .catch(() => live && (failed = true));
        return () => (live = false);
    });

    let note = $state("");
    let noteLoaded = $state(false);
    $effect(() => {
        if (noteLoaded || !memory) return;
        note = noteFor(memory, mediaDoc)?.text ?? "";
        noteLoaded = true;
    });

    const go = (m: Media) =>
        router.replaceRoot({
            name: "media",
            params: fromMemory
                ? { doc: m.doc, from: fromMemory }
                : { doc: m.doc },
        });
</script>

<div class="flex flex-col gap-3 pb-4">
    <div class="flex items-center gap-2 p-2">
        <button class="btn btn-ghost btn-sm" onclick={() => router.pop()}>
            ← back
        </button>
        {#if siblings.length > 1}
            <div class="ml-auto flex items-center gap-1 text-sm opacity-70">
                <button
                    class="btn btn-ghost btn-xs"
                    disabled={index <= 0}
                    onclick={() => go(siblings[index - 1])}>‹</button
                >
                {index + 1} / {siblings.length}
                <button
                    class="btn btn-ghost btn-xs"
                    disabled={index < 0 || index >= siblings.length - 1}
                    onclick={() => go(siblings[index + 1])}>›</button
                >
            </div>
        {/if}
    </div>

    {#if !media}
        <!-- S-80 inline: deleted, never synced, or written by an app whose
             documents this session cannot read. -->
        <div class="alert m-4">
            <span>
                This photograph is unavailable — it may have been deleted, or
                not synced to this device yet.
            </span>
        </div>
    {:else}
        <div class="bg-base-300 flex items-center justify-center min-h-64">
            {#if media.kind === "video"}
                <!-- svelte-ignore a11y_media_has_caption -->
                <video
                    src={url}
                    poster={poster}
                    controls
                    class="max-h-[70vh] w-auto"
                ></video>
            {:else if media.kind === "audio"}
                <div class="p-10 flex flex-col items-center gap-3">
                    <span class="text-4xl opacity-40">♪</span>
                    <audio src={url} controls></audio>
                </div>
            {:else if url ?? poster}
                <img
                    src={url ?? poster}
                    alt={media.caption ?? ""}
                    class="max-h-[70vh] w-auto object-contain"
                />
            {:else if failed}
                <div
                    class="flex items-center justify-center opacity-60 text-sm p-10"
                    style={media.width && media.height
                        ? `aspect-ratio: ${media.width / media.height}`
                        : ""}
                >
                    The file could not be read on this device.
                </div>
            {:else}
                <span class="loading loading-spinner m-10"></span>
            {/if}
        </div>

        <div class="px-4 flex flex-col gap-3 max-w-2xl mx-auto w-full">
            {#if note}
                <p class="font-medium">{note}</p>
                {#if media.caption}
                    <p class="text-sm opacity-60 italic">
                        Caption from the source: {media.caption}
                    </p>
                {/if}
            {:else if media.caption}
                <p class="font-medium">{media.caption}</p>
            {/if}

            <!-- Foreign metadata, shown as recorded and never edited (§5). -->
            <dl class="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {#if takenAt}
                    <dt class="opacity-60">Taken</dt>
                    <dd>{takenAt}</dd>
                {/if}
                {#if media.lat !== undefined && media.lon !== undefined}
                    <dt class="opacity-60">Coordinates</dt>
                    <dd>{media.lat.toFixed(5)}, {media.lon.toFixed(5)}</dd>
                {/if}
                {#if media.width && media.height}
                    <dt class="opacity-60">Size</dt>
                    <dd>{media.width} × {media.height}</dd>
                {/if}
                {#if media.duration}
                    <dt class="opacity-60">Duration</dt>
                    <dd>{media.duration}</dd>
                {/if}
                <dt class="opacity-60">Document</dt>
                <dd class="font-mono text-xs break-all opacity-70">
                    {media.doc}
                </dd>
            </dl>

            {#if !media.thumbnailUrl && media.kind !== "audio"}
                <p class="text-xs opacity-60">
                    This source publishes no thumbnail, so this
                    {media.kind === "video" ? "clip" : "photograph"} shows as a
                    placeholder in lists and on the map.
                </p>
            {/if}

            {#if memory}
                <div class="divider my-1"></div>

                <label class="form-control">
                    <div class="label">
                        <span class="label-text">Your note</span>
                    </div>
                    <input
                        class="input input-bordered input-sm"
                        bind:value={note}
                        placeholder="What this photograph is to you"
                        onblur={() => setMediaNote(memory!, mediaDoc, note)}
                    />
                </label>

                <div class="flex flex-wrap gap-2">
                    {#if isAttached}
                        <button
                            class="btn btn-sm"
                            onclick={() => detachMedia(fromMemory!, mediaDoc)}
                        >
                            Detach
                        </button>
                    {:else}
                        <button
                            class="btn btn-sm"
                            onclick={async () => {
                                // Attaching plainly overrides an earlier "no".
                                unsuppressMedia(fromMemory!, mediaDoc);
                                await attachMedia(fromMemory!, mediaDoc);
                            }}
                        >
                            Attach to this memory
                        </button>
                    {/if}

                    <button
                        class="btn btn-sm"
                        onclick={() =>
                            setCover(fromMemory!, isCover ? undefined : mediaDoc)}
                    >
                        {isCover ? "Remove as cover" : "Make cover"}
                    </button>

                    {#if !isAttached}
                        {#if isSuppressed}
                            <button
                                class="btn btn-sm btn-ghost"
                                onclick={() =>
                                    unsuppressMedia(fromMemory!, mediaDoc)}
                            >
                                Undo "not this one"
                            </button>
                        {:else}
                            <button
                                class="btn btn-sm btn-outline"
                                onclick={() => {
                                    suppressMedia(fromMemory!, mediaDoc);
                                    router.pop();
                                }}
                            >
                                Not from this memory
                            </button>
                        {/if}
                    {/if}
                </div>

                <p class="text-xs opacity-60">
                    This photograph belongs to the application that wrote it.
                    Cairns can point at it, annotate it here, and stop showing
                    it — but not change or delete it.
                </p>
            {/if}
        </div>
    {/if}
</div>
