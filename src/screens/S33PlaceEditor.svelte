<script lang="ts">
    // S-33 Unnamed / custom place editor (§6.2). Two things arrive here:
    //
    // - an **unnamed location** (§3.2's second shape): coordinates nested in the
    //   memory that recorded them, with no URI — not referenceable, not
    //   shareable, not searchable. That is the right default, because most
    //   places one stands in are nobody's business. This screen is where the
    //   user says "this one is different", once, and promotes it.
    // - an **identified place** the app can write, from S-31. Here the rule is
    //   the opposite one: change what we were shown and touch nothing else.
    //   A place document may carry opening hours, categories, an address in
    //   parts — anything the application that wrote it cared about — and this
    //   app models six properties (§5).
    import {
        useAllPlaces,
        findPlace,
        nestedIn,
        isWritable,
        updateUnnamedLocation,
        updatePlaceFields,
        promoteLocation,
        formatCoords,
        type PlaceFields,
    } from "../lib/places";
    import { router } from "../lib/router.svelte";

    const iri = router.current.params!.iri;
    const memoryDoc = nestedIn(iri);
    const unnamed = !!memoryDoc;
    const writable = $derived(unnamed || isWritable(iri));

    const places = useAllPlaces();
    const place = $derived(findPlace(places.all, iri));

    // Seeded once from the store, then owned by the form: re-deriving would
    // undo what is being typed every time the subscription ticks.
    let name = $state("");
    let lat = $state("");
    let lon = $state("");
    let sameAs = $state("");
    /**
     * Exactly what was read, kept so that an edit can withdraw the values it
     * was shown and nothing else — see `updatePlaceFields`.
     */
    let seen = $state<PlaceFields>({});
    let seeded = false;
    $effect(() => {
        if (seeded || !place) return;
        seeded = true;
        name = place.name ?? "";
        lat = place.lat !== undefined ? String(place.lat) : "";
        lon = place.lon !== undefined ? String(place.lon) : "";
        sameAs = place.sameAs ?? "";
        seen = {
            name: place.name,
            lat: place.lat,
            lon: place.lon,
            sameAs: place.sameAs,
        };
    });

    let promoting = $state(false);
    let working = $state(false);
    let error = $state("");

    const coords = $derived({ lat: Number(lat), lon: Number(lon) });
    const valid = $derived(
        lat.trim() !== "" &&
            lon.trim() !== "" &&
            Number.isFinite(coords.lat) &&
            Number.isFinite(coords.lon) &&
            Math.abs(coords.lat) <= 90 &&
            Math.abs(coords.lon) <= 180
    );

    async function save() {
        if (!valid) return;
        working = true;
        error = "";
        try {
            if (unnamed)
                await updateUnnamedLocation(iri, {
                    name,
                    lat: coords.lat,
                    lon: coords.lon,
                });
            else
                await updatePlaceFields(
                    iri,
                    {
                        name,
                        lat: coords.lat,
                        lon: coords.lon,
                        sameAs,
                    },
                    seen
                );
            router.pop();
        } catch (e) {
            error = String(e);
            working = false;
        }
    }

    /**
     * Promotion leaves this screen for the place's own (S-33 → S-31): what was
     * a detail of one memory is now a thing in its own right, and the screen
     * that shows every memory there is the honest place to land.
     */
    async function promote() {
        if (!valid || !name.trim()) return;
        working = true;
        error = "";
        try {
            const doc = await promoteLocation(iri, {
                name,
                lat: coords.lat,
                lon: coords.lon,
                sameAs: sameAs.trim() || undefined,
            });
            router.pop();
            router.push({ name: "place", params: { iri: doc } });
        } catch (e) {
            error = String(e);
            working = false;
        }
    }
</script>

