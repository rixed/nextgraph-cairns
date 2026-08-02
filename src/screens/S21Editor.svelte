<script lang="ts">
    // S-21 Memory capture / editor. Only a date is required, defaulting to now
    // at day precision.
    //
    // Locations are 0..N (§3.2): a reference to a place that has identity, or
    // an unnamed one written into this memory's own document. Both are picked
    // in S-32, which is also where the coordinates the memory's photographs
    // already carry are offered — the derived location deferred from milestone
    // 2. Nothing derived is stored until the user chooses it (§8).
    import { useShape } from "@ng-org/orm/svelte";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import {
        parsePrecisionDate,
        today,
        type PrecisionDate,
    } from "../lib/dates";
    import { spanOf } from "../lib/media";
    import {
        useAllPlaces,
        placesReady,
        draftOf,
        findPlace,
        placeLabel,
        formatCoords,
        type LocationDraft,
    } from "../lib/places";
    import {
        useAllPeople,
        peopleReady,
        attendeeDraftOf,
        type AttendeeDraft,
    } from "../lib/people";
    import { createMemory, updateMemory } from "../lib/memories";
    import {
        useRecommendations,
        fulfilRecommendations,
    } from "../lib/recommendations";
    import { browse } from "../lib/browse.svelte";
    import { router } from "../lib/router.svelte";
    import PrecisionDatePicker from "../components/PrecisionDatePicker.svelte";
    import TagMultiselect from "../components/TagMultiselect.svelte";
    import MediaPicker from "../components/MediaPicker.svelte";
    import AttendeeMultiselect from "../components/AttendeeMultiselect.svelte";

    const editedDoc = router.current.params?.doc;
    const memories = useShape(MemoryShapeType, "did:ng:i");
    const places = useAllPlaces();
    const people = useAllPeople();
    /** Which documents are memories — what tells a bare name from a contact. */
    const memoryDocs = $derived(
        new Set([...memories].map((m) => m["@graph"] as string))
    );

    let start = $state<PrecisionDate>(today());
    let end = $state<PrecisionDate | undefined>(undefined);
    let name = $state("");
    let description = $state("");
    let text = $state("");
    let tags = $state<string[]>([]);
    let media = $state<string[]>([]);
    let locations = $state<LocationDraft[]>([]);
    let attendees = $state<AttendeeDraft[]>([]);

    // "Write a memory about these" (§4.4) hands over a derived span, the tag
    // the selection shares and the places it names. Everything is a suggestion:
    // this is an ordinary editor with its fields already filled in.
    if (!editedDoc) {
        const d = browse.takeDraft();
        if (d) {
            if (d.startDate) start = d.startDate;
            end = d.endDate;
            tags = d.tags;
            media = d.media;
            locations = d.locations;
            attendees = d.attendees.map((iri) => ({ kind: "contact", iri }));
        }
    }
    let saving = $state(false);
    let error = $state("");

    // Edit mode: initialize from the live object once it is available.
    //
    // Waiting for the places too is not pedantry: an unnamed location's
    // coordinates live in this memory's own document but arrive through their
    // own subscription, and initializing before they land would rewrite them
    // as 0,0 on the next save (§8, "partially loaded").
    let initialized = $state(!editedDoc);
    let placesLoaded = $state(!editedDoc);
    if (editedDoc)
        Promise.all([placesReady(), peopleReady()]).then(
            () => (placesLoaded = true)
        );
    $effect(() => {
        if (initialized || !editedDoc || !placesLoaded) return;
        const m = [...memories].find((m) => m["@graph"] === editedDoc);
        if (!m) return;
        const s = parsePrecisionDate(m.startDate);
        if (s) start = s;
        end = parsePrecisionDate(m.endDate ?? undefined);
        name = m.name ?? "";
        description = m.description ?? "";
        text = m.text ?? "";
        tags = [...(m.subject ?? [])];
        media = [...(m.subjectOf ?? [])];
        locations = [...(m.location ?? [])].map((iri) =>
            draftOf(iri, places.all)
        );
        attendees = [...(m.attendee ?? [])].map((iri) =>
            attendeeDraftOf(iri, people.all, memoryDocs)
        );
        initialized = true;
    });

    // The span drives the picker: change the date and the photographs that
    // would associate on their own change with it, live.
    const span = $derived(spanOf(start.lexical, end?.lexical));

    const toggleMedia = (doc: string) => {
        media = media.includes(doc)
            ? media.filter((m) => m !== doc)
            : [...media, doc];
    };

    /** What a location in the list is called, resolved through the join. */
    const labelOf = (loc: LocationDraft): string =>
        loc.kind === "place"
            ? placeLabel(findPlace(places.all, loc.iri), loc.iri)
            : (loc.name?.trim() || formatCoords(loc.lat, loc.lon));

    const addLocation = () =>
        router.push({
            name: "placepicker",
            // The picker offers what this memory's own photographs already
            // know, so it needs the span the date fields currently say.
            params: end?.lexical
                ? { start: start.lexical, end: end.lexical }
                : { start: start.lexical },
            onReturn: (value) => {
                const loc = value as LocationDraft | undefined;
                if (loc) locations = [...locations, loc];
            },
        });

    const toggleTag = (iri: string) => {
        tags = tags.includes(iri)
            ? tags.filter((t) => t !== iri)
            : [...tags, iri];
    };

    const recs = useRecommendations();

    /**
     * §6.2: "capturing at a recommended place or event marks that
     * recommendation fulfilled". After the memory is saved, not before — a
     * recommendation must never be marked as visited by a memory that failed
     * to write.
     *
     * Only identified places count. A dropped pin cannot fulfil anything,
     * because nothing can point at it (§1.3) — including a recommendation.
     * Editing counts as much as capturing: adding the place a week later is
     * the same claim about having been there.
     */
    async function fulfil(doc: string) {
        const referents = locations
            .filter((l) => l.kind === "place")
            .map((l) => l.iri);
        if (!referents.length) return;
        try {
            await fulfilRecommendations(recs.all, referents, doc);
        } catch (e) {
            // The memory is saved; a missed mark is worth a line in the console
            // and nothing more. Losing what was written would not be.
            console.error("fulfilment", e);
        }
    }

    async function save() {
        saving = true;
        error = "";
        try {
            const fields = {
                startDate: start,
                endDate: end,
                name: name.trim() || undefined,
                description: description.trim() || undefined,
                text: text.trim() || undefined,
                tags,
                media,
                // Plain objects on the way out: the drafts are $state proxies,
                // and a proxy is not something to hand to a query builder.
                locations: locations.map((l) => ({ ...l })),
                attendees: attendees.map((a) => ({ ...a })),
            };
            if (editedDoc) {
                await updateMemory(editedDoc, fields);
                await fulfil(editedDoc);
                router.pop();
            } else {
                const doc = await createMemory(fields);
                await fulfil(doc);
                router.pop();
                router.push({ name: "detail", params: { doc } });
            }
        } catch (e) {
            error = String(e);
            saving = false;
        }
    }
