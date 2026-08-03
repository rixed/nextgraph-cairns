<script lang="ts">
    // S-22 Browse: the shell. Filter bar, projection switcher, selection mode
    // and the bulk actions of §4.4 — everything the three projections share and
    // none of them owns. The projections themselves are components here, not
    // routes, which is what lets the filter and the selection outlive a switch.
    //
    // Facets built: date range (precision-aware), tags (any/all), place
    // (transitively through schema:containedInPlace), who was there, has
    // media. §6.2 also lists public event and depth; nothing in the app writes
    // or reads those yet, and a facet that cannot narrow anything is worse
    // than a facet that is not there.
    //
    // The person facet matches on the *person*, not the reference: two
    // memories that each typed "Ana" are both hers before anything has been
    // promoted (§3.3), which is what makes promotion an act of tidying rather
    // than a prerequisite for finding anyone.
    //
    // Deferred: "reattach media" from §4.4, which needs a memory picker, and
    // the grouping suggestions of S-22a.
    import { useShape } from "@ng-org/orm/svelte";
    import { OrmSubscription, normalizeScope } from "@ng-org/orm";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import type { Memory } from "../shapes/orm/memoryShape.typings";
    import { useAllMedia } from "../lib/mediaFeed.svelte";
    import { useAllPlaces, isIdentified } from "../lib/places";
    import { useAllPeople, isBareName, groupPeople } from "../lib/people";
    import { isMediaSuppressed } from "../lib/rejections.svelte";
    import {
        browse,
        matches,
        blame,
        mediaOf,
        FACET_LABELS,
        type MatchContext,
        type Projection,
    } from "../lib/browse.svelte";
    import {
        parsePrecisionDate,
        formatPrecisionDate,
        dayOf,
        compareIntervals,
        memoryInterval,
        type PrecisionDate,
    } from "../lib/dates";
    import { addTags, removeTags, deleteMemory } from "../lib/memories";
    import { takenAtMs } from "../lib/media";
    import { router } from "../lib/router.svelte";
    import ProjectionSwitcher from "../components/ProjectionSwitcher.svelte";
    import PrecisionDatePicker from "../components/PrecisionDatePicker.svelte";
    import TagMultiselect from "../components/TagMultiselect.svelte";
    import S22aTime from "./S22aTime.svelte";
    import S22bSpace from "./S22bSpace.svelte";
    import S22cMedia from "./S22cMedia.svelte";

    const projection = (router.current.params?.projection ??
        "time") as Projection;

    const memories = useShape(MemoryShapeType, "did:ng:i");
    const feed = useAllMedia();
    const places = useAllPlaces();
    const people = useAllPeople();

    let ready = $state(false);
    OrmSubscription.getOrCreate(
        MemoryShapeType,
        normalizeScope("did:ng:i")
    ).readyPromise.then(() => (ready = true));

    const ctx: MatchContext = $derived({
        media: feed.all,
        places: places.all,
        people: people.all,
        isSuppressed: isMediaSuppressed,
    });
    const all = $derived([...memories] as unknown as Memory[]);
    const memoryDocs = $derived(new Set(all.map((m) => m["@graph"])));
    const filtered = $derived(all.filter((m) => matches(m, browse.facets, ctx)));

    const facets = $derived(browse.facets);
    /** Only identified places can be a facet: an unnamed one is one memory's
        own business and indexes nothing (§3.2). */
    const knownPlaces = $derived(
        places.all
            .filter((p) => isIdentified(p.id) && p.name)
            .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    );

    /** Everyone the archive names, for the person facet (§3.3). */
    const knownPeople = $derived(
        groupPeople(
            people.all,
            all.map((m) => ({
                doc: m["@graph"],
                attendees: [...(m.attendee ?? [])],
            })),
            memoryDocs
        ).filter((g) => g.memories.length)
    );

    let showFilter = $state(false);
    let tagging = $state(false);
    let bulkTags = $state<string[]>([]);
    let confirmingDelete = $state(false);
    let working = $state(false);

    // Scroll survives a projection switch, which replaces the route (§6.2).
    $effect(() => {
        const y = browse.scrollFor(projection);
        if (y) requestAnimationFrame(() => window.scrollTo(0, y));
        const onScroll = () => browse.rememberScroll(projection, window.scrollY);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    });

    const culprit = $derived(
        filtered.length === 0 && browse.active
            ? blame(all, facets, ctx)
            : undefined
    );

    // ---- selection (§4.4) ---------------------------------------------------

    const selected = $derived(browse.selected);
    const selectedMemories = $derived(
        all.filter((m) => selected.includes(m["@graph"]))
    );

    /** The tags every selected memory already carries — what "untag" offers. */
    const sharedTags = $derived.by(() => {
        if (!selectedMemories.length) return [] as string[];
        const [first, ...rest] = selectedMemories;
        return [...(first.subject ?? [])].filter((t) =>
            rest.every((m) => m.subject?.has(t))
        );
    });

    async function applyTags(remove: boolean) {
        if (!bulkTags.length) return;
        working = true;
        try {
            const docs = selectedMemories.map((m) => m["@graph"]);
            if (remove) await removeTags(docs, bulkTags);
            else await addTags(docs, bulkTags);
            bulkTags = [];
            tagging = false;
            browse.stopSelecting();
        } finally {
            working = false;
        }
    }

    async function deleteSelected() {
        working = true;
        try {
            for (const m of selectedMemories) await deleteMemory(m["@graph"]);
            confirmingDelete = false;
            browse.stopSelecting();
        } finally {
            working = false;
        }
    }

    /**
     * "Write a memory about these" (§4.4): a derived span, the tag the
     * selection already shares, and its identified places as suggestions. An
     * unnamed location is not carried over — it belongs to the memory that
     * minted it, and copying coordinates would quietly invent a second claim.
     */
    function writeAboutMemories() {
        const spans = selectedMemories
            .map((m) => {
                const s = parsePrecisionDate(m.startDate);
                return s
                    ? {
                          m,
                          s,
                          span: memoryInterval(
                              s,
                              parsePrecisionDate(m.endDate ?? undefined)
                          ),
                      }
                    : undefined;
            })
            .filter((x): x is NonNullable<typeof x> => !!x)
            .sort((a, b) => compareIntervals(a.span, b.span));
        if (!spans.length) return;
        const first = spans[0];
        const last = spans[spans.length - 1];
        const end: PrecisionDate | undefined =
            parsePrecisionDate(last.m.endDate ?? undefined) ?? last.s;
        browse.setDraft({
            startDate: first.s,
            // A one-memory selection needs no span, and a same-date one none
            // either: never invent a range that says nothing (§3.1).
            endDate: end.lexical === first.s.lexical ? undefined : end,
            tags: sharedTags,
            media: [],
            locations: [
                ...new Set(
                    selectedMemories.flatMap((m) =>
                        [...(m.location ?? [])].filter(isIdentified)
                    ),
                ),
            ].map((iri) => ({ kind: "place" as const, iri })),
            // Contacts carry over; a bare name belongs to the memory that
            // typed it, and copying the string would invent a second one.
            attendees: [
                ...new Set(
                    selectedMemories.flatMap((m) =>
                        [...(m.attendee ?? [])].filter((iri) => {
                            const p = people.all.find((x) => x.id === iri);
                            return p && !isBareName(p, memoryDocs);
                        })
                    )
                ),
            ],
        });
        browse.stopSelecting();
        router.push({ name: "editor" });
    }

    /** The same, from a selection of photographs: the span is theirs. */
    function writeAboutMedia() {
        const times = selected
            .map((doc) => feed.all.find((m) => m.doc === doc))
            .map((m) => (m ? takenAtMs(m) : undefined))
            .filter((t): t is number => t !== undefined)
            .sort((a, b) => a - b);
        const start = times.length ? dayOf(times[0]) : undefined;
        const end = times.length ? dayOf(times[times.length - 1]) : undefined;
        browse.setDraft({
            startDate: start ?? dayOf(Date.now()),
            endDate: end && end.lexical !== start!.lexical ? end : undefined,
            tags: [],
            media: [...selected],
            locations: [],
            attendees: [],
        });
        browse.stopSelecting();
        router.push({ name: "editor" });
    }

    /**
     * A grouping suggestion accepted (§6.2): the run becomes the selection, and
     * from there it is an ordinary bulk action — the same code path and the
     * same bar as picking those memories by hand. Nothing is written until the
     * user finishes the action they chose, so accepting a suggestion is still
     * only a proposal.
     */
    function actOnCluster(docs: string[], what: "tag" | "write") {
        browse.startSelecting();
        for (const d of docs) browse.toggle(d);
        if (what === "tag") tagging = true;
        else writeAboutMemories();
    }
