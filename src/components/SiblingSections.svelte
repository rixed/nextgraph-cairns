<script lang="ts">
    // S-20's sibling sections (§6.2): the other memories at the same place,
    // with the same people, sharing tags, or about the same public event.
    //
    // This is what makes a tag navigational rather than merely filterable —
    // §1.1.5 has tags as the only organisation, and until now the only way to
    // follow one was to go back to the archive and build a filter.
    import { useShape } from "@ng-org/orm/svelte";
    import { ConceptShapeType } from "../shapes/orm/tagShape.shapeTypes";
    import { pathOf, type Concept } from "../lib/tagPaths";
    import {
        siblingGroups,
        type Facet,
        type SiblingGroup,
    } from "../lib/siblings";
    import { findPlace, placeLabel, type Place } from "../lib/places";
    import { personKey, personLabel, type Person } from "../lib/people";
    import { findEvent, type PublicEvent } from "../lib/events.svelte";
    import { parsePrecisionDate, formatPrecisionDate } from "../lib/dates";
    import { browse } from "../lib/browse.svelte";
    import { router } from "../lib/router.svelte";
    import type { Memory } from "../shapes/orm/memoryShape.typings";

    let {
        memory,
        all,
        places,
        people,
        events,
    }: {
        memory: Memory;
        all: Memory[];
        places: Place[];
        people: Person[];
        events: PublicEvent[];
    } = $props();

    // A memory with a dozen tags would otherwise turn its own detail screen
    // into a directory. The groups are already ordered by facet and by size,
    // so what is cut is the narrowest evidence of the least-shared kind.
    const MAX_GROUPS = 6;
    // Per group, when there is a screen to see the rest in.
    const MAX_MEMBERS = 4;

    const concepts = useShape(ConceptShapeType, "did:ng:i");
    const conceptList = $derived(
        [...concepts].map(
            (c): Concept => ({
                id: c["@id"],
                label: c.prefLabel ?? "",
                broader: [...(c.broader ?? [])][0],
            })
        )
    );

    const groups = $derived(
        siblingGroups(memory, all, { people }).slice(0, MAX_GROUPS)
    );

    const ICON: Record<Facet, string> = {
        place: "📍",
        person: "👤",
        tag: "#",
        event: "📅",
    };

    /** What the group shares, named the way that facet's screens name it. */
    function heading(g: SiblingGroup): string {
        switch (g.facet) {
            case "place":
                return `Also at ${placeLabel(findPlace(places, g.via), g.via)}`;
            case "person": {
                const p = people.find((x) => personKey(x, x.id) === g.via);
                return `Also with ${p ? personLabel(p, p.id) : g.via.replace(/^name:/, "")}`;
            }
            case "tag":
                return `Also tagged ${pathOf(conceptList, g.via) || g.via.split(/[#/]/).pop()!.slice(0, 12)}`;
            case "event": {
                const e = findEvent(events, g.via);
                return `Also about ${e?.name ?? "an event not synced here yet"}`;
            }
        }
    }

    function label(m: Memory): string {
        const start = parsePrecisionDate(m.startDate);
        return m.name ?? (start ? formatPrecisionDate(start) : "a memory");
    }

    function dateOf(m: Memory): string {
        // Only as a suffix: a titled memory still wants to say when.
        const start = parsePrecisionDate(m.startDate);
        return m.name && start ? formatPrecisionDate(start) : "";
    }

    /**
     * Where the whole group lives, when a screen for it exists. A public event
     * has none — S-34 is not built — so instead of sending the user to a stub,
     * an event group shows every member. `seeAll` being undefined is what the
     * markup reads as "there is no rest to see".
     */
    function seeAll(g: SiblingGroup): (() => void) | undefined {
        switch (g.facet) {
            case "place":
                return () =>
                    router.push({ name: "place", params: { iri: g.via } });
            case "person":
                return () =>
                    router.push({ name: "person", params: { key: g.via } });
            case "tag":
                return () => {
                    browse.clear();
                    browse.facets.tags = [g.via];
                    router.replaceRoot({ name: "browse" });
                };
            case "event":
                return undefined;
        }
    }

    const shown = (g: SiblingGroup) =>
        seeAll(g) ? g.members.slice(0, MAX_MEMBERS) : g.members;
</script>

{#each groups as g (g.facet + g.via)}
    <div class="flex flex-col gap-1">
        <h2 class="text-xs font-semibold opacity-60">
            {ICON[g.facet]}
            {heading(g)}
        </h2>
        {#each shown(g) as m (m["@graph"])}
            <button
                class="text-xs text-left link link-hover"
                onclick={() =>
                    router.push({
                        name: "detail",
                        params: { doc: m["@graph"] as string },
                    })}
            >
                {label(m)}
                {#if dateOf(m)}
                    <span class="opacity-60">· {dateOf(m)}</span>
                {/if}
            </button>
        {/each}
        {#if g.members.length > shown(g).length}
            <button
                class="text-xs text-left opacity-60 link link-hover"
                onclick={seeAll(g)}
            >
                +{g.members.length - shown(g).length} more
            </button>
        {/if}
    </div>
{/each}
