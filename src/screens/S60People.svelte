<script lang="ts">
    // S-60 People. Everyone your memories name, ordered by how many of them
    // they appear in — the ordering §6.2 asks for, and the one that makes a
    // travelling life legible: the people you keep meeting rise on their own.
    //
    // Bare names are listed apart, each with the promotion §3.3 describes.
    // They are not second-class here: a name with no record behind it is a
    // complete answer, and most of them will stay that way.
    //
    // Local-only in P0: no invitation, no network, nobody to ask.
    import { useShape } from "@ng-org/orm/svelte";
    import { OrmSubscription, normalizeScope } from "@ng-org/orm";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import type { Memory } from "../shapes/orm/memoryShape.typings";
    import {
        useAllPeople,
        groupPeople,
        bareOccurrences,
        promoteBareName,
        type PersonGroup,
    } from "../lib/people";
    import { router } from "../lib/router.svelte";
    import { devView } from "../lib/devView.svelte";

    const memories = useShape(MemoryShapeType, "did:ng:i");
    const people = useAllPeople();

    let ready = $state(false);
    OrmSubscription.getOrCreate(
        MemoryShapeType,
        normalizeScope("did:ng:i")
    ).readyPromise.then(() => (ready = true));

    let promoting = $state<string | undefined>();
    let error = $state("");

    const all = $derived([...memories] as unknown as Memory[]);
    const memoryDocs = $derived(new Set(all.map((m) => m["@graph"])));
    const attendeeLists = $derived(
        all.map((m) => ({
            doc: m["@graph"],
            attendees: [...(m.attendee ?? [])],
        }))
    );
    const groups = $derived(
        groupPeople(people.all, attendeeLists, memoryDocs)
    );
    /**
     * A search box, once the list stops being scannable. A real address book
     * is not three people — `make seed-foreign` writes sixty — and the ordering
     * §6.2 asks for puts the people you travel with on top, which is exactly
     * why everyone else ends up out of reach.
     *
     * Diacritics are folded, so "sorensen" finds Ingrid Sørensen: a name typed
     * from memory rarely carries them.
     */
    let query = $state("");
    const fold = (s: string) =>
        s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const needle = $derived(fold(query.trim()));
    const searchable = $derived(groups.length > 12);
    const shown = $derived(
        needle ? groups.filter((g) => fold(g.name).includes(needle)) : groups
    );

    const contacts = $derived(shown.filter((g) => g.contact));
    const bare = $derived(shown.filter((g) => !g.contact));

    const open = (g: PersonGroup) =>
        router.push({ name: "person", params: { key: g.key } });

    /**
     * §3.3: minting the contact and rewriting every memory that used the name
     * happen in one update, so this either takes effect everywhere or nowhere
     * (spike 8). No confirmation, because there is nothing to warn about — the
     * memories say exactly what they said before, about someone now named.
     */
    async function promote(g: PersonGroup) {
        promoting = g.key;
        error = "";
        try {
            await promoteBareName(
                g.name,
                bareOccurrences(g.key, people.all, attendeeLists, memoryDocs)
            );
        } catch (e) {
            error = String(e);
        } finally {
            promoting = undefined;
        }
    }
</script>

<div class="p-4 max-w-2xl mx-auto flex flex-col gap-4">
    <h1 class="text-xl font-bold">People</h1>

    {#if !ready}
        <div class="flex items-center gap-2 text-sm opacity-70">
            <span class="loading loading-bars loading-xs"></span>
            reading your memories…
        </div>
    {:else if !groups.length}
        <!-- First-run empty: an action, not an illustration (§8). -->
        <div class="text-center py-16 flex flex-col items-center gap-3">
            <p class="opacity-70">
                Nobody yet. Names you type into a memory show up here.
            </p>
            <button
                class="btn btn-primary"
                onclick={() => router.push({ name: "editor" })}
            >
                Capture a memory
            </button>
        </div>
    {/if}

    {#if error}
        <div class="alert alert-error text-sm">{error}</div>
    {/if}

    {#if ready && searchable}
        <label class="input input-bordered input-sm flex items-center gap-2">
            <span class="opacity-50">🔍</span>
            <input
                class="grow"
                type="search"
                placeholder="Find someone"
                bind:value={query}
            />
            {#if needle}
                <span class="text-xs opacity-60">
                    {shown.length} of {groups.length}
                </span>
            {/if}
        </label>
    {/if}

    {#if ready && needle && !shown.length}
        <!-- §8: an empty result says what emptied it and undoes itself. -->
        <div class="alert text-sm">
            <span>Nobody here matches “{query.trim()}”.</span>
            <button class="btn btn-sm" onclick={() => (query = "")}>
                Show everyone
            </button>
        </div>
    {/if}

    {#if contacts.length}
        <div>
            <h2 class="text-sm font-semibold opacity-70 mb-1">
                People you know
            </h2>
            <ul class="menu bg-base-200 rounded-box w-full">
                {#each contacts as g (g.key)}
                    <li>
                        <button onclick={() => open(g)}>
                            <span>👤 {g.name}</span>
                            <span class="ml-auto text-xs opacity-60">
                                {g.memories.length}
                                {g.memories.length === 1 ? "memory" : "memories"}
                            </span>
                        </button>
                    </li>
                {/each}
            </ul>
        </div>
    {/if}

    {#if bare.length}
        <div>
            <h2 class="text-sm font-semibold opacity-70 mb-1">
                Names in your memories
            </h2>
            <p class="text-xs opacity-60 mb-1">
                Typed as you wrote them, with no record behind them. Making one
                someone you know updates every memory that named them.
            </p>
            <ul class="flex flex-col gap-1">
                {#each bare as g (g.key)}
                    <li class="flex items-center gap-2 bg-base-200 rounded-box p-2">
                        <button
                            class="text-left flex-1"
                            onclick={() => open(g)}
                        >
                            <span class="font-medium">{g.name}</span>
                            <span class="text-xs opacity-60 ml-2">
                                {g.memories.length}
                                {g.memories.length === 1 ? "memory" : "memories"}
                            </span>
                        </button>
                        <button
                            class="btn btn-xs"
                            disabled={promoting === g.key}
                            onclick={() => promote(g)}
                        >
                            {#if promoting === g.key}
                                <span class="loading loading-spinner loading-xs"
                                ></span>
                            {/if}
                            someone I know
                        </button>
                    </li>
                {/each}
            </ul>
        </div>
    {/if}

    {#if devView.on && groups.length}
        <p class="text-xs opacity-60 border-t pt-2">
            People are read wherever they are published, and written to one
            user-owned document any application may append to (§5, B-03) — the
            same arrangement as the tag vocabulary. Promotion rewrites every
            memory in a single update, so the archive is never half-promoted
            (spike 8, B-06).
        </p>
    {/if}
</div>
