<script lang="ts">
    // S-40 Heard about: "places and events you have been told about. Default
    // sort: happening soonest, then nearest, then most recently told. Shows who
    // told you and when, and marks expired and fulfilled items without hiding
    // them. Filter by source, tag, country, type, fulfilled, still-upcoming.
    // Hands off to S-22b for the map."
    //
    // The sort rule itself is in lib/heardAbout.ts, pure and tested; this screen
    // resolves each recommendation's referent into a span and a distance and
    // hands them over. The two absences worth naming: an event referent shows
    // its details inline rather than linking to S-34, which does not exist, and
    // the country and tag facets are not built — the four below are the ones
    // that change what you see day to day.
    import {
        useRecommendations,
        recommendationsReady,
        type Recommendation,
    } from "../lib/recommendations";
    import {
        useEvents,
        findEvent,
        eventSpan,
        type PublicEvent,
    } from "../lib/events.svelte";
    import {
        useAllPlaces,
        findPlace,
        placeLabel,
        type Place,
    } from "../lib/places";
    import {
        useAllPeople,
        findPerson,
        personLabel,
        personKey,
    } from "../lib/people";
    import { sortHeardAbout, urgencyOf, type Urgency } from "../lib/heardAbout";
    import { useHere, km, formatKm } from "../lib/here.svelte";
    import { formatPrecisionDate, interval } from "../lib/dates";
    import { browse } from "../lib/browse.svelte";
    import { router } from "../lib/router.svelte";

    const recs = useRecommendations();
    const events = useEvents();
    const places = useAllPlaces();
    const people = useAllPeople();
    const where = useHere();

    let ready = $state(false);
    recommendationsReady().then(() => (ready = true));

    type Kind = "all" | "place" | "event";
    let kind = $state<Kind>("all");
    let upcomingOnly = $state(false);
    let unfulfilledOnly = $state(false);
    let toldBy = $state("");

    interface Row {
        rec: Recommendation;
        event?: PublicEvent;
        /** The place it happens at: the referent, or the event's location. */
        place?: Place;
        label: string;
        span?: ReturnType<typeof eventSpan>;
        distanceKm?: number;
        toldMs?: number;
        urgency: Urgency;
    }

    const rows = $derived.by((): Row[] => {
        const now = Date.now();
        const out = recs.all.map((rec) => {
            const event = findEvent(events.all, rec.item);
            const placeIri = event ? event.location : rec.item;
            const place = placeIri
                ? findPlace(places.all, placeIri)
                : undefined;
            const span = event ? eventSpan(event) : undefined;
            const distanceKm =
                where.position &&
                place?.lat !== undefined &&
                place.lon !== undefined
                    ? km(where.position, { lat: place.lat, lon: place.lon })
                    : undefined;
            return {
                rec,
                event,
                place,
                label: event
                    ? (event.name ?? "an event")
                    : placeLabel(place, rec.item),
                span,
                distanceKm,
                toldMs: rec.told ? interval(rec.told).earliest : undefined,
                urgency: urgencyOf({ span }, now),
            };
        });
        return sortHeardAbout(out, now);
    });

    /** Who has ever told the user anything — the source facet's options. */
    const sources = $derived.by(() => {
        const seen = new Map<string, string>();
        for (const r of recs.all) {
            if (r.attributedTo)
                seen.set(
                    r.attributedTo,
                    personLabel(
                        findPerson(people.all, r.attributedTo),
                        r.attributedTo
                    )
                );
            else if (r.source?.trim()) seen.set(r.source.trim(), r.source.trim());
        }
        return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
    });

    const shown = $derived(
        rows.filter((r) => {
            if (kind === "event" && !r.event) return false;
            if (kind === "place" && r.event) return false;
            if (upcomingOnly && r.urgency === "past") return false;
            if (unfulfilledOnly && r.rec.fulfilledBy) return false;
            if (toldBy && (r.rec.attributedTo ?? r.rec.source?.trim()) !== toldBy)
                return false;
            return true;
        })
    );

    const filtered = $derived(
        kind !== "all" || upcomingOnly || unfulfilledOnly || !!toldBy
    );

    function clearFilters() {
        kind = "all";
        upcomingOnly = false;
        unfulfilledOnly = false;
        toldBy = "";
    }

    const BADGE: Record<Urgency, { text: string; cls: string } | undefined> = {
        live: { text: "happening now", cls: "badge-success" },
        upcoming: { text: "coming up", cls: "badge-info" },
        // §8: expired is marked, never hidden or deleted.
        past: { text: "expired", cls: "badge-ghost" },
        undated: undefined,
    };

    function whoTold(r: Recommendation): string | undefined {
        if (r.attributedTo)
            return personLabel(
                findPerson(people.all, r.attributedTo),
                r.attributedTo
            );
        return r.source?.trim() || undefined;
    }

    /** S-61 is keyed by the person key, not by the IRI (see lib/people.ts). */
    function openPerson(r: Recommendation) {
        const iri = r.attributedTo!;
        router.push({
            name: "person",
            params: { key: personKey(findPerson(people.all, iri), iri) },
        });
    }

    const add = () => router.push({ name: "recommendation" });
    const edit = (r: Recommendation) =>
        router.push({ name: "recommendation", params: { id: r.id } });

    /** §6.3: S-40 → S-22b. The map draws it; this only sets the facet. */
    function showOnMap(place: Place) {
        browse.facets.place = place.id;
        router.replaceRoot({
            name: "browse",
            params: { projection: "space" },
        });
    }
