<script lang="ts">
    // S-32 Place picker. Returns a place *reference* — or, just as often, a
    // location with no identity at all (§3.2, §6.2). It hands the choice back
    // through the router's return seam rather than writing anything: what a
    // half-written memory claims is the memory's business, not the picker's.
    //
    // §6.2 asks for four groups. Two of them need shapes this store may not
    // hold — an external gazetteer and public events — and a picker that
    // advertises another application's absence is worse than one that stays
    // quiet (§8), so they appear only in the developer view, which exists to
    // name what the app looked for and did not find.
    //
    // Deferred: the map. Dropping a pin means "here", "where that photograph
    // was taken", or typed coordinates until S-22b brings a map to point at.
    import { useAllMedia } from "../lib/mediaFeed.svelte";
    import { useAllPlaces, isIdentified, formatCoords, type LocationDraft } from "../lib/places";
    import { mediaInSpan, spanOf, takenAtMs, type Media } from "../lib/media";
    import { router } from "../lib/router.svelte";
    import { devView } from "../lib/devView.svelte";

    const startParam = router.current.params?.start;
    const endParam = router.current.params?.end;

    const places = useAllPlaces();
    const feed = useAllMedia();

    let query = $state("");
    let name = $state("");
    let lat = $state("");
    let lon = $state("");
    let locating = $state(false);
    let locateError = $state("");

    /** Places you know: identified ones only — an unnamed location is not
        referenceable, which is the whole of what §3.2 trades away. */
    const known = $derived(
        places.all
            .filter((p) => isIdentified(p.id))
            .filter((p) =>
                query.trim()
                    ? (p.name ?? "")
                          .toLowerCase()
                          .includes(query.trim().toLowerCase())
                    : true
            )
            .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    );

    /**
     * Coordinates the memory's own photographs already carry (§3.4, §6.2).
     * This is a *derived* location until the user picks it: choosing it is
     * what turns evidence into a claim, which is why it is offered and never
     * applied on its own (§8, "derived location").
     */
    const fromPhotographs = $derived.by(() => {
        const span = spanOf(startParam, endParam);
        if (!span) return [];
        const seen = new Set<string>();
        const out: { media: Media; lat: number; lon: number }[] = [];
        for (const m of mediaInSpan(feed.all, span)) {
            if (m.lat === undefined || m.lon === undefined) continue;
            // Coarse rounding: a hundred frames of the same afternoon are one
            // offer, not a list of near-identical coordinates.
            const key = `${m.lat.toFixed(3)},${m.lon.toFixed(3)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ media: m, lat: m.lat, lon: m.lon });
        }
        return out.slice(0, 6);
    });

    const when = (m: Media) => {
        const t = takenAtMs(m);
        return t ? new Date(t).toLocaleString() : "undated";
    };

    const typed = $derived.by(() => {
        const la = Number(lat.replace(",", "."));
        const lo = Number(lon.replace(",", "."));
        if (!lat.trim() || !lon.trim()) return undefined;
        if (!Number.isFinite(la) || !Number.isFinite(lo)) return undefined;
        if (Math.abs(la) > 90 || Math.abs(lo) > 180) return undefined;
        return { lat: la, lon: lo };
    });

    const give = (draft: LocationDraft) => router.pop(draft);

    /** "Here", when the browser will say where that is (§8). */
    function locateMe() {
        if (!navigator.geolocation) {
            locateError = "This browser will not say where it is.";
            return;
        }
        locating = true;
        locateError = "";
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                locating = false;
                lat = pos.coords.latitude.toFixed(6);
                lon = pos.coords.longitude.toFixed(6);
            },
            (err) => {
                locating = false;
                // The rest of the screen still works: typing coordinates and
                // choosing a photograph's are untouched by this failing.
                locateError =
                    err.code === err.PERMISSION_DENIED
                        ? "Location permission was refused."
                        : "Your location is not available right now.";
            },
            { enableHighAccuracy: true, timeout: 10_000 }
        );
    }
</script>

<div class="p-4 max-w-2xl mx-auto flex flex-col gap-4">
    <div class="flex items-center gap-2">
        <button class="btn btn-ghost btn-sm" onclick={() => router.pop()}>
            ← back
        </button>
        <h1 class="text-xl font-bold">Where?</h1>
    </div>

    <input
        class="input input-bordered"
        bind:value={query}
        placeholder="Search the places you know"
    />

    {#if known.length}
        <div>
            <h2 class="text-sm font-semibold opacity-70 mb-1">
                Places you know
            </h2>
            <ul class="menu bg-base-200 rounded-box w-full">
                {#each known as p (p.id)}
                    <li>
                        <button
                            onclick={() => give({ kind: "place", iri: p.id })}
                        >
                            <span class="flex flex-col items-start">
                                <span class="font-medium">
                                    {p.name ?? "Unnamed place"}
                                </span>
                                {#if p.address}
                                    <span class="text-xs opacity-60">
                                        {p.address}
                                    </span>
                                {:else if p.lat !== undefined && p.lon !== undefined}
                                    <span class="text-xs opacity-60">
                                        {formatCoords(p.lat, p.lon)}
                                    </span>
                                {/if}
                            </span>
                        </button>
                    </li>
                {/each}
            </ul>
        </div>
    {:else if query.trim()}
        <p class="text-sm opacity-70">
            No place you know is called that. Drop a pin below instead — most
            of the places worth remembering never had a name.
        </p>
    {/if}

    {#if fromPhotographs.length}
        <div>
            <h2 class="text-sm font-semibold opacity-70 mb-1">
                Where your photographs were taken
            </h2>
            <p class="text-xs opacity-60 mb-1">
                Read from the photographs themselves. Nothing is claimed until
                you choose one.
            </p>
            <ul class="menu bg-base-200 rounded-box w-full">
                {#each fromPhotographs as f (f.media.doc)}
                    <li>
                        <button
                            onclick={() =>
                                give({
                                    kind: "unnamed",
                                    lat: f.lat,
                                    lon: f.lon,
                                    name: name.trim() || undefined,
                                })}
                        >
                            <span class="flex flex-col items-start">
                                <span class="font-mono text-sm">
                                    {formatCoords(f.lat, f.lon)}
                                </span>
                                <span class="text-xs opacity-60">
                                    {when(f.media)}
                                </span>
                            </span>
                        </button>
                    </li>
                {/each}
            </ul>
        </div>
    {/if}

    <div class="flex flex-col gap-2">
        <h2 class="text-sm font-semibold opacity-70">Drop a pin instead</h2>
        <p class="text-xs opacity-60">
            A beach, a wasteland, a friend's garden: coordinates and a name you
            choose, kept inside this memory and nowhere else.
        </p>

        <input
            class="input input-bordered input-sm"
            bind:value={name}
            placeholder="What you call it (optional)"
        />
        <div class="flex gap-2">
            <input
                class="input input-bordered input-sm w-full"
                bind:value={lat}
                inputmode="decimal"
                placeholder="Latitude"
            />
            <input
                class="input input-bordered input-sm w-full"
                bind:value={lon}
                inputmode="decimal"
                placeholder="Longitude"
            />
        </div>

        <div class="flex flex-wrap gap-2 items-center">
            <button class="btn btn-sm" onclick={locateMe} disabled={locating}>
                {#if locating}
                    <span class="loading loading-spinner loading-xs"></span>
                {/if}
                Where I am now
            </button>
            <button
                class="btn btn-sm btn-primary"
                disabled={!typed}
                onclick={() =>
                    give({
                        kind: "unnamed",
                        lat: typed!.lat,
                        lon: typed!.lon,
                        name: name.trim() || undefined,
                    })}
            >
                Use these coordinates
            </button>
        </div>
        {#if locateError}
            <p class="text-xs opacity-70">{locateError}</p>
        {/if}
        {#if (lat.trim() || lon.trim()) && !typed}
            <p class="text-xs text-error">
                Latitude and longitude, in degrees.
            </p>
        {/if}

        <p class="text-xs opacity-60">
            The map arrives with the space projection; until then a pin is
            dropped by coordinates rather than by pointing.
        </p>
    </div>

    {#if devView.on}
        <div class="text-xs opacity-60 border-t pt-2">
            <p class="font-semibold">Not offered here</p>
            <p>
                §6.2 also asks for external gazetteer matches and events at a
                place. Nothing in this store publishes either shape, so the
                groups are absent rather than empty — an app that has never
                seen a gazetteer should not advertise one.
            </p>
        </div>
    {/if}
</div>
