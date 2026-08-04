<script lang="ts">
    // S-61 Person detail: someone, and every memory they appear in. §6.2 calls
    // this the app's clearest on-ramp to the community phase, and it has to be
    // fully useful with zero sharing — so everything here is derived from the
    // user's own archive and nothing waits on a network.
    //
    // A bare name gets the same screen as a contact, with promotion offered
    // rather than demanded (§3.3).
    import { useShape } from "@ng-org/orm/svelte";
    import { OrmSubscription, normalizeScope } from "@ng-org/orm";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import type { Memory } from "../shapes/orm/memoryShape.typings";
    import {
        useAllPeople,
        groupPeople,
        bareOccurrences,
        promoteBareName,
    } from "../lib/people";
    import { useAllPlaces, findPlace, placeLabel } from "../lib/places";
    import { browse } from "../lib/browse.svelte";
    import {
        parsePrecisionDate,
        formatPrecisionDate,
        memoryInterval,
        compareRecent,
    } from "../lib/dates";
    import { router } from "../lib/router.svelte";
    import TagChips from "../components/TagChips.svelte";
    import type { Projection } from "../lib/browseFilter";

    const key = router.current.params!.key;

    const memories = useShape(MemoryShapeType, "did:ng:i");
    const people = useAllPeople();
    const places = useAllPlaces();

    let ready = $state(false);
    OrmSubscription.getOrCreate(
        MemoryShapeType,
        normalizeScope("did:ng:i")
    ).readyPromise.then(() => (ready = true));

    let promoting = $state(false);
    let error = $state("");

    const all = $derived([...memories] as unknown as Memory[]);
    const memoryDocs = $derived(new Set(all.map((m) => m["@graph"])));
    const attendeeLists = $derived(
        all.map((m) => ({
            doc: m["@graph"],
            attendees: [...(m.attendee ?? [])],
        }))
    );
    const group = $derived(
        groupPeople(people.all, attendeeLists, memoryDocs).find(
            (g) => g.key === key
        )
    );

    /** Their memories, oldest first — the shape of a shared history. */
    const theirs = $derived.by(() => {
        if (!group) return [];
        const docs = new Set(group.memories);
        return all
            .filter((m) => docs.has(m["@graph"]))
            .flatMap((m) => {
                const start = parsePrecisionDate(m.startDate);
                if (!start) return [];
                const end = parsePrecisionDate(m.endDate ?? undefined);
                return [{ m, start, span: memoryInterval(start, end) }];
            })
            // Newest first, like the archive itself (§3.1).
            .sort((a, b) => compareRecent(a.span, b.span));
    });

    /** Places you have both been — §6.2's "shared places". */
    const sharedPlaces = $derived.by(() => {
        const seen = new Map<string, number>();
        for (const { m } of theirs)
            for (const iri of m.location ?? [])
                seen.set(iri, (seen.get(iri) ?? 0) + 1);
        return [...seen.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([iri, n]) => ({
                iri,
                n,
                label: placeLabel(findPlace(places.all, iri), iri),
            }));
    });

    /** Tags in common: what the two of you keep doing. */
    const sharedTags = $derived.by(() => {
        const seen = new Map<string, number>();
        for (const { m } of theirs)
            for (const t of m.subject ?? [])
                seen.set(t, (seen.get(t) ?? 0) + 1);
        return [...seen.entries()]
            .filter(([, n]) => n > 1)
            .sort((a, b) => b[1] - a[1])
            .map(([iri]) => iri);
    });

    const occurrences = $derived(
        group
            ? bareOccurrences(group.key, people.all, attendeeLists, memoryDocs)
            : []
    );

    /** Their memories, in whichever projection — §6.2's buttons. */
    function showIn(projection: Projection) {
        browse.clear();
        browse.facets.person = key;
        router.replaceRoot({ name: "browse", params: { projection } });
    }

    async function promote() {
        if (!group) return;
        promoting = true;
        error = "";
        try {
            await promoteBareName(group.name, occurrences);
        } catch (e) {
            error = String(e);
        } finally {
            promoting = false;
        }
    }
</script>

<div class="p-4 max-w-2xl mx-auto flex flex-col gap-3">
    <button class="btn btn-ghost btn-sm self-start" onclick={() => router.pop()}>
        ← back
    </button>

    {#if group}
        <h1 class="text-2xl font-bold">
            {group.contact ? "👤 " : ""}{group.name}
        </h1>
        <p class="opacity-70">
            {theirs.length}
            {theirs.length === 1 ? "memory" : "memories"}
            {#if theirs.length > 1}
                · {formatPrecisionDate(theirs[0].start)} → {formatPrecisionDate(
                    theirs[theirs.length - 1].start
                )}
            {/if}
        </p>

        {#if !group.contact}
            <div class="alert text-sm">
                <span>
                    A name you typed, with no record behind it. Making it
                    someone you know updates
                    {occurrences.length}
                    {occurrences.length === 1 ? "memory" : "memories"} at once.
                </span>
                <button
                    class="btn btn-sm"
                    disabled={promoting}
                    onclick={promote}
                >
                    {#if promoting}
                        <span class="loading loading-spinner loading-xs"></span>
                    {/if}
                    someone I know
                </button>
            </div>
        {/if}
        {#if error}
            <div class="alert alert-error text-sm">{error}</div>
        {/if}

        {#if theirs.length}
            <div class="flex flex-wrap gap-2">
                <button class="btn btn-sm" onclick={() => showIn("time")}>
                    In time
                </button>
                <button class="btn btn-sm" onclick={() => showIn("space")}>
                    In space
                </button>
                <button class="btn btn-sm" onclick={() => showIn("media")}>
                    Their photographs
                </button>
            </div>
        {/if}

        {#if sharedPlaces.length}
            <div>
                <h2 class="text-sm font-semibold opacity-70">Where</h2>
                <ul class="text-sm">
                    {#each sharedPlaces.slice(0, 6) as p (p.iri)}
                        <li>
                            {p.label}
                            <span class="opacity-50">× {p.n}</span>
                        </li>
                    {/each}
                </ul>
            </div>
        {/if}

        {#if sharedTags.length}
            <div>
                <h2 class="text-sm font-semibold opacity-70 mb-1">In common</h2>
                <div class="flex gap-1 flex-wrap">
                    <TagChips iris={new Set(sharedTags)} />
                </div>
            </div>
        {/if}

        <h2 class="text-sm font-semibold opacity-70 mt-2">Together</h2>
        <ul>
            {#each theirs as t (t.m["@graph"])}
                <li>
                    <button
                        class="w-full text-left py-2 px-1 hover:bg-base-200 rounded flex flex-col"
                        onclick={() =>
                            router.push({
                                name: "detail",
                                params: { doc: t.m["@graph"] },
                            })}
                    >
                        <span class="font-medium">
                            {t.m.name ?? formatPrecisionDate(t.start)}
                        </span>
                        <span class="text-xs opacity-60">
                            {formatPrecisionDate(t.start)}
                        </span>
                    </button>
                </li>
            {/each}
        </ul>
    {:else if !ready}
        <span class="loading loading-spinner"></span>
    {:else}
        <!-- S-80 inline: promoted away, deleted, or not synced here yet. -->
        <div class="alert">
            <span>
                Nobody here — this person may have been renamed, or their
                record may not have synced to this device yet.
            </span>
        </div>
    {/if}
</div>
