<script lang="ts">
    // S-02 Search (§6.2): free text over memories and their narratives, places,
    // events, people, tags and recommendations. Results grouped by type.
    //
    // "Distinct from the browse filter: search is a query, browse is faceted."
    // The two meet in one place — any result set can be handed to S-22, which
    // is how a text search becomes a bulk tagging operation (§4.4).
    //
    // No index (Appendix A, B-08). What that costs is visible here and said
    // out loud rather than hidden: substring matching, no stemming, and time
    // for an order because there is no relevance to sort by.
    import { useShape } from "@ng-org/orm/svelte";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import type { Memory } from "../shapes/orm/memoryShape.typings";
    import { ConceptShapeType } from "../shapes/orm/tagShape.shapeTypes";
    import { select } from "../lib/query";
    import {
        searchQuery,
        toHits,
        groupHits,
        excerpt,
        KIND_LABELS,
        MIN_NEEDLE,
        type Hit,
    } from "../lib/search";
    import {
        parsePrecisionDate,
        interval,
        formatPrecisionDate,
    } from "../lib/dates";
    import { useAllPlaces, findPlace, placeLabel, isIdentified } from "../lib/places";
    import { useAllPeople, findPerson, personKey, personLabel } from "../lib/people";
    import { useEvents, findEvent } from "../lib/events.svelte";
    import { useRecommendations } from "../lib/recommendations";
    import { pathOf, type Concept } from "../lib/tagPaths";
    import { browse } from "../lib/browse.svelte";
    import { router } from "../lib/router.svelte";

    const memories = useShape(MemoryShapeType, "did:ng:i");
    const concepts = useShape(ConceptShapeType, "did:ng:i");
    const places = useAllPlaces();
    const people = useAllPeople();
    const events = useEvents();
    const recs = useRecommendations();

    const all = $derived([...memories] as unknown as Memory[]);
    const conceptList = $derived(
        [...concepts].map(
            (c): Concept => ({
                id: c["@id"],
                label: c.prefLabel ?? "",
                broader: [...(c.broader ?? [])][0],
            })
        )
    );

    let needle = $state("");
    let hits = $state<Hit[]>([]);
    let searching = $state(false);
    let ran = $state("");
    let error = $state("");

    async function run() {
        const n = needle.trim();
        if (n.length < MIN_NEEDLE) return;
        searching = true;
        error = "";
        try {
            hits = toHits(await select(searchQuery(n)));
            ran = n;
        } catch (e) {
            error = String(e);
            hits = [];
        } finally {
            searching = false;
        }
    }

    const memoryOf = (h: Hit) => all.find((m) => m["@graph"] === h.graph);

    /** What a hit is called, in the words the rest of the app uses for it. */
    function label(h: Hit): string {
        switch (h.kind) {
            case "memory": {
                const m = memoryOf(h);
                const d = m ? parsePrecisionDate(m.startDate) : undefined;
                return m?.name ?? (d ? formatPrecisionDate(d) : "a memory");
            }
            case "place":
                return placeLabel(findPlace(places.all, h.id), h.id);
            case "person":
                return personLabel(findPerson(people.all, h.id), h.id);
            case "tag":
                return pathOf(conceptList, h.id) || h.snippet || "a tag";
            case "event":
                return findEvent(events.all, h.id)?.name ?? "an event";
            case "recommendation": {
                const r = recs.all.find((x) => x.id === h.id);
                return r?.note || "a recommendation";
            }
            default:
                return h.snippet ?? h.id;
        }
    }

    /** Newest first needs a time; the app already holds every object hit. */
    function timeOf(h: Hit): number | undefined {
        const dated = (lex?: string) => {
            const d = parsePrecisionDate(lex);
            return d ? interval(d).earliest : undefined;
        };
        if (h.kind === "memory") return dated(memoryOf(h)?.startDate);
        if (h.kind === "event") {
            const e = findEvent(events.all, h.id);
            return e?.start ? interval(e.start).earliest : undefined;
        }
        if (h.kind === "recommendation") {
            const r = recs.all.find((x) => x.id === h.id);
            return r?.told ? interval(r.told).earliest : undefined;
        }
        return undefined;
    }

    const groups = $derived(groupHits(hits, timeOf));
    const memoryHits = $derived(hits.filter((h) => h.kind === "memory"));

    /** A hit opens the screen its type belongs to (§6.3). */
    function open(h: Hit) {
        switch (h.kind) {
            case "memory":
                router.push({ name: "detail", params: { doc: h.graph } });
                break;
            case "place":
                router.push(
                    isIdentified(h.id)
                        ? { name: "place", params: { iri: h.id } }
                        : { name: "unnamedplace", params: { iri: h.id } }
                );
                break;
            case "person":
                router.push({
                    name: "person",
                    params: {
                        key: personKey(findPerson(people.all, h.id), h.id),
                    },
                });
                break;
            case "tag":
                browse.clear();
                browse.facets.tags = [h.id];
                router.replaceRoot({ name: "browse" });
                break;
            case "recommendation":
                router.push({ name: "heard", params: { focus: h.id } });
                break;
            case "event":
                router.push({
                    name: "stub",
                    params: { label: "Public event (S-34)" },
                });
                break;
        }
    }

    /**
     * The result set handed to S-22 as a filter (§6.2), with the memories
     * already selected: the point of the hand-off is the bulk action, and
     * selecting forty rows by hand would be a poor way to get there. Nothing is
     * written — the bar still asks what to do with them.
     */
    function toBrowse(alsoSelect: boolean) {
        const docs = memoryHits.map((h) => h.graph);
        browse.clear();
        browse.facets.docs = docs;
        if (alsoSelect) browse.selectAll(docs);
        else browse.stopSelecting();
        router.replaceRoot({ name: "browse" });
    }
