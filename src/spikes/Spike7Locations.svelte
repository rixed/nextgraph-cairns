<script lang="ts">
    // Spike 7 — one predicate, two kinds of value (Specs §3.2, §3.3).
    //
    // A memory's schema:location is either a nested place with no URI of its
    // own, or a reference to a place document that has one. Spike 4 found that
    // shex-orm rejects a plural mixed union (object OR IRI); the all-object
    // union it suggested does compile (see locationSpike.shex). What is unknown
    // is the runtime half:
    //
    //   1. does a reference whose triples live in ANOTHER document appear in
    //      the memory's ORM view at all, and with its properties resolved?
    //   2. can such a reference be written through the ORM, or only by SPARQL?
    //   3. can the two branches be told apart when reading — a nested value
    //      should be in the memory's own graph, a reference in another?
    //
    // Whatever this answers decides how S-21, S-31, S-32 and S-33 are built.
    import { useShape } from "@ng-org/orm/svelte";
    import {
        SpikeMemoryShapeType,
        SpikeMemoryRefsShapeType,
        SpikePlaceRefShapeType,
    } from "../shapes/orm/locationSpike.shapeTypes";
    import type { SpikeMemory } from "../shapes/orm/locationSpike.typings";
    import { createGraphDoc, select, update, fmt } from "./spikeUtils";

    const PREFIXES = `PREFIX app: <did:ng:z:cairns/>
        PREFIX schema: <https://schema.org/>
        PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>`;

    let log = $state<string[]>([]);
    // Plain variables: NURIs go back over the bridge, so nothing proxied.
    let placeDoc: string | undefined;
    let personDoc: string | undefined;
    let memoryDoc: string | undefined;

    const memories = useShape(SpikeMemoryShapeType, "did:ng:i");
    // The other half of a join done by hand: every place, wherever it lives.
    const places = useShape(SpikePlaceRefShapeType, "did:ng:i");
    // The same memories read through a shape with no union in it.
    const asRefs = useShape(SpikeMemoryRefsShapeType, "did:ng:i");
    const spiked = $derived(
        ([...memories] as unknown as SpikeMemory[]).filter(
            (m) => m.name === "spike7-memory"
        )
    );

    const say = (s: string) => {
        log = [...log, s];
        console.log("[spike7]", s);
    };

    /** An identified place: its own document, its own URI (§3.2). */
    async function createPlace() {
        const t0 = performance.now();
        placeDoc = await createGraphDoc();
        await update(
            `${PREFIXES}
             INSERT DATA { GRAPH <${placeDoc}> {
                <${placeDoc}> a schema:Place ;
                    schema:name "Praça do Comércio" ;
                    geo:lat "38.7075"^^xsd:decimal ;
                    geo:long "-9.1364"^^xsd:decimal .
             } }`,
            placeDoc
        );
        personDoc = await createGraphDoc();
        await update(
            `${PREFIXES}
             INSERT DATA { GRAPH <${personDoc}> {
                <${personDoc}> a foaf:Person ; foaf:name "Ana" .
             } }`,
            personDoc
        );
        say(`place + person documents in ${fmt(performance.now() - t0)}`);
        say(`  place: ${placeDoc}`);
    }

    /**
     * One memory holding both kinds at once: a nested unnamed place written
     * into its own graph, and a reference to the place document.
     */
    async function createMemory() {
        if (!placeDoc || !personDoc) return say("create the place first");
        const t0 = performance.now();
        memoryDoc = await createGraphDoc();
        const nested = `${memoryDoc}#somewhere`;
        await update(
            `${PREFIXES}
             INSERT DATA { GRAPH <${memoryDoc}> {
                <${memoryDoc}> a app:Memory ;
                    schema:name "spike7-memory" ;
                    schema:location <${nested}> , <${placeDoc}> ;
                    schema:attendee <${personDoc}> .
                <${nested}> a schema:Place ;
                    schema:name "the beach below the road" ;
                    geo:lat "38.6800"^^xsd:decimal ;
                    geo:long "-9.3300"^^xsd:decimal .
             } }`,
            memoryDoc
        );
        say(`memory with both kinds of location in ${fmt(performance.now() - t0)}`);
    }

    /** What does the ORM actually hand back? */
    function inspect() {
        if (!spiked.length) return say("no spike memory in the subscription yet");
        for (const m of spiked) {
            const locs = [...(m.location ?? [])];
            say(`memory ${m["@graph"].slice(0, 24)}… has ${locs.length} location(s)`);
            for (const l of locs as any[]) {
                const nestedHere = l["@graph"] === m["@graph"];
                say(
                    `  ${nestedHere ? "nested" : "REFERENCE"} — name=${JSON.stringify(l.name)} ` +
                        `lat=${JSON.stringify(l.lat)} graph=${l["@graph"]?.slice(0, 20)}… id=${l["@id"]?.slice(0, 20)}…`
                );
            }
            const people = [...(m.attendee ?? [])] as any[];
            say(`  ${people.length} attendee(s)`);
            for (const p of people)
                say(
                    `  ${p["@graph"] === m["@graph"] ? "nested" : "REFERENCE"} — name=${JSON.stringify(p.name)}`
                );
        }
    }

    /** The same triples, read through `schema:location IRI *` instead. */
    function inspectAsRefs() {
        const mine = ([...asRefs] as any[]).filter(
            (m) => m.name === "spike7-memory"
        );
        if (!mine.length) return say("no spike memory through the refs shape");
        for (const m of mine) {
            const locs = [...(m.location ?? [])] as string[];
            const people = [...(m.attendee ?? [])] as string[];
            say(`as plain IRIs: ${locs.length} location(s), ${people.length} attendee(s)`);
            for (const iri of locs) {
                const p = ([...places] as any[]).find((x) => x["@id"] === iri);
                const inMemoryDoc = iri.startsWith(m["@graph"]);
                say(
                    `  ${inMemoryDoc ? "in the memory's own document" : "another document"}` +
                        ` → ${p ? JSON.stringify(p.name) : "no place shape matched"}`
                );
            }
        }
    }

    /** Can a reference be added through the ORM, rather than by SPARQL? */
    async function addRefThroughOrm() {
        if (!spiked.length || !placeDoc) return say("create both first");
        const m = spiked[0] as any;
        try {
            m.location ??= new Set();
            m.location.add({ "@id": placeDoc });
            await Promise.resolve();
            say("ORM add({'@id': …}) did not throw");
        } catch (e) {
            say(`ORM add threw: ${e}`);
        }
        const rows = await select(
            `${PREFIXES}
             SELECT ?loc WHERE { GRAPH <${m["@graph"]}> {
                <${m["@graph"]}> schema:location ?loc } }`
        );
        say(
            `triples now: ${rows.map((r: any) => r.loc.value.slice(0, 28) + "…").join(" | ")}`
        );
    }

    /**
     * Round two. The first round wrote everything by SPARQL and the ORM showed
     * nothing, so this writes the nested place the way spike 4 did — through
     * the ORM, letting the engine mint the subject — to find out whether the
     * invisibility is about how it was written or about what it is.
     */
    async function nestedThroughOrm() {
        if (!spiked.length) return say("create the memory first");
        const m = spiked[0] as any;
        try {
            m.location ??= new Set();
            m.location.add({
                "@id": "",
                "@type": new Set(["https://schema.org/Place"]),
                name: "the lay-by with the fig tree",
                lat: 38.61,
                long: -9.05,
            });
            await Promise.resolve();
            say("added a nested place through the ORM");
        } catch (e) {
            say(`ORM nested add threw: ${e}`);
        }
        const rows = await select(
            `${PREFIXES}
             SELECT ?s ?p ?o WHERE { GRAPH <${m["@graph"]}> { ?s ?p ?o } }`
        );
        const subjects = new Set(rows.map((r: any) => r.s.value));
        say(`subjects now in the memory's graph: ${subjects.size}`);
        for (const s of subjects) say(`  ${s}`);
    }

    /**
     * The practical question if references do not resolve: can the app join
     * them itself, from a second subscription keyed on the same IRI?
     */
    function resolveByHand() {
        if (!spiked.length) return say("nothing to resolve");
        const all = [...places] as any[];
        say(`${all.length} place(s) visible through the place shape`);
        for (const m of spiked) {
            for (const l of [...(m.location ?? [])] as any[]) {
                const found = all.find((p) => p["@id"] === l["@id"]);
                say(
                    `  location ${l["@id"]?.slice(-12)} → ${
                        found
                            ? `resolved by hand: ${JSON.stringify(found.name)}`
                            : "not found in the place subscription"
                    }`
                );
            }
        }
    }

    /** Leave the store as we found it. */
    async function cleanUp() {
        for (const doc of [memoryDoc, placeDoc, personDoc]) {
            if (!doc) continue;
            await update(`DELETE WHERE { GRAPH <${doc}> { ?s ?p ?o } }`, doc);
        }
        say("deleted the spike's documents");
        memoryDoc = placeDoc = personDoc = undefined;
    }
</script>

<div>
    <h2 class="text-lg font-semibold">Spike 7 — nested value or reference</h2>
    <div class="flex flex-wrap gap-2 my-2">
        <button class="btn btn-sm" onclick={createPlace}>1 · place + person docs</button>
        <button class="btn btn-sm" onclick={createMemory}>2 · memory with both</button>
        <button class="btn btn-sm" onclick={inspect}>3 · what the ORM returns</button>
        <button class="btn btn-sm" onclick={inspectAsRefs}>3b · read as plain IRIs</button>
        <button class="btn btn-sm" onclick={addRefThroughOrm}>4 · add a reference via ORM</button>
        <button class="btn btn-sm" onclick={nestedThroughOrm}>4b · nested via ORM</button>
        <button class="btn btn-sm" onclick={resolveByHand}>4c · join by hand</button>
        <button class="btn btn-sm" onclick={cleanUp}>5 · clean up</button>
    </div>

    <p class="text-xs opacity-60">
        live spike memories in the subscription: {spiked.length}
    </p>

    <pre class="text-xs bg-base-200 p-2 rounded max-h-72 overflow-y-auto">{log.join("\n")}</pre>
</div>
