<script lang="ts">
    // S-22b Space projection: the map. Rendered inside the S-22 shell, which
    // owns the filter and the selection this reads — the same contract S-22a
    // and S-22c already keep.
    //
    // Three layers at their real densities (§6.2): memory claims, media points
    // dissolving out of clusters as you zoom, and a conditional track layer.
    // The style is local and the basemap is a source on top of it, so losing
    // the network costs geography and nothing else (spike 9, §8).
    //
    // Deferred, deliberately, until the structure is complete:
    //   - a representative thumbnail on a cluster rather than a count (§3.4);
    //   - derived locations rendered distinctly — nothing derives one yet.
    //
    // Everything loads on the main thread with the WASM engine, which is the
    // simplest thing that works. Worth revisiting only if a real archive makes
    // the two contend; nothing here is sized for that yet.
    import { onDestroy } from "svelte";
    import { Map as MapLibreMap, LngLatBounds, Popup } from "maplibre-gl";
    import "maplibre-gl/dist/maplibre-gl.css";
    import { useShape } from "@ng-org/orm/svelte";
    import { OrmSubscription, normalizeScope } from "@ng-org/orm";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import type { Memory } from "../shapes/orm/memoryShape.typings";
    import { router } from "../lib/router.svelte";
    import { useAllMedia } from "../lib/mediaFeed.svelte";
    import { useAllPlaces, findPlace, placeLabel } from "../lib/places";
    import { useAllPeople } from "../lib/people";
    import { isMediaSuppressed } from "../lib/rejections.svelte";
    import { useTracks } from "../lib/tracks.svelte";
    import { mapStyle, MAP_COLOURS } from "../lib/mapStyle";
    import {
        browse,
        matches,
        mediaMatching,
        type MatchContext,
    } from "../lib/browse.svelte";
    import {
        formatPrecisionDate,
        memoryInterval,
        parsePrecisionDate,
    } from "../lib/dates";
    import { takenAtMs } from "../lib/media";
    import TimeScrubber from "../components/TimeScrubber.svelte";

    const memories = useShape(MemoryShapeType, "did:ng:i");
    const mediaFeed = useAllMedia();
    const places = useAllPlaces();
    const people = useAllPeople();
    const tracks = useTracks();

    const ctx: MatchContext = $derived({
        media: mediaFeed.all,
        places: places.all,
        people: people.all,
        isSuppressed: isMediaSuppressed,
    });

    let ready = $state(false);
    OrmSubscription.getOrCreate(
        MemoryShapeType,
        normalizeScope("did:ng:i")
    ).readyPromise.then(() => (ready = true));

    function dateLabel(startDate: unknown): string {
        const d = parsePrecisionDate(startDate as any);
        return d ? formatPrecisionDate(d) : "a memory";
    }

    const filtered = $derived(
        ([...memories] as unknown as Memory[]).filter((m) =>
            matches(m, browse.facets, ctx)
        )
    );

    /**
     * A memory's points: one per location it claims that resolves to
     * coordinates this app can read. A place published with `schema:geo` alone
     * has none here (B-14), which is why the count below is of memories with no
     * *spatial presence* rather than of memories with no location.
     */
    const memoryPoints = $derived(
        filtered.flatMap((m) =>
            [...(m.location ?? [])]
                .map((iri) => ({ iri, p: findPlace(places.all, iri) }))
                .filter(({ p }) => p?.lat !== undefined && p?.lon !== undefined)
                .map(({ iri, p }) => ({
                    doc: m["@graph"] as string,
                    // A memory with no readable start date still has a place;
                    // the pin says where, and the detail screen says the rest.
                    title: m.name ?? dateLabel(m.startDate),
                    where: placeLabel(p, iri),
                    lat: p!.lat!,
                    lon: p!.lon!,
                }))
        )
    );

    const mediaPoints = $derived(
        mediaMatching(filtered, browse.facets, ctx).filter(
            (m) => m.lat !== undefined && m.lon !== undefined
        )
    );

    /**
     * The archive's own span, for the scrubber to travel over. Everything
     * dated counts, memories and photographs alike: a year with only pictures
     * in it is still a year you can scrub to.
     */
    const span = $derived.by(() => {
        const years: number[] = [];
        for (const m of [...memories] as unknown as Memory[]) {
            const s = parsePrecisionDate(m.startDate);
            if (!s) continue;
            const i = memoryInterval(s, parsePrecisionDate(m.endDate ?? undefined));
            years.push(
                new Date(i.earliest).getFullYear(),
                new Date(i.latest).getFullYear()
            );
        }
        for (const m of mediaFeed.all) {
            const t = takenAtMs(m);
            if (t !== undefined) years.push(new Date(t).getFullYear());
        }
        if (!years.length) return undefined;
        const min = Math.min(...years);
        const max = Math.max(...years);
        // One year is not a range, and a slider that cannot move is furniture.
        return min < max ? { min, max } : undefined;
    });

    /** §8: say what the map cannot show rather than dropping it silently. */
    const placed = $derived(new Set(memoryPoints.map((p) => p.doc)).size);
    const missing = $derived(filtered.length - placed);

    // ------------------------------------------------------------ the map

    let container: HTMLDivElement;
    let map: MapLibreMap | undefined;
    let loaded = $state(false);

    const fc = (features: any[]) => ({ type: "FeatureCollection", features });

    const data = $derived({
        memories: fc(
            memoryPoints.map((p) => ({
                type: "Feature",
                geometry: { type: "Point", coordinates: [p.lon, p.lat] },
                properties: { doc: p.doc, title: p.title, where: p.where },
            }))
        ),
        media: fc(
            mediaPoints.map((m) => ({
                type: "Feature",
                geometry: { type: "Point", coordinates: [m.lon!, m.lat!] },
                properties: { doc: m.doc },
            }))
        ),
        tracks: fc(
            tracks.all.map((t) => ({
                type: "Feature",
                geometry: { type: "LineString", coordinates: t.line },
                properties: { name: t.name ?? "" },
            }))
        ),
    });

    function addLayers(m: MapLibreMap) {
        m.addSource("tracks", { type: "geojson", data: data.tracks as any });
        m.addSource("media", {
            type: "geojson",
            data: data.media as any,
            cluster: true,
            clusterRadius: 50,
            clusterMaxZoom: 15,
        });
        m.addSource("memories", {
            type: "geojson",
            data: data.memories as any,
        });

        // Tracks under everything: they are context for the points, not the
        // subject (§5 — shown, never edited).
        m.addLayer({
            id: "tracks",
            type: "line",
            source: "tracks",
            paint: {
                "line-color": MAP_COLOURS.track,
                "line-width": 2,
                "line-opacity": 0.7,
            },
        });
        m.addLayer({
            id: "media-clusters",
            type: "circle",
            source: "media",
            filter: ["has", "point_count"],
            paint: {
                "circle-color": MAP_COLOURS.media,
                "circle-opacity": 0.55,
                "circle-radius": [
                    "step",
                    ["get", "point_count"],
                    12, 10, 18, 50, 26,
                ],
            },
        });
        // No count on the cluster and no thumbnail either (§3.4 wants the
        // thumbnail): text needs a glyph server, which is the network
        // dependency the local style exists to remove, and a thumbnail needs a
        // file_get per tile. Size carries the magnitude meanwhile.
        m.addLayer({
            id: "media-point",
            type: "circle",
            source: "media",
            filter: ["!", ["has", "point_count"]],
            paint: {
                "circle-color": MAP_COLOURS.media,
                "circle-radius": 4,
                "circle-opacity": 0.85,
            },
        });
        // Memories on top: they are the only thing here the user owns.
        m.addLayer({
            id: "memories",
            type: "circle",
            source: "memories",
            paint: {
                "circle-color": [
                    "case",
                    ["boolean", ["feature-state", "selected"], false],
                    MAP_COLOURS.selected,
                    MAP_COLOURS.memory,
                ],
                "circle-radius": 8,
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
            },
        });

        m.on("click", "memories", (e: any) => {
            const doc = e.features?.[0]?.properties?.doc;
            if (!doc) return;
            if (browse.selecting) browse.toggle(doc);
            else router.push({ name: "detail", params: { doc } });
        });
        // A cluster is an invitation to zoom, which is the whole point of
        // clustering: the alternative is a number you cannot open.
        m.on("click", "media-clusters", async (e: any) => {
            const f = e.features?.[0];
            const src = m.getSource("media") as any;
            const z = await src.getClusterExpansionZoom(f.properties.cluster_id);
            m.easeTo({ center: f.geometry.coordinates, zoom: z });
        });
        for (const id of ["memories", "media-clusters", "media-point"]) {
            m.on("mouseenter", id, () => (m.getCanvas().style.cursor = "pointer"));
            m.on("mouseleave", id, () => (m.getCanvas().style.cursor = ""));
        }

        const popup = new Popup({ closeButton: false, offset: 10 });
        m.on("mouseenter", "memories", (e: any) => {
            const p = e.features?.[0]?.properties;
            if (!p) return;
            popup
                .setLngLat(e.features[0].geometry.coordinates)
                .setText(p.where ? `${p.title} — ${p.where}` : p.title)
                .addTo(m);
        });
        m.on("mouseleave", "memories", () => popup.remove());

        // §6.2: long-press captures at a dropped pin. Right-click is the same
        // gesture where there is a mouse; both hand the editor an unnamed
        // location (§3.2) rather than minting a place nobody named.
        m.on("contextmenu", (e: any) => captureAt(e.lngLat));
        let held: ReturnType<typeof setTimeout> | undefined;
        const cancel = () => {
            clearTimeout(held);
            held = undefined;
        };
        m.on("touchstart", (e: any) => {
            // One finger only: two is a pinch, and a map that captured a
            // memory every time it was zoomed would be unusable.
            if (e.points?.length !== 1) return cancel();
            held = setTimeout(() => captureAt(e.lngLat), 550);
        });
        for (const ev of ["touchend", "touchcancel", "movestart", "touchmove"])
            m.on(ev as any, cancel);
    }

    /** Open the editor on a memory that has a place but not yet a date. */
    function captureAt(lngLat: { lat: number; lng: number }) {
        browse.setDraft({
            tags: [],
            media: [],
            locations: [
                { kind: "unnamed", lat: lngLat.lat, lon: lngLat.lng },
            ],
            attendees: [],
        });
        router.push({ name: "editor" });
    }

    /** Frame whatever there is to see, rather than a hard-coded somewhere. */
    function fit(m: MapLibreMap, animate: boolean) {
        const b = new LngLatBounds();
        let any = false;
        for (const f of [
            ...data.memories.features,
            ...data.media.features,
        ] as any[]) {
            b.extend(f.geometry.coordinates);
            any = true;
        }
        for (const f of data.tracks.features as any[])
            for (const c of f.geometry.coordinates) {
                b.extend(c);
                any = true;
            }
        if (!any) return;
        m.fitBounds(b, { padding: 48, maxZoom: 14, animate });
    }

    $effect(() => {
        if (!container || map) return;
        const m = new MapLibreMap({
            container,
            style: mapStyle(),
            center: [0, 20],
            zoom: 1,
        });
        map = m;
        m.on("error", (e: any) =>
            // A basemap that will not load is expected offline, and is not the
            // user's problem: their own points are all still here.
            console.warn("[map]", e?.error?.message ?? e?.error)
        );
        m.on("load", () => {
            addLayers(m);
            fit(m, false);
            loaded = true;
        });
    });

    // Keep the layers in step with the filter, without rebuilding the map.
    $effect(() => {
        const d = data;
        if (!map || !loaded) return;
        for (const id of ["memories", "media", "tracks"] as const)
            (map.getSource(id) as any)?.setData(d[id]);
    });

    // The selection belongs to the shell and can change from another
    // projection, so it is read rather than held. Recoloured by expression:
    // feature state would want stable numeric ids these features do not carry.
    $effect(() => {
        const sel = [...browse.selected];
        if (!map || !loaded) return;
        map.setPaintProperty("memories", "circle-color", [
            "case",
            ["in", ["get", "doc"], ["literal", sel]],
            MAP_COLOURS.selected,
            MAP_COLOURS.memory,
        ]);
    });

    onDestroy(() => map?.remove());
