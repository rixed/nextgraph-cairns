<script lang="ts">
    // S-76 Data sources. A census of the RDF this app can discover and what it
    // would do with each kind — the screen that makes the framework legible
    // (§6.2), so it is a demo surface as much as a settings surface.
    //
    // Nothing here is about bytes, caches or replication: the framework owns
    // those (§1.2).
    import { useAllMedia } from "../lib/mediaFeed.svelte";
    import { countDocsOfType, countSubjectsOfType, select } from "../lib/query";
    import { router } from "../lib/router.svelte";

    const SKOS = "http://www.w3.org/2004/02/skos/core#";
    const APP = "did:ng:z:cairns/";

    const feed = useAllMedia();
    const media = $derived(feed.all);

    const byKind = $derived({
        image: media.filter((m) => m.kind === "image").length,
        video: media.filter((m) => m.kind === "video").length,
        audio: media.filter((m) => m.kind === "audio").length,
    });
    // Thumbnails decide whether the map and the grid show pictures or
    // placeholders, so this is the signal worth reporting (§6.2).
    const picturable = $derived(
        media.filter((m) => m.kind !== "audio").length
    );
    const withThumb = $derived(media.filter((m) => m.thumbnailUrl).length);
    const withTime = $derived(media.filter((m) => m.takenAt).length);
    const withPlace = $derived(media.filter((m) => m.lat !== undefined).length);

    let memories = $state<number | undefined>();
    let concepts = $state<number | undefined>();
    let schemes = $state<{ doc: string; label?: string }[]>([]);
    let rejections = $state<number | undefined>();

    $effect(() => {
        countDocsOfType(`${APP}Memory`).then((n) => (memories = n));
        // Concepts share one document, so these are subjects rather than docs.
        countSubjectsOfType(`${SKOS}Concept`).then((n) => (concepts = n));
        countDocsOfType(`${APP}Rejections`).then((n) => (rejections = n));
        // Read-only: finding no scheme here must not create one.
        select(
            `SELECT ?doc ?label WHERE { GRAPH ?doc {
                ?s a <${SKOS}ConceptScheme> .
                OPTIONAL { ?s <${SKOS}prefLabel> ?label }
             } }`
        ).then(
            (rows) =>
                (schemes = rows.map((r: any) => ({
                    doc: r.doc.value,
                    label: r.label?.value,
                })))
        );
    });

    const n = (v: number | undefined) => (v === undefined ? "…" : String(v));
</script>

<div class="p-4 max-w-2xl mx-auto flex flex-col gap-4">
    <div class="flex items-center gap-2">
        <button class="btn btn-ghost btn-sm" onclick={() => router.pop()}>
            ← back
        </button>
        <h1 class="text-xl font-bold">Data sources</h1>
    </div>

    <p class="text-sm opacity-70">
        Cairns does not import anything. It reads the documents already in your
        store — whichever application wrote them — and writes only its own.
    </p>

    <section class="border rounded p-3 flex flex-col gap-1">
        <h2 class="font-semibold">Media</h2>
        <p class="text-sm">
            {byKind.image}
            {byKind.image === 1 ? "image" : "images"}, {byKind.video}
            {byKind.video === 1 ? "video" : "videos"}, {byKind.audio} audio.
            Read only: captions, capture times and coordinates are shown as
            recorded and never edited.
        </p>
        <p class="text-sm">
            <strong>{withThumb} of {picturable}</strong> publish a thumbnail.
            {#if withThumb < picturable}
                The rest appear as placeholder tiles: Cairns will not fetch a
                full-size image to shrink it, because deriving representations
                belongs to whoever publishes the media (B-01).
            {/if}
        </p>
        <p class="text-sm opacity-70">
            {withTime} carry a capture time, which is what associates them with
            a memory by overlap; {withPlace} carry coordinates.
        </p>
    </section>

    <section class="border rounded p-3 flex flex-col gap-1">
        <h2 class="font-semibold">Tags</h2>
        {#if schemes.length}
            <p class="text-sm">
                {n(concepts)}
                {concepts === 1 ? "concept" : "concepts"} in {schemes.length}
                {schemes.length === 1 ? "scheme" : "schemes"}: {schemes
                    .map((s) => s.label ?? "unnamed")
                    .join(", ")}. Cairns appends concepts and never renames,
                merges or deletes one (§5).
            </p>
        {:else}
            <p class="text-sm opacity-70">
                No tag scheme yet. One will be created locally the first time a
                tag is added, and handed over if a tag manager ever appears
                (B-02).
            </p>
        {/if}
    </section>

    <section class="border rounded p-3 flex flex-col gap-1">
        <h2 class="font-semibold">What Cairns owns</h2>
        <p class="text-sm">
            {n(memories)}
            {memories === 1 ? "memory" : "memories"}, one document each. {rejections
                ? "One document holds what you told it to stop suggesting."
                : "Nothing you have rejected yet."}
        </p>
    </section>

    {#if import.meta.env.DEV}
        <section class="border border-warning rounded p-3 flex flex-col gap-1">
            <h2 class="font-semibold">Boundaries this build is borrowing</h2>
            <ul class="text-sm list-disc pl-5">
                <li>
                    <strong>B-12</strong> — this census is by type, not by
                    source: a document does not say which application wrote it,
                    so "sources" cannot yet be listed or toggled individually.
                </li>
                <li>
                    <strong>B-01</strong> — no thumbnail generator exists in the
                    ecosystem, so {picturable - withThumb} media show as
                    placeholders.
                </li>
                <li>
                    <strong>B-13</strong> — what happens when a file's blocks
                    have not synced is unmeasured, so "media unreachable" is
                    written blind.
                </li>
                <li>
                    <strong>B-02, B-03</strong> — the tag scheme, and later the
                    contacts document, are locally owned stopgaps.
                </li>
            </ul>
        </section>
    {/if}
</div>