</script>

<div class="p-4 max-w-4xl mx-auto">
    <div class="flex items-center gap-2 mb-2">
        <h1 class="text-xl font-bold">Browse</h1>
        <button
            class="btn btn-ghost btn-xs ml-auto"
            class:btn-active={browse.active}
            onclick={() => (showFilter = !showFilter)}
        >
            Filter{browse.active ? " ·" : ""}
        </button>
        {#if !browse.selecting}
            <button
                class="btn btn-ghost btn-xs"
                onclick={() => browse.startSelecting()}
            >
                Select
            </button>
        {/if}
    </div>

    {#if showFilter}
        <div class="bg-base-200 rounded-box p-3 mb-3 flex flex-col gap-3">
            <div class="flex flex-wrap gap-4 items-start">
                <div>
                    <div class="label py-0">
                        <span class="label-text text-xs">From</span>
                    </div>
                    {#if facets.from}
                        <div class="flex items-start gap-1">
                            <PrecisionDatePicker
                                value={facets.from}
                                onchange={(d) => (facets.from = d)}
                            />
                            <button
                                class="btn btn-ghost btn-xs"
                                onclick={() => (facets.from = undefined)}>✕</button
                            >
                        </div>
                    {:else}
                        <button
                            class="btn btn-xs"
                            onclick={() =>
                                (facets.from = { lexical: "2000", precision: "year" })}
                        >
                            any date
                        </button>
                    {/if}
                </div>
                <div>
                    <div class="label py-0">
                        <span class="label-text text-xs">To</span>
                    </div>
                    {#if facets.to}
                        <div class="flex items-start gap-1">
                            <PrecisionDatePicker
                                value={facets.to}
                                onchange={(d) => (facets.to = d)}
                            />
                            <button
                                class="btn btn-ghost btn-xs"
                                onclick={() => (facets.to = undefined)}>✕</button
                            >
                        </div>
                    {:else}
                        <button
                            class="btn btn-xs"
                            onclick={() =>
                                (facets.to = {
                                    lexical: String(new Date().getFullYear()),
                                    precision: "year",
                                })}
                        >
                            any date
                        </button>
                    {/if}
                </div>
            </div>

            <div class="flex items-center gap-2">
                <span class="text-xs opacity-70">Tags match</span>
                <div class="join">
                    <button
                        class="join-item btn btn-xs"
                        class:btn-active={facets.tagMode === "any"}
                        onclick={() => (facets.tagMode = "any")}>any</button
                    >
                    <button
                        class="join-item btn btn-xs"
                        class:btn-active={facets.tagMode === "all"}
                        onclick={() => (facets.tagMode = "all")}>all</button
                    >
                </div>
            </div>
            <TagMultiselect
                selected={facets.tags}
                ontoggle={(iri) =>
                    (facets.tags = facets.tags.includes(iri)
                        ? facets.tags.filter((t) => t !== iri)
                        : [...facets.tags, iri])}
            />

            {#if knownPlaces.length}
                <label class="form-control">
                    <div class="label py-0">
                        <span class="label-text text-xs">Place</span>
                    </div>
                    <select
                        class="select select-bordered select-sm"
                        value={facets.place ?? ""}
                        onchange={(e) =>
                            (facets.place =
                                e.currentTarget.value || undefined)}
                    >
                        <option value="">anywhere</option>
                        {#each knownPlaces as p (p.id)}
                            <option value={p.id}>{p.name}</option>
                        {/each}
                    </select>
                </label>
            {/if}

            {#if knownPeople.length}
                <label class="form-control">
                    <div class="label py-0">
                        <span class="label-text text-xs">Who</span>
                    </div>
                    <select
                        class="select select-bordered select-sm"
                        value={facets.person ?? ""}
                        onchange={(e) =>
                            (facets.person = e.currentTarget.value || undefined)}
                    >
                        <option value="">anyone</option>
                        {#each knownPeople as g (g.key)}
                            <option value={g.key}>
                                {g.name} ({g.memories.length})
                            </option>
                        {/each}
                    </select>
                </label>
            {/if}

            <label class="label cursor-pointer justify-start gap-2">
                <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    bind:checked={facets.hasMedia}
                />
                <span class="label-text text-sm">has photographs</span>
            </label>

            <div class="flex gap-2">
                <button
                    class="btn btn-xs"
                    disabled={!browse.active}
                    onclick={() => browse.clear()}
                >
                    Clear the filter
                </button>
                <span class="text-xs opacity-60 self-center">
                    {filtered.length} of {all.length} memories
                </span>
            </div>
        </div>
    {/if}

    <ProjectionSwitcher current={projection} />

    {#if browse.selecting}
        <div
            class="sticky top-0 z-10 bg-base-300 rounded-box p-2 mb-2 flex flex-wrap gap-2 items-center"
        >
            <span class="text-sm font-medium">
                {selected.length} selected
            </span>
            {#if projection === "media"}
                <button
                    class="btn btn-xs"
                    disabled={!selected.length || working}
                    onclick={writeAboutMedia}
                >
                    Write a memory about these
                </button>
            {:else}
                <button
                    class="btn btn-xs"
                    disabled={!selected.length || working}
                    onclick={() => (tagging = !tagging)}
                >
                    Tag these
                </button>
                <button
                    class="btn btn-xs"
                    disabled={!selected.length || working}
                    onclick={writeAboutMemories}
                >
                    Write a memory about these
                </button>
                {#if confirmingDelete}
                    <button
                        class="btn btn-xs btn-error"
                        disabled={working}
                        onclick={deleteSelected}
                    >
                        Really delete {selected.length}
                    </button>
                    <button
                        class="btn btn-xs"
                        disabled={working}
                        onclick={() => (confirmingDelete = false)}>Keep</button
                    >
                {:else}
                    <button
                        class="btn btn-xs btn-outline btn-error"
                        disabled={!selected.length || working}
                        onclick={() => (confirmingDelete = true)}
                    >
                        Delete
                    </button>
                {/if}
            {/if}
            <button
                class="btn btn-xs btn-ghost ml-auto"
                onclick={() => {
                    tagging = false;
                    confirmingDelete = false;
                    browse.stopSelecting();
                }}
            >
                Done
            </button>
        </div>

        {#if tagging}
            <div class="bg-base-200 rounded-box p-3 mb-2 flex flex-col gap-2">
                <TagMultiselect
                    selected={bulkTags}
                    ontoggle={(iri) =>
                        (bulkTags = bulkTags.includes(iri)
                            ? bulkTags.filter((t) => t !== iri)
                            : [...bulkTags, iri])}
                />
                <div class="flex gap-2">
                    <button
                        class="btn btn-xs btn-primary"
                        disabled={!bulkTags.length || working}
                        onclick={() => applyTags(false)}
                    >
                        Add to {selected.length}
                    </button>
                    <button
                        class="btn btn-xs"
                        disabled={!bulkTags.length || working}
                        onclick={() => applyTags(true)}
                    >
                        Remove from {selected.length}
                    </button>
                    {#if sharedTags.length}
                        <span class="text-xs opacity-60 self-center">
                            {sharedTags.length} tag(s) common to all of them
                        </span>
                    {/if}
                </div>
            </div>
        {/if}
    {/if}

    {#if culprit}
        <!-- §8: name the facet most likely responsible, offer to drop it. -->
        <div class="alert my-3 text-sm">
            <span>
                Nothing matches. {FACET_LABELS[culprit.facet]} is the narrowest
                part of this filter — without it, {culprit.without} memories.
            </span>
            <button class="btn btn-sm" onclick={() => browse.drop(culprit.facet)}>
                Drop it
            </button>
        </div>
    {:else if projection === "time"}
        <S22aTime act={actOnCluster} />
    {:else if projection === "media"}
        <S22cMedia />
    {:else}
        <S22bSpace />
    {/if}
</div>
