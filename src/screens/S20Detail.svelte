<script lang="ts">
    // S-20 Memory detail: title or date as heading; date at stored precision.
    import { useShape } from "@ng-org/orm/svelte";
    import { OrmSubscription, normalizeScope } from "@ng-org/orm";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import type { Memory } from "../shapes/orm/memoryShape.typings";
    import {
        parsePrecisionDate,
        formatPrecisionDate,
        memoryInterval,
    } from "../lib/dates";
    import { useReservations, overlapping } from "../lib/reservations.svelte";
    import { useTracks, tracksDuring } from "../lib/tracks.svelte";
    import ReservationCard from "../components/ReservationCard.svelte";
    import { deleteMemory } from "../lib/memories";
    import {
        useAllPlaces,
        findPlace,
        placeLabel,
        formatCoords,
        isIdentified,
    } from "../lib/places";
    import {
        useAllPeople,
        findPerson,
        personKey,
        personLabel,
        isBareName,
    } from "../lib/people";
    import { router } from "../lib/router.svelte";
    import TagChips from "../components/TagChips.svelte";
    import MediaStrip from "../components/MediaStrip.svelte";

    const doc = router.current.params!.doc;
    const memories = useShape(MemoryShapeType, "did:ng:i");
    const places = useAllPlaces();
    const people = useAllPeople();
    const memoryDocs = $derived(
        new Set([...memories].map((m) => m["@graph"] as string))
    );

    let ready = $state(false);
    OrmSubscription.getOrCreate(
        MemoryShapeType,
        normalizeScope("did:ng:i")
    ).readyPromise.then(() => (ready = true));

    const memory = $derived([...memories].find((m) => m["@graph"] === doc));
    const start = $derived(
        memory ? parsePrecisionDate(memory.startDate) : undefined
    );
    const end = $derived(
        memory ? parsePrecisionDate(memory.endDate ?? undefined) : undefined
    );

    /**
     * The locations this memory claims, resolved through the IRI join (§3.2).
     * An identified place opens S-31, an unnamed one S-33 — neither is built,
     * so both say so rather than being flattened into inert text.
     */
    const locations = $derived(
        [...(memory?.location ?? [])].map((iri) => ({
            iri,
            place: findPlace(places.all, iri),
            identified: isIdentified(iri),
        }))
    );

    /**
     * Who this memory names (§3.3). Both kinds open S-61 — a contact to see
     * everywhere they appear, a bare name to the same screen, which is where
     * promotion is offered rather than demanded (§6.2).
     */
    const attendees = $derived(
        [...(memory?.attendee ?? [])].map((iri) => {
            const p = findPerson(people.all, iri);
            return {
                iri,
                key: personKey(p, iri),
                label: personLabel(p, iri),
                bare: !!p && isBareName(p, memoryDocs),
            };
        })
    );

    /**
     * Foreign evidence claimed by time (§5): reservations and tracks whose
     * span overlaps this memory's. Neither is edited and neither is stored on
     * the memory — the overlap is recomputed, the way §3.4 already derives a
     * memory's photographs. Conditional, so a store with none of this shows
     * nothing rather than an empty heading.
     */
    const reservations = useReservations();
    const tracks = useTracks();
    const span = $derived(start ? memoryInterval(start, end) : undefined);
    const bookings = $derived(
        span ? overlapping(reservations.all, span) : []
    );
    const traces = $derived(span ? tracksDuring(tracks.all, span) : []);

    // Date as well as time: a memory may span a year, and "10:15" alone
    // would say nothing about which morning.
    const clock = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    });

    let confirming = $state(false);
    let deleting = $state(false);

    async function doDelete() {
        deleting = true;
        try {
            await deleteMemory(doc);
            router.replaceRoot({ name: "browse" });
        } catch (e) {
            deleting = false;
            confirming = false;
            console.error(e);
        }
    }
</script>

