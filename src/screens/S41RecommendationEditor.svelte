<script lang="ts">
    // S-41 Recommendation editor: "referent via S-32 (place) or event search,
    // source (contact, URL, or free text), date told, event dates if the
    // referent is a new event, tags, note."
    //
    // Everything but one clause of that. Minting a NEW event is deliberately
    // absent: it needs S-34 to open into, and an event you can create but never
    // open is worse than one you cannot create. So a recommendation points at a
    // place, or at an event the store already holds — which is enough for
    // urgency and expiry (§4.2) to be real rather than notional.
    //
    // The form is provenance-first, like the record it writes (§4.1): what you
    // were told about, then who told you, then when. "I plan to go here" is not
    // one of the fields, on purpose.
    import { router } from "../lib/router.svelte";
    import {
        useRecommendations,
        findRecommendation,
        addRecommendation,
        updateRecommendation,
        removeRecommendation,
        type RecommendationFields,
    } from "../lib/recommendations";
    import { useEvents, findEvent } from "../lib/events.svelte";
    import {
        useAllPlaces,
        findPlace,
        placeLabel,
        isIdentified,
        createPlace,
        type LocationDraft,
    } from "../lib/places";
    import { useAllPeople, personLabel, findPerson } from "../lib/people";
    import { formatPrecisionDate, today, type PrecisionDate } from "../lib/dates";
    import PrecisionDatePicker from "../components/PrecisionDatePicker.svelte";
    import TagMultiselect from "../components/TagMultiselect.svelte";

    const params = router.current.params ?? {};
    /** Editing an existing one, or writing a new one. */
    const editing = params.id;

    const recs = useRecommendations();
    const events = useEvents();
    const places = useAllPlaces();
    const people = useAllPeople();

    // The referent may be handed in (from S-31's "add a recommendation"), read
    // from the record being edited, or picked here.
    let item = $state(params.item ?? "");
    let attributedTo = $state<string | undefined>();
    let source = $state("");
    let told = $state<PrecisionDate | undefined>();
    let note = $state("");
    let tags = $state<string[]>([]);
    let saving = $state(false);
    /** A place is being minted out of a pin the picker just handed back. */
    let minting = $state(false);
    let error = $state("");

    // Load once, when the record arrives: the subscription may deliver after
    // this screen mounts, and re-running would discard what has been typed.
    let loaded = $state(false);
    $effect(() => {
        if (loaded || !editing) return;
        const r = findRecommendation(recs.all, editing);
        if (!r) return;
        item = r.item;
        attributedTo = r.attributedTo;
        source = r.source ?? "";
        told = r.told;
        note = r.note ?? "";
        tags = [...r.tags];
        loaded = true;
    });

    const asEvent = $derived(item ? findEvent(events.all, item) : undefined);
    const asPlace = $derived(item ? findPlace(places.all, item) : undefined);

    /** What the referent is called, whichever kind it turns out to be. */
    const referentLabel = $derived.by(() => {
        if (!item) return "";
        if (asEvent) return asEvent.name ?? "an event";
        return placeLabel(asPlace, item);
    });

    /** Events worth offering: named, and not already this one. */
    const eventChoices = $derived(
        events.all
            .filter((e) => e.name)
            .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    );

    const contacts = $derived(
        people.all
            .filter((p) => p.name && isIdentified(p.id))
            .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    );

    function pickPlace() {
        router.push({
            name: "placepicker",
            // The picker asks for a name with the pin here, because a pin that
            // has one is the referent rather than a refusal.
            params: { named: "1" },
            onReturn: async (value) => {
                const loc = value as LocationDraft | undefined;
                if (!loc) return;
                if (loc.kind === "place") {
                    item = loc.iri;
                    return;
                }
                // A pin is a subject inside one memory's document, and §1.3 is
                // explicit that what is referenced from elsewhere gets identity
                // of its own. A recommendation is a reference from elsewhere,
                // so the pin is minted into a place — the same thing S-33's
                // promotion does, for a location that was never in a memory.
                const name = loc.name?.trim();
                if (!name) {
                    error =
                        "A recommendation needs a place with a name — an unnamed pin belongs to one memory only.";
                    return;
                }
                minting = true;
                error = "";
                try {
                    item = await createPlace({
                        name,
                        lat: loc.lat,
                        lon: loc.lon,
                    });
                } catch (e) {
                    error = String(e);
                } finally {
                    minting = false;
                }
            },
        });
    }

    const fields = (): RecommendationFields => ({
        item,
        attributedTo,
        // One or the other: naming a contact and typing a source would record
        // two answers to one question.
        source: attributedTo ? undefined : source,
        told,
        note,
        tags,
    });

    async function save() {
        if (!item) {
            error = "Choose what you were told about first.";
            return;
        }
        saving = true;
        error = "";
        try {
            if (editing) await updateRecommendation(editing, fields());
            else await addRecommendation(fields());
            router.pop(true);
        } catch (e) {
            error = String(e);
            saving = false;
        }
    }

    async function remove() {
        if (!editing) return;
        saving = true;
        try {
            await removeRecommendation(editing);
            router.pop(true);
        } catch (e) {
            error = String(e);
            saving = false;
        }
    }