<div class="p-4 max-w-2xl mx-auto flex flex-col gap-3">
    <button class="btn btn-ghost btn-sm self-start" onclick={() => router.pop()}>
        ← back
    </button>

    {#if !writable}
        <!-- A gazetteer's URI: reachable, readable, and not ours to rewrite. -->
        <div class="alert">
            <span>
                This place is described somewhere this app cannot write. You can
                point memories at it, but its name and coordinates belong to
                whoever publishes it.
            </span>
        </div>
    {:else}
        {#if unnamed}
            <h1 class="text-xl font-bold">A place with no name</h1>
            <p class="text-sm opacity-70">
                It lives inside the memory that recorded it, and nothing else
                can point at it. Give it a name here if that helps you recognise
                it — or make it a place of its own, and every memory can.
            </p>
        {:else}
            <h1 class="text-xl font-bold">Edit this place</h1>
            <p class="text-sm opacity-70">
                Only what is shown here changes. Anything else this place
                carries — written by you elsewhere, or by another application —
                is left exactly as it is.
            </p>
        {/if}

        <label class="form-control">
            <div class="label py-0">
                <span class="label-text text-xs">
                    {unnamed ? "What you call it" : "Name"}
                </span>
            </div>
            <input
                class="input input-bordered input-sm"
                placeholder="the beach below the road"
                bind:value={name}
            />
        </label>

        <div class="flex gap-2">
            <label class="form-control">
                <div class="label py-0">
                    <span class="label-text text-xs">Latitude</span>
                </div>
                <input
                    class="input input-bordered input-sm w-40"
                    placeholder="Latitude"
                    bind:value={lat}
                />
            </label>
            <label class="form-control">
                <div class="label py-0">
                    <span class="label-text text-xs">Longitude</span>
                </div>
                <input
                    class="input input-bordered input-sm w-40"
                    placeholder="Longitude"
                    bind:value={lon}
                />
            </label>
        </div>
        {#if !valid && (lat.trim() || lon.trim())}
            <span class="text-xs text-error">
                Coordinates are two numbers, up to ±90 and ±180.
            </span>
        {:else if valid}
            <span class="text-xs opacity-50">
                {formatCoords(coords.lat, coords.lon)}
            </span>
        {/if}

        {#if !unnamed}
            <label class="form-control">
                <div class="label py-0">
                    <span class="label-text text-xs">
                        Also known as (optional)
                    </span>
                </div>
                <input
                    class="input input-bordered input-sm"
                    placeholder="https://www.wikidata.org/entity/Q…"
                    bind:value={sameAs}
                />
            </label>
        {/if}

        {#if promoting}
            <div class="bg-base-200 rounded-box p-3 flex flex-col gap-2">
                <p class="text-sm">
                    A place of its own gets a URI: other memories can point at
                    it, it can be shared, and it appears in place search. This
                    memory will point at it instead.
                </p>
                <label class="form-control">
                    <div class="label py-0">
                        <span class="label-text text-xs">
                            Already known elsewhere? Its address there
                            (optional)
                        </span>
                    </div>
                    <input
                        class="input input-bordered input-sm"
                        placeholder="https://www.wikidata.org/entity/Q…"
                        bind:value={sameAs}
                    />
                </label>
                <p class="text-xs opacity-60">
                    Saying so links the two rather than claiming this is the
                    first name it ever had (§3.2).
                </p>
                <div class="flex gap-2">
                    <button
                        class="btn btn-sm btn-primary"
                        disabled={!valid || !name.trim() || working}
                        onclick={promote}
                    >
                        Make it a place
                    </button>
                    <button
                        class="btn btn-sm"
                        disabled={working}
                        onclick={() => (promoting = false)}
                    >
                        Not now
                    </button>
                </div>
                {#if !name.trim()}
                    <span class="text-xs opacity-60">
                        A place of its own needs a name.
                    </span>
                {/if}
            </div>
        {/if}

        {#if error}
            <div class="alert alert-error text-sm"><span>{error}</span></div>
        {/if}

        <div class="flex gap-2 mt-2">
            <button
                class="btn btn-sm btn-primary"
                disabled={!valid || working}
                onclick={save}
            >
                Save
            </button>
            {#if unnamed && !promoting}
                <button
                    class="btn btn-sm btn-outline"
                    disabled={working}
                    onclick={() => (promoting = true)}
                >
                    Make it a place of its own…
                </button>
            {/if}
        </div>
    {/if}
</div>