<div class="p-4 max-w-2xl mx-auto flex flex-col gap-3">
    <button class="btn btn-ghost btn-sm self-start" onclick={() => router.pop()}>
        ← back
    </button>

    {#if memory && start}
        <h1 class="text-2xl font-bold">
            {memory.name ?? formatPrecisionDate(start)}
        </h1>
        <div class="opacity-70">
            {formatPrecisionDate(start)}{end
                ? ` → ${formatPrecisionDate(end)}`
                : ""}
        </div>

        {#if locations.length}
            <ul class="flex flex-col gap-1">
                {#each locations as loc (loc.iri)}
                    <li>
                        <button
                            class="link link-hover text-left"
                            onclick={() =>
                                router.push({
                                    name: "stub",
                                    params: {
                                        label: loc.identified
                                            ? "Place detail (S-31)"
                                            : "Unnamed place editor (S-33)",
                                    },
                                })}
                        >
                            {loc.identified ? "📍" : "✛"}
                            {placeLabel(loc.place, loc.iri)}
                            {#if loc.place?.name && loc.place.lat !== undefined && loc.place.lon !== undefined}
                                <span class="text-xs opacity-50">
                                    {formatCoords(loc.place.lat, loc.place.lon)}
                                </span>
                            {/if}
                        </button>
                    </li>
                {/each}
            </ul>
        {/if}

        {#if attendees.length}
            <div class="flex gap-1 flex-wrap items-center">
                {#each attendees as a (a.iri)}
                    <button
                        class="badge badge-ghost gap-1 hover:badge-neutral"
                        onclick={() =>
                            router.push({
                                name: "person",
                                params: { key: a.key },
                            })}
                    >
                        {a.bare ? "✎" : "👤"}
                        {a.label}
                    </button>
                {/each}
            </div>
        {/if}

        {#if memory.subject?.size}
            <div class="flex gap-1 flex-wrap">
                <TagChips iris={memory.subject} />
            </div>
        {/if}

        {#if memory.description}
            <p class="italic opacity-80">{memory.description}</p>
        {/if}

        {#if memory.text}
            <p class="whitespace-pre-wrap">{memory.text}</p>
        {/if}

        <MediaStrip memory={memory as unknown as Memory} />

        {#if bookings.length}
            <div class="flex flex-col gap-1">
                <h2 class="text-xs font-semibold opacity-60">
                    Booked around this
                </h2>
                {#each bookings as r (r.id)}
                    <ReservationCard {r} compact />
                {/each}
            </div>
        {/if}

        {#if traces.length}
            <div class="flex flex-col gap-1">
                <h2 class="text-xs font-semibold opacity-60">
                    Recorded at the same time
                </h2>
                {#each traces as t (t.id)}
                    <div class="text-xs flex items-baseline gap-2">
                        <span style="color:#e05a2b">—</span>
                        <span class="font-medium">{t.name ?? "a track"}</span>
                        {#if t.startMs !== undefined}
                            <span class="opacity-60">
                                {clock.format(t.startMs)}{t.endMs
                                    ? ` – ${new Date(t.endMs).toLocaleTimeString(undefined, { timeStyle: "short" })}`
                                    : ""}
                            </span>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}

        <div class="flex gap-2 mt-4">
            <button
                class="btn btn-sm"
                onclick={() =>
                    router.push({ name: "editor", params: { doc } })}
            >
                Edit
            </button>
            {#if confirming}
                <button
                    class="btn btn-sm btn-error"
                    disabled={deleting}
                    onclick={doDelete}
                >
                    Really delete
                </button>
                <button
                    class="btn btn-sm"
                    disabled={deleting}
                    onclick={() => (confirming = false)}
                >
                    Keep
                </button>
            {:else}
                <button
                    class="btn btn-sm btn-outline btn-error"
                    onclick={() => (confirming = true)}
                >
                    Delete
                </button>
            {/if}
        </div>
    {:else if !ready}
        <span class="loading loading-spinner"></span>
    {:else}
        <!-- S-80 flavored inline state: deleted or not yet synced. -->
        <div class="alert">
            <span>
                This memory is unavailable — it may have been deleted, or not
                synced to this device yet.
            </span>
        </div>
    {/if}
</div>