</script>

<div class="p-4 max-w-2xl mx-auto flex flex-col gap-4">
    <div class="flex items-center justify-between">
        <button class="btn btn-ghost btn-sm" onclick={() => router.pop()}>
            ← cancel
        </button>
        <h1 class="text-lg font-bold">
            {editing ? "Edit what you heard" : "Something you heard about"}
        </h1>
        <button
            class="btn btn-primary btn-sm"
            disabled={saving}
            onclick={save}
        >
            Save
        </button>
    </div>

    {#if error}
        <div class="alert alert-warning text-sm">{error}</div>
    {/if}

    <div class="form-control">
        <span class="label-text text-sm opacity-70">What about</span>
        {#if item}
            <div class="flex items-center gap-2 mt-1">
                <span class="badge badge-lg">
                    {asEvent ? "📅" : "📍"}
                    {referentLabel}
                </span>
                <button class="btn btn-ghost btn-xs" onclick={() => (item = "")}>
                    change
                </button>
            </div>
            {#if asEvent?.start}
                <span class="text-xs opacity-60 mt-1">
                    {formatPrecisionDate(asEvent.start)}
                    {#if asEvent.end}– {formatPrecisionDate(asEvent.end)}{/if}
                </span>
            {/if}
        {:else if minting}
            <div class="flex items-center gap-2 mt-1 text-sm opacity-70">
                <span class="loading loading-spinner loading-xs"></span>
                Making a place of that pin…
            </div>
        {:else}
            <div class="flex flex-wrap gap-2 items-center mt-1">
                <button class="btn btn-sm" onclick={pickPlace}>
                    Pick a place
                </button>
                {#if eventChoices.length}
                    <span class="text-xs opacity-60">or an event</span>
                    <select
                        class="select select-bordered select-sm"
                        aria-label="An event"
                        onchange={(e) =>
                            (item = (e.target as HTMLSelectElement).value)}
                    >
                        <option value="">choose…</option>
                        {#each eventChoices as e (e.id)}
                            <option value={e.id}>{e.name}</option>
                        {/each}
                    </select>
                {/if}
            </div>
        {/if}
    </div>

    <div class="form-control">
        <span class="label-text text-sm opacity-70">Who told you</span>
        <div class="flex flex-wrap gap-2 items-center mt-1">
            {#if contacts.length}
                <select
                    class="select select-bordered select-sm"
                    aria-label="Who told you"
                    value={attributedTo ?? ""}
                    onchange={(e) => {
                        const v = (e.target as HTMLSelectElement).value;
                        attributedTo = v || undefined;
                    }}
                >
                    <option value="">somebody else…</option>
                    {#each contacts as c (c.id)}
                        <option value={c.id}>{c.name}</option>
                    {/each}
                </select>
            {/if}
            {#if !attributedTo}
                <input
                    class="input input-bordered input-sm flex-1 min-w-48"
                    placeholder="a name, a website, a guidebook"
                    aria-label="Source"
                    bind:value={source}
                />
            {/if}
        </div>
    </div>

    <div class="form-control">
        <span class="label-text text-sm opacity-70">When you were told</span>
        {#if told}
            <div class="flex items-start gap-2 mt-1">
                <PrecisionDatePicker
                    value={told}
                    onchange={(d) => (told = d)}
                />
                <button
                    class="btn btn-ghost btn-xs"
                    onclick={() => (told = undefined)}
                >
                    clear
                </button>
            </div>
        {:else}
            <!-- Optional, and left out by default: "Ana mentioned this at some
                 point" is a complete record (§1.1, imprecision is data). -->
            <button
                class="btn btn-sm self-start mt-1"
                onclick={() => (told = today())}
            >
                Add a date
            </button>
        {/if}
    </div>

    <label class="form-control">
        <span class="label-text text-sm opacity-70">What they said</span>
        <textarea
            class="textarea textarea-bordered mt-1"
            rows="3"
            placeholder="go on a weekday, ask for the back room"
            bind:value={note}
        ></textarea>
    </label>

    <div class="flex items-center gap-2">
        <TagMultiselect
            selected={tags}
            ontoggle={(iri) =>
                (tags = tags.includes(iri)
                    ? tags.filter((t) => t !== iri)
                    : [...tags, iri])}
        />
        {#if tags.length}
            <span class="text-xs opacity-60">{tags.length} tagged</span>
        {/if}
    </div>

    {#if editing}
        <div class="border-t pt-3">
            <button class="btn btn-error btn-sm btn-outline" onclick={remove}>
                Forget this recommendation
            </button>
            <!-- §4.2 forbids the app deleting an expired one on its own
                 initiative. This is the user asking, which is different. -->
            <p class="text-xs opacity-60 mt-1">
                Expired recommendations are kept, not deleted — this removes it
                because you asked.
            </p>
        </div>
    {/if}

    {#if attributedTo && findPerson(people.all, attributedTo)}
        <p class="text-xs opacity-60">
            Recorded as told by {personLabel(
                findPerson(people.all, attributedTo),
                attributedTo
            )}.
        </p>
    {/if}
</div>
