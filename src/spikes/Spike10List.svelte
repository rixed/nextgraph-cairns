<script lang="ts">
    // Spike 10 — one document, many mutable subjects (Specs §3.7, §4.1).
    //
    // Recommendations are the first thing this app owns that does NOT get a
    // document each. They are subjects inside a single list document, and that
    // document is mutated in place for the rest of its life: an item appended
    // today, another edited next month, one deleted the month after. Every
    // owned write so far created a fresh document instead, so the questions
    // below have never been asked of the engine:
    //
    //   1. does a live wildcard subscription notice a NEW SIBLING SUBJECT
    //      appearing in a document it is already watching? If it does not,
    //      S-40 must reload after every S-41 save, and the two screens are
    //      built differently.
    //   2. does deleting one item leave its siblings — and the list itself —
    //      intact?
    //   3. does a precision-aware date (§3.1) round-trip on a subject that is
    //      not a memory?
    //   4. does the referent read back as a plain IRI (expected from spike 7,
    //      confirmed here because it costs one line)?
    //
    // Whatever this answers decides how S-40 and S-41 are built.
    import { useShape } from "@ng-org/orm/svelte";
    import { RecommendationShapeType } from "../shapes/orm/recommendationShape.shapeTypes";
    import type { Recommendation } from "../shapes/orm/recommendationShape.typings";
    import { createGraphDoc, select, update, fmt } from "./spikeUtils";

    const PREFIXES = `PREFIX app: <did:ng:z:cairns/>
        PREFIX schema: <https://schema.org/>
        PREFIX dcterms: <http://purl.org/dc/terms/>
        PREFIX prov: <http://www.w3.org/ns/prov#>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>`;

    // A marker, so the spike counts its own items and not a real archive's.
    const NOTE = "spike10";

    let log = $state<string[]>([]);
    // Plain variables: NURIs go back over the bridge, so nothing proxied.
    let listDoc: string | undefined;

    const recs = useShape(RecommendationShapeType, "did:ng:i");
    const mine = $derived(
        ([...recs] as unknown as Recommendation[]).filter(
            (r) => r.description === NOTE
        )
    );

    const say = (s: string) => {
        log = [...log, s];
        console.log("[spike10]", s);
    };

    // Question 1 is a question about reactivity, so it is answered by an
    // effect rather than by a button: this fires only if the subscription
    // pushed a change of its own accord.
    $effect(() => {
        const n = mine.length;
        console.log(`[spike10] subscription sees ${n}`);
    });

    function itemTriples(frag: string, referent: string, when: string): string {
        return `<${listDoc}> schema:itemListElement <${listDoc}#${frag}> .
            <${listDoc}#${frag}> a app:Recommendation , schema:ListItem ;
                schema:item <${referent}> ;
                dcterms:source "Ana, over dinner" ;
                dcterms:date ${when} ;
                schema:description "${NOTE}" .`;
    }

    /** The list document, with its first item. */
    async function createList() {
        const t0 = performance.now();
        listDoc = await createGraphDoc();
        await update(
            `${PREFIXES}
             INSERT DATA { GRAPH <${listDoc}> {
                <${listDoc}> a schema:ItemList ;
                    schema:name "spike10 list" .
                ${itemTriples("rec-1", "https://www.wikidata.org/entity/Q597", `"2026-03"^^xsd:gYearMonth`)}
             } }`,
            listDoc
        );
        say(`list document with one item in ${fmt(performance.now() - t0)}`);
        say(`  ${listDoc}`);
    }

    /**
     * Question 1. A second subject in the SAME document, written while the
     * subscription above is live and untouched.
     */
    async function appendSibling() {
        if (!listDoc) return say("create the list first");
        const before = mine.length;
        const t0 = performance.now();
        await update(
            `${PREFIXES}
             INSERT DATA { GRAPH <${listDoc}> {
                ${itemTriples("rec-2", "https://www.wikidata.org/entity/Q45", `"2026-07-14"^^xsd:date`)}
             } }`,
            listDoc
        );
        say(`appended a sibling in ${fmt(performance.now() - t0)}`);
        // The engine may deliver on its own schedule; give it a moment before
        // pronouncing, and say what was seen either way.
        await new Promise((r) => setTimeout(r, 800));
        say(
            `subscription went ${before} → ${mine.length} with no reload — ` +
                (mine.length > before ? "REACTIVE" : "NOT reactive")
        );
    }

    /** Questions 3 and 4: what comes back out. */
    async function inspect() {
        if (!mine.length) return say("no spike items in the subscription yet");
        for (const r of mine) {
            say(
                `${r["@id"].slice(-6)} — item=${JSON.stringify(r.item)} ` +
                    `date=${JSON.stringify(r.date)} source=${JSON.stringify(r.source)}`
            );
        }
        // The lexical form is only half the answer: the datatype is the
        // precision (§3.1), and it is invisible through the ORM's string.
        const rows = await select(
            `${PREFIXES}
             SELECT ?s ?d WHERE { GRAPH <${listDoc}> {
                ?s dcterms:date ?d } }`
        );
        for (const b of rows as any[])
            say(
                `  SPARQL: ${b.s.value.slice(-6)} datatype=${
                    b.d.datatype ?? "(none)"
                }`
            );
    }

    /** Question 2: remove one item, leaving the other and the list alone. */
    async function removeFirst() {
        if (!listDoc) return say("create the list first");
        const victim = `${listDoc}#rec-1`;
        await update(
            `${PREFIXES}
             DELETE WHERE { GRAPH <${listDoc}> {
                <${listDoc}> schema:itemListElement <${victim}> } } ;
             DELETE WHERE { GRAPH <${listDoc}> { <${victim}> ?p ?o } }`,
            listDoc
        );
        await new Promise((r) => setTimeout(r, 800));
        const rows = await select(
            `${PREFIXES}
             SELECT ?s WHERE { GRAPH <${listDoc}> { ?s a app:Recommendation } }`
        );
        const list = await select(
            `${PREFIXES}
             SELECT ?n WHERE { GRAPH <${listDoc}> {
                <${listDoc}> a schema:ItemList ; schema:name ?n } }`
        );
        say(
            `after deleting one: ${rows.length} item(s) in the store, ` +
                `${mine.length} in the subscription, list itself ` +
                (list.length ? "intact" : "GONE")
        );
    }

    /** Leave the store as we found it. */
    async function cleanUp() {
        if (!listDoc) return say("nothing to clean");
        await update(`DELETE WHERE { GRAPH <${listDoc}> { ?s ?p ?o } }`, listDoc);
        say("deleted the spike's list document");
        listDoc = undefined;
    }
</script>

<div>
    <h2 class="text-lg font-semibold">Spike 10 — one doc, many mutable subjects</h2>
    <div class="flex flex-wrap gap-2 my-2">
        <button class="btn btn-sm" onclick={createList}>1 · list + one item</button>
        <button class="btn btn-sm" onclick={appendSibling}>2 · append a sibling</button>
        <button class="btn btn-sm" onclick={inspect}>3 · what comes back</button>
        <button class="btn btn-sm" onclick={removeFirst}>4 · delete one item</button>
        <button class="btn btn-sm" onclick={cleanUp}>5 · clean up</button>
    </div>

    <p class="text-xs opacity-60">
        spike items in the subscription: {mine.length}
    </p>

    <pre class="text-xs bg-base-200 p-2 rounded max-h-72 overflow-y-auto">{log.join("\n")}</pre>
</div>