</script>

<div class="p-4 max-w-2xl mx-auto flex flex-col gap-4">
    <h1 class="text-xl font-bold">
        {editedDoc ? "Edit memory" : "New memory"}
    </h1>

    {#if editedDoc && !initialized}
        <span class="loading loading-spinner"></span>
    {:else}
        <div>
            <div class="label"><span class="label-text">When *</span></div>
            <PrecisionDatePicker value={start} onchange={(d) => (start = d)} />
        </div>

        <div>
            {#if end}
                <div class="label"><span class="label-text">Until</span></div>
                <div class="flex items-start gap-2">
                    <PrecisionDatePicker
                        value={end}
                        onchange={(d) => (end = d)}
                    />
                    <button
                        class="btn btn-ghost btn-xs"
                        onclick={() => (end = undefined)}
                    >
                        ✕
                    </button>
                </div>
            {:else}
                <button
                    class="btn btn-ghost btn-xs"
                    onclick={() => (end = { ...start })}
                >
                    + end date
                </button>
            {/if}
        </div>

        <label class="form-control">
            <div class="label"><span class="label-text">Title</span></div>
            <input
                class="input input-bordered"
                bind:value={name}
                placeholder="Optional"
            />
        </label>

        <label class="form-control">
            <div class="label"><span class="label-text">Short note</span></div>
            <input
                class="input input-bordered"
                bind:value={description}
                placeholder="One line, shown in lists"
            />
        </label>

        <label class="form-control">
            <div class="label"><span class="label-text">Narrative</span></div>
            <textarea
                class="textarea textarea-bordered min-h-32"
                bind:value={text}
                placeholder="What happened?"
            ></textarea>
        </label>

        <div class="form-control">
            <div class="label"><span class="label-text">Where</span></div>
            {#if locations.length}
                <ul class="flex flex-col gap-1 mb-2">
                    {#each locations as loc, i (i)}
                        <li class="flex items-center gap-2">
                            <span class="badge badge-ghost gap-1">
                                {loc.kind === "place" ? "📍" : "✛"}
                                {labelOf(loc)}
                            </span>
                            {#if loc.kind === "unnamed"}
                                <span class="text-xs opacity-50">
                                    kept in this memory only
                                </span>
                            {/if}
                            <button
                                class="btn btn-ghost btn-xs ml-auto"
                                aria-label="Remove this location"
                                onclick={() =>
                                    (locations = locations.filter(
                                        (_, j) => j !== i
                                    ))}
                            >
                                ✕
                            </button>
                        </li>
                    {/each}
                </ul>
            {/if}
            <button class="btn btn-sm self-start" onclick={addLocation}>
                + add a location
            </button>
        </div>

        <AttendeeMultiselect
            selected={attendees}
            {memoryDocs}
            onchange={(next) => (attendees = next)}
        />

        <TagMultiselect selected={tags} ontoggle={toggleTag} />

        <MediaPicker {span} attached={media} ontoggle={toggleMedia} />

        {#if error}
            <div class="alert alert-error text-sm">{error}</div>
        {/if}

        <div class="flex gap-2 justify-end">
            <button class="btn" onclick={() => router.pop()} disabled={saving}>
                Cancel
            </button>
            <button class="btn btn-primary" onclick={save} disabled={saving}>
                {#if saving}<span class="loading loading-spinner loading-xs"
                    ></span>{/if}
                Save
            </button>
        </div>
    {/if}
</div>