</script>

<div class="flex flex-col gap-2">
    <div
        bind:this={container}
        class="w-full h-[60vh] min-h-72 rounded border border-base-300"
    ></div>

    {#if span}
        <TimeScrubber min={span.min} max={span.max} />
    {/if}

    <div class="flex flex-wrap items-center gap-3 text-xs opacity-70">
        <span class="flex items-center gap-1">
            <span
                class="inline-block w-3 h-3 rounded-full"
                style="background:{MAP_COLOURS.memory}"
            ></span>
            {placed} memories
        </span>
        <span class="flex items-center gap-1">
            <span
                class="inline-block w-3 h-3 rounded-full"
                style="background:{MAP_COLOURS.media}"
            ></span>
            {mediaPoints.length} photographs
        </span>
        {#if tracks.all.length}
            <span class="flex items-center gap-1">
                <span
                    class="inline-block w-4 h-0.5"
                    style="background:{MAP_COLOURS.track}"
                ></span>
                {tracks.all.length} tracks
            </span>
        {/if}
        <span class="ml-auto hidden sm:inline">
            long-press the map to capture where you point
        </span>
    </div>

    {#if ready && missing}
        <!-- §8: a memory the map cannot place is still a memory. -->
        <div class="alert text-sm">
            <span>
                {missing} of {filtered.length} memories here have no place on the
                map — no location, or one published without coordinates this app
                can read.
            </span>
            <button
                class="btn btn-sm"
                onclick={() =>
                    router.replaceRoot({
                        name: "browse",
                        params: { projection: "time" },
                    })}
            >
                Show them in time
            </button>
        </div>
    {/if}
</div>