</script>

<div class="p-4 max-w-2xl mx-auto flex flex-col gap-3">
    <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold">Heard about</h1>
        <button class="btn btn-primary btn-sm" onclick={add}>
            Add something
        </button>
    </div>

    {#if !ready}
        <div class="flex items-center gap-2 text-sm opacity-70">
            <span class="loading loading-bars loading-xs"></span>
            reading what you were told…
        </div>
    {/if}

    {#if rows.length}
        <div class="flex flex-wrap gap-2 items-center text-sm">
            <div role="tablist" class="tabs tabs-box tabs-xs">
                {#each [["all", "Everything"], ["place", "Places"], ["event", "Events"]] as [k, label] (k)}
                    <button
                        role="tab"
                        class="tab"
                        class:tab-active={kind === k}
                        onclick={() => (kind = k as Kind)}
                    >
                        {label}
                    </button>
                {/each}
            </div>
            <label class="label cursor-pointer gap-1 py-0">
                <input
                    type="checkbox"
                    class="checkbox checkbox-xs"
                    bind:checked={upcomingOnly}
                />
                <span class="label-text text-xs">still to come</span>
            </label>
            <label class="label cursor-pointer gap-1 py-0">
                <input
                    type="checkbox"
                    class="checkbox checkbox-xs"
                    bind:checked={unfulfilledOnly}
                />
                <span class="label-text text-xs">not been yet</span>
            </label>
            {#if sources.length > 1}
                <select
                    class="select select-bordered select-xs"
                    aria-label="Told by"
                    bind:value={toldBy}
                >
                    <option value="">anyone</option>
                    {#each sources as [key, label] (key)}
                        <option value={key}>{label}</option>
                    {/each}
                </select>
            {/if}
            {#if filtered}
                <button class="btn btn-ghost btn-xs" onclick={clearFilters}>
                    clear
                </button>
            {/if}
        </div>
    {/if}

    {#if shown.length}
        <ul class="flex flex-col gap-2">
            {#each shown as row (row.rec.id)}
                <li class="bg-base-200 rounded-box p-3 flex flex-col gap-1">
                    <div class="flex items-start justify-between gap-2">
                        <button
                            class="text-left flex-1"
                            onclick={() => edit(row.rec)}
                        >
                            <span class="font-medium">
                                {row.event ? "📅" : "📍"}
                                {row.label}
                            </span>
                        </button>
                        {#if BADGE[row.urgency]}
                            <span class="badge {BADGE[row.urgency]!.cls}">
                                {BADGE[row.urgency]!.text}
                            </span>
                        {/if}
                    </div>

                    {#if row.event?.start}
                        <!-- Inline rather than a link: S-34 does not exist, and
                             a row that opens into nothing is worse than one
                             that says what it knows. -->
                        <span class="text-xs opacity-70">
                            {formatPrecisionDate(row.event.start)}
                            {#if row.event.end}
                                – {formatPrecisionDate(row.event.end)}
                            {/if}
                        </span>
                    {/if}

                    <div class="text-xs opacity-70 flex flex-wrap gap-x-2">
                        {#if whoTold(row.rec)}
                            <span>
                                {#if row.rec.attributedTo}
                                    <button
                                        class="link link-hover"
                                        onclick={() => openPerson(row.rec)}
                                    >
                                        {whoTold(row.rec)}
                                    </button>
                                {:else}
                                    {whoTold(row.rec)}
                                {/if}
                                told you
                            </span>
                        {/if}
                        {#if row.rec.told}
                            <span>{formatPrecisionDate(row.rec.told)}</span>
                        {/if}
                        {#if row.distanceKm !== undefined}
                            <span>{formatKm(row.distanceKm)} away</span>
                        {/if}
                    </div>

                    {#if row.rec.note}
                        <p class="text-sm">{row.rec.note}</p>
                    {/if}

                    <div class="flex flex-wrap gap-2 mt-1">
                        {#if row.place && row.event}
                            <!-- The event's place is still a place: §6.3's
                                 S-40 → S-31 hop, reached through where it is. -->
                            <button
                                class="btn btn-ghost btn-xs"
                                onclick={() =>
                                    router.push({
                                        name: "place",
                                        params: { iri: row.place!.id },
                                    })}
                            >
                                at {placeLabel(row.place, row.place.id)}
                            </button>
                        {:else if row.place}
                            <button
                                class="btn btn-ghost btn-xs"
                                onclick={() =>
                                    router.push({
                                        name: "place",
                                        params: { iri: row.place!.id },
                                    })}
                            >
                                about this place
                            </button>
                        {/if}
                        {#if row.place?.lat !== undefined}
                            <button
                                class="btn btn-ghost btn-xs"
                                onclick={() => showOnMap(row.place!)}
                            >
                                show on the map
                            </button>
                        {/if}
                        {#if row.rec.fulfilledBy}
                            <button
                                class="btn btn-ghost btn-xs"
                                onclick={() =>
                                    router.push({
                                        name: "detail",
                                        params: { doc: row.rec.fulfilledBy! },
                                    })}
                            >
                                ✓ you went — open the memory
                            </button>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {:else if ready && filtered}
        <!-- §8: an empty result names what to drop, rather than looking like
             an empty archive. -->
        <div class="alert">
            <span>
                Nothing matches these filters. {rows.length}
                {rows.length === 1 ? "thing" : "things"} you were told about are
                hidden by them.
            </span>
            <button class="btn btn-sm" onclick={clearFilters}>Show all</button>
        </div>
    {:else if ready}
        <!-- §8's first-run empty: distinct from an ordinary empty result, and
             it explains what the screen is for rather than reporting nothing. -->
        <div class="text-center py-10 flex flex-col items-center gap-3">
            <p class="opacity-70 max-w-sm">
                Nothing yet. This is where what other people tell you goes — a
                bar someone swore by, a festival worth planning around — so that
                it is still here when you are finally in that city.
            </p>
            <button class="btn btn-primary" onclick={add}>
                Add the first one
            </button>
        </div>
    {/if}

    {#if where.refused && rows.length}
        <p class="text-xs opacity-60">
            Without your location these are ordered by when they happen alone,
            not by how far away they are.
        </p>
    {/if}
</div>
