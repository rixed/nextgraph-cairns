<script lang="ts">
    // S-31 Place detail: "name, type, address, coordinates, external
    // identifier, containing chain. Your memories here, recommendation status,
    // media taken here, events here, conditional spend."
    //
    // Composition, not machinery. Everything shown is already resolved by the
    // IRI join (§3.2, spike 7), and every action hands the browse filter a
    // place facet and switches projection — S-31 → S-22b and S-31 → S-22c are
    // exactly that, so the map and the grid stay the only two screens that draw
    // memories in space.
    //
    // Absent by §5's first rule rather than stubbed: recommendation status
    // (S-40 is not built), conditional spend (nothing writes an expense),
    // events here (they want S-34 to open into), and "edit if locally owned"
    // (S-33). Each is a section that does not appear, not an empty one.
    import { useShape } from "@ng-org/orm/svelte";
    import { OrmSubscription, normalizeScope } from "@ng-org/orm";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import type { Memory } from "../shapes/orm/memoryShape.typings";
    import {
        useAllPlaces,
        findPlace,
        placeLabel,
        formatCoords,
        isWithin,
        isIdentified,
    } from "../lib/places";
    import { formatPrecisionDate, parsePrecisionDate } from "../lib/dates";
    import { browse } from "../lib/browse.svelte";
    import { router } from "../lib/router.svelte";

    const iri = router.current.params!.iri;
    const memories = useShape(MemoryShapeType, "did:ng:i");
    const places = useAllPlaces();

    let ready = $state(false);
    OrmSubscription.getOrCreate(
        MemoryShapeType,
        normalizeScope("did:ng:i")
    ).readyPromise.then(() => (ready = true));

    const place = $derived(findPlace(places.all, iri));

    /**
     * The containing chain, outermost last — Alfama → Lisboa → Portugal. Each
     * step is a place of its own and opens as one.
     */
    const chain = $derived.by(() => {
        const out: { iri: string; label: string }[] = [];
        let at = place?.containedIn;
        // Bounded: a cycle in someone else's data must not hang the screen.
        for (let i = 0; at && i < 12; i++) {
            const p = findPlace(places.all, at);
            out.push({ iri: at, label: placeLabel(p, at) });
            at = p?.containedIn;
        }
        return out;
    });

    /**
     * Memories here — transitively, so a memory in Alfama appears on Lisboa's
     * screen. The same rule the S-22 place facet uses, and the same function.
     */
    const here = $derived(
        ([...memories] as unknown as Memory[])
            .filter((m) =>
                [...(m.location ?? [])].some((l) =>
                    isWithin(places.all, l, iri)
                )
            )
            .map((m) => ({ m, start: parsePrecisionDate(m.startDate) }))
            .sort((a, b) =>
                (b.start?.lexical ?? "").localeCompare(a.start?.lexical ?? "")
            )
    );

    /** Hand the filter this place and let the projection that draws it draw it. */
    function showIn(projection: "space" | "media") {
        browse.facets.place = iri;
        router.replaceRoot({ name: "browse", params: { projection } });
    }

    function captureHere() {
        browse.setDraft({
            tags: [],
            media: [],
            locations: [{ kind: "place", iri }],
            attendees: [],
        });
        router.push({ name: "editor" });
    }
</script>

<div class="p-4 max-w-2xl mx-auto flex flex-col gap-3">
    <button class="btn btn-ghost btn-sm self-start" onclick={() => router.pop()}>
        ← back
    </button>

    {#if !place && !ready}
        <span class="loading loading-spinner"></span>
    {:else if !place}
        <!-- S-80 flavoured inline: a reference the store cannot resolve. -->
        <div class="alert">
            <span>
                This place is unavailable — it may not have synced to this
                device yet.
            </span>
        </div>
    {:else}
        <h1 class="text-2xl font-bold">📍 {placeLabel(place, iri)}</h1>

        {#if chain.length}
            <div class="text-sm opacity-70 flex flex-wrap items-center gap-1">
                {#each chain as step, i (step.iri)}
                    {#if i}<span class="opacity-40">·</span>{/if}
                    <button
                        class="link link-hover"
                        onclick={() =>
                            router.push({
                                name: "place",
                                params: { iri: step.iri },
                            })}
                    >
                        {step.label}
                    </button>
                {/each}
            </div>
        {/if}

        <dl class="text-sm flex flex-col gap-1">
            {#if place.address}
                <div class="flex gap-2">
                    <dt class="opacity-60 w-24">Address</dt>
                    <dd>{place.address}</dd>
                </div>
            {/if}
            {#if place.lat !== undefined && place.lon !== undefined}
                <div class="flex gap-2">
                    <dt class="opacity-60 w-24">Coordinates</dt>
                    <dd class="font-mono text-xs">
                        {formatCoords(place.lat, place.lon)}
                    </dd>
                </div>
            {:else}
                <!-- B-14 made visible where it costs something: this place is
                     real, and the app cannot put it on a map. -->
                <div class="flex gap-2">
                    <dt class="opacity-60 w-24">Coordinates</dt>
                    <dd class="opacity-60">
                        none this app can read
                    </dd>
                </div>
            {/if}
            {#if place.sameAs}
                <div class="flex gap-2">
                    <dt class="opacity-60 w-24">Also known as</dt>
                    <dd>
                        <a
                            class="link break-all text-xs"
                            href={place.sameAs}
                            target="_blank"
                            rel="noreferrer noopener"
                        >
                            {place.sameAs}
                        </a>
                    </dd>
                </div>
            {/if}
        </dl>

        <div class="flex flex-wrap gap-2">
            <button class="btn btn-sm btn-primary" onclick={captureHere}>
                Capture a memory here
            </button>
            {#if place.lat !== undefined}
                <button class="btn btn-sm" onclick={() => showIn("space")}>
                    Show on the map
                </button>
            {/if}
            <button class="btn btn-sm" onclick={() => showIn("media")}>
                Photographs here
            </button>
        </div>

        {#if here.length}
            <div>
                <h2 class="text-sm font-semibold opacity-70 mb-1">
                    {here.length}
                    {here.length === 1 ? "memory" : "memories"} here
                </h2>
                <ul class="menu bg-base-200 rounded-box w-full">
                    {#each here as row (row.m["@graph"])}
                        <li>
                            <button
                                onclick={() =>
                                    router.push({
                                        name: "detail",
                                        params: { doc: row.m["@graph"] },
                                    })}
                            >
                                <span class="flex flex-col items-start">
                                    <span class="font-medium">
                                        {row.m.name ??
                                            (row.start
                                                ? formatPrecisionDate(row.start)
                                                : "A memory")}
                                    </span>
                                    {#if row.start && row.m.name}
                                        <span class="text-xs opacity-60">
                                            {formatPrecisionDate(row.start)}
                                        </span>
                                    {/if}
                                </span>
                            </button>
                        </li>
                    {/each}
                </ul>
            </div>
        {:else if ready}
            <p class="text-sm opacity-60">
                Nothing of yours here yet.
            </p>
        {/if}

        {#if !isIdentified(iri)}
            <!-- Reached only by hand: an unnamed location is one memory's own
                 business and this screen is about places with identity (§3.2). -->
            <p class="text-xs opacity-60 border-t pt-2">
                This is an unnamed location inside a single memory, not a place
                other memories can refer to.
            </p>
        {/if}
    {/if}
</div>