</script>

<div class="p-4 max-w-2xl mx-auto flex flex-col gap-3">
    <div class="flex items-center gap-2">
        <button class="btn btn-ghost btn-sm" onclick={() => router.pop()}>
            ← back
        </button>
        <h1 class="text-xl font-bold">Search</h1>
    </div>

    <form
        class="flex gap-2"
        onsubmit={(e) => {
            e.preventDefault();
            run();
        }}
    >
        <!-- svelte-ignore a11y_autofocus -->
        <input
            class="input input-bordered input-sm flex-1"
            placeholder="anything — a word, a name, a place"
            aria-label="Search"
            autofocus
            bind:value={needle}
        />
        <button
            class="btn btn-sm btn-primary"
            disabled={needle.trim().length < MIN_NEEDLE || searching}
        >
            Search
        </button>
    </form>

    {#if searching}
        <span class="loading loading-dots loading-sm"></span>
    {/if}

    {#if error}
        <div class="alert alert-error text-sm"><span>{error}</span></div>
    {/if}

    {#if ran && !searching && !hits.length}
        <p class="opacity-70 py-8 text-center">
            Nothing in your store contains “{ran}”.
        </p>
    {/if}

    {#if memoryHits.length}
        <div class="flex flex-wrap gap-2 items-center">
            <button class="btn btn-sm" onclick={() => toBrowse(true)}>
                Tag or group these {memoryHits.length} memories
            </button>
            <button class="btn btn-sm btn-ghost" onclick={() => toBrowse(false)}>
                Just show them in Browse
            </button>
        </div>
    {/if}

    {#each groups as g (g.kind)}
        <div class="flex flex-col gap-1">
            <h2 class="text-xs font-semibold opacity-60">
                {KIND_LABELS[g.kind]} · {g.hits.length}
            </h2>
            <ul class="flex flex-col">
                {#each g.hits as h (h.id)}
                    <li>
                        <button
                            class="w-full text-left py-1 px-1 rounded hover:bg-base-200 disabled:hover:bg-transparent"
                            disabled={g.kind === "other"}
                            onclick={() => open(h)}
                        >
                            <span class="text-sm">{label(h)}</span>
                            {#if h.snippet && h.snippet !== label(h)}
                                <span class="block text-xs opacity-60">
                                    {excerpt(h.snippet, ran)}
                                </span>
                            {/if}
                        </button>
                    </li>
                {/each}
            </ul>
        </div>
    {/each}

    {#if hits.length}
        <!-- B-08, said rather than hidden: this is substring matching over
             every literal in the store, ordered by time because there is no
             relevance to order by. -->
        <p class="text-xs opacity-50 mt-2">
            Substring matching: “walk” finds “walking”, “walked” does not.
            Newest first, because without an index there is nothing to rank by.
        </p>
    {/if}
</div>
