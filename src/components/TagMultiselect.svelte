<script lang="ts">
    // Choosing tags, and making them (§3.5, §5).
    //
    // The vocabulary belongs to whichever application manages it; this app may
    // only append (§5). Appending is what happens here: typing a name nobody
    // has used yet offers to create it, and typing `portugal/sintra` creates
    // whatever part of that path is missing. Nothing renames, merges or
    // re-parents, here or anywhere.
    //
    // The hierarchy is a completion aid before it is a structure: a hundred
    // tags in one flat list is unusable, and the same hundred one level at a
    // time is not. Type `portugal/` and the box offers what is already under
    // Portugal — which is also how the user discovers the vocabulary rather
    // than inventing a fourth spelling of it.
    //
    // Ark UI's Combobox with `multiple` and `allowCustomValue`: it owns the
    // keyboard, the focus and the ARIA, which is the part worth not writing by
    // hand. The completion list itself is ours, because the scoping rule
    // (children of the named parent, not every match in the store) is not
    // something a generic filter can know.
    import { Combobox, useListCollection } from "@ark-ui/svelte/combobox";
    import { useShape } from "@ng-org/orm/svelte";
    import { ConceptShapeType } from "../shapes/orm/tagShape.shapeTypes";
    import { ensurePath } from "../lib/tags";
    import {
        completions,
        isNew,
        pathOf,
        splitPath,
        type Concept,
    } from "../lib/tagPaths";

    let {
        selected,
        ontoggle,
    }: { selected: string[]; ontoggle: (iri: string) => void } = $props();

    // Wildcard scope: concepts from any scheme in the dataset (§5 — foreign
    // schemes are read when present).
    const concepts = useShape(ConceptShapeType, "did:ng:i");

    // A concept can arrive before its label does — the subscription delivers an
    // object as soon as it matches, and the remaining triples follow (§8,
    // "partially loaded"). One with no label yet is not offerable, but it is
    // still a parent other concepts point at, so it stays in the tree.
    const all = $derived(
        [...concepts].map(
            (c): Concept => ({
                id: c["@id"],
                label: c.prefLabel ?? "",
                broader: [...(c.broader ?? [])][0],
            })
        )
    );

    let typed = $state("");
    let creating = $state(false);
    let error = $state("");
    /**
     * Closed after every choice. Ark keeps a multi-select list open so several
     * can be picked in a row, which is right in the abstract and wrong here:
     * the list is positioned over the rest of the form, and a tag picker that
     * sits on top of the Save button is worse than one that needs a second
     * click to add a second tag. Clicking the box reopens it.
     */
    let open = $state(false);

    const offered = $derived(
        completions(all, typed).filter((c) => c.label && !selected.includes(c.id))
    );
    const canCreate = $derived(
        !!typed.trim() && isNew(all, typed) && !creating
    );

    /**
     * Creating is the first row of the list, not a button beside it.
     *
     * It began as a button below the box, which the open listbox covered
     * completely — the list is open exactly when something has been typed, so
     * the affordance was unreachable at the only moment it existed. Inside the
     * list it is also keyboard-reachable, which a button never was.
     */
    const CREATE = "\u0000create";

    // Ark wants a collection keyed by value; the label it shows is the full
    // path, so two branches of the same word are told apart on sight. The
    // props are a function, which is how Ark takes a reactive collection —
    // building a new hook inside a $derived would make one per keystroke.
    const items = $derived([
        ...(canCreate
            ? [
                  {
                      value: CREATE,
                      label: `+ create “${splitPath(typed).join(" / ")}”`,
                  },
              ]
            : []),
        ...offered.map((c) => ({
            value: c.id,
            label: pathOf(all, c.id) || c.label,
        })),
    ]);
    const list = useListCollection(() => ({ initialItems: items }));
    const collection = $derived(list.collection());

    async function create() {
        const path = typed;
        open = false;
        creating = true;
        error = "";
        try {
            const iri = await ensurePath(all, path);
            if (iri) ontoggle(iri);
            typed = "";
        } catch (e) {
            error = String(e);
        } finally {
            creating = false;
        }
    }

    function pick(value: string[]) {
        // The create row is not a tag; choosing it makes one.
        if (value.includes(CREATE)) {
            create();
            return;
        }
        // Ark hands back the whole selection; this component reports changes
        // one at a time, because that is what every caller already does.
        for (const v of value) if (!selected.includes(v)) ontoggle(v);
        typed = "";
        open = false;
    }
</script>

<div class="flex flex-col gap-1">
    {#if selected.length}
        <!-- Above the input, because the list opens downward and covers
             whatever is beneath it. The create affordance was a button down
             there once, and could never be clicked at all. -->
        <ul class="flex flex-wrap gap-1">
            {#each selected as iri (iri)}
                <li>
                    <span class="badge badge-outline badge-sm gap-1">
                        {pathOf(all, iri) || "…"}
                        <button
                            aria-label="Remove this tag"
                            onclick={() => ontoggle(iri)}>✕</button
                        >
                    </span>
                </li>
            {/each}
        </ul>
    {/if}

    <Combobox.Root
        {collection}
        multiple
        bind:open
        value={selected}
        inputValue={typed}
        onInputValueChange={(e) => (typed = e.inputValue)}
        onValueChange={(e) => pick(e.value)}
        openOnClick
        class="w-full"
    >
        <Combobox.Label class="label"
            ><span class="label-text">Tags</span></Combobox.Label
        >
        <Combobox.Control class="flex gap-1 items-center">
            <Combobox.Input
                class="input input-bordered input-sm flex-1"
                placeholder="tag, or portugal/sintra"
            />
            <Combobox.Trigger class="btn btn-sm btn-ghost" aria-label="Show tags"
                >▾</Combobox.Trigger
            >
        </Combobox.Control>
        <Combobox.Positioner>
            <Combobox.Content
                class="menu bg-base-100 rounded-box shadow z-20 w-72 max-h-64 overflow-y-auto flex-nowrap p-1"
            >
                {#each items as item (item.value)}
                    <Combobox.Item {item} class="rounded px-2 py-1 text-sm">
                        <Combobox.ItemText>{item.label}</Combobox.ItemText>
                    </Combobox.Item>
                {/each}
                {#if !items.length}
                    <div class="p-2 text-sm opacity-70">
                        {typed.trim()
                            ? "no tag by that name"
                            : "no tags yet — type one"}
                    </div>
                {/if}
            </Combobox.Content>
        </Combobox.Positioner>
    </Combobox.Root>

    {#if creating}
        <span class="text-xs opacity-60">adding it to the vocabulary…</span>
    {/if}
    {#if error}
        <span class="text-xs text-error">{error}</span>
    {/if}

</div>
