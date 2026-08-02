<script lang="ts">
    // Who was there (§3.3, §6.2): contacts or typed names, 0..N.
    //
    // Not a screen of its own, unlike the place picker: a name is typed far
    // more often than it is looked up, and pushing a screen to type four
    // letters would be the wrong shape. Contacts already known are offered as
    // you type, and anything else becomes a bare name — a name with no record
    // behind it, which §3.3 treats as a first-class answer rather than a
    // half-finished one.
    import {
        useAllPeople,
        isBareName,
        type AttendeeDraft,
        type Person,
    } from "../lib/people";

    let {
        selected,
        memoryDocs,
        onchange,
    }: {
        selected: AttendeeDraft[];
        /** The app's memory documents, which is what marks a person as bare. */
        memoryDocs: Set<string>;
        onchange: (next: AttendeeDraft[]) => void;
    } = $props();

    const people = useAllPeople();
    let typed = $state("");

    const contacts = $derived(
        people.all
            .filter((p) => !isBareName(p, memoryDocs) && p.name?.trim())
            .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    );

    const alreadyThere = (draft: AttendeeDraft) =>
        selected.some((s) =>
            s.kind === "contact" && draft.kind === "contact"
                ? s.iri === draft.iri
                : s.kind === "bare" &&
                  draft.kind === "bare" &&
                  s.name.trim().toLowerCase() ===
                      draft.name.trim().toLowerCase()
        );

    const matching = $derived(
        typed.trim()
            ? contacts.filter(
                  (c) =>
                      c.name!.toLowerCase().includes(
                          typed.trim().toLowerCase()
                      ) && !alreadyThere({ kind: "contact", iri: c.id })
              )
            : contacts.filter(
                  (c) => !alreadyThere({ kind: "contact", iri: c.id })
              )
    );

    const labelOf = (a: AttendeeDraft): string =>
        a.kind === "bare"
            ? a.name
            : (people.all.find((p) => p.id === a.iri)?.name ?? "someone");

    function add(draft: AttendeeDraft) {
        if (!alreadyThere(draft)) onchange([...selected, draft]);
        typed = "";
    }

    function addTyped() {
        const name = typed.trim();
        if (!name) return;
        // A typed name that matches a contact exactly means that contact —
        // typing "Ana" when Ana is in your people should not mint a second Ana.
        const exact = contacts.find(
            (c) => c.name!.trim().toLowerCase() === name.toLowerCase()
        );
        add(exact ? { kind: "contact", iri: exact.id } : { kind: "bare", name });
    }
</script>

<div class="form-control">
    <div class="label"><span class="label-text">Who was there</span></div>

    {#if selected.length}
        <ul class="flex flex-wrap gap-1 mb-2">
            {#each selected as a, i (i)}
                <li class="badge badge-ghost gap-1">
                    {a.kind === "contact" ? "👤" : "✎"}
                    {labelOf(a)}
                    <button
                        class="opacity-60 hover:opacity-100"
                        aria-label="Remove {labelOf(a)}"
                        onclick={() =>
                            onchange(selected.filter((_, j) => j !== i))}
                    >
                        ✕
                    </button>
                </li>
            {/each}
        </ul>
    {/if}

    <div class="flex gap-2">
        <input
            class="input input-bordered input-sm w-full"
            bind:value={typed}
            placeholder="A name, or someone you know"
            onkeydown={(e) => e.key === "Enter" && (e.preventDefault(), addTyped())}
        />
        <button class="btn btn-sm" disabled={!typed.trim()} onclick={addTyped}>
            add
        </button>
    </div>

    {#if matching.length}
        <ul class="menu menu-sm bg-base-200 rounded-box mt-1 max-h-40 overflow-y-auto flex-nowrap">
            {#each matching.slice(0, 8) as c (c.id)}
                <li>
                    <button onclick={() => add({ kind: "contact", iri: c.id })}>
                        👤 {c.name}
                    </button>
                </li>
            {/each}
        </ul>
    {/if}

    {#if typed.trim() && !matching.some((c: Person) => c.name!.toLowerCase() === typed.trim().toLowerCase())}
        <p class="text-xs opacity-60 mt-1">
            "{typed.trim()}" becomes a name on this memory. You can make it
            someone you know later, from the People tab.
        </p>
    {/if}
</div>
