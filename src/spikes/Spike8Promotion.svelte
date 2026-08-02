<script lang="ts">
    // Spike 8 — what a write across many documents actually costs (B-06).
    //
    // Specs §3.3: promoting a bare name mints a contact URI and rewrites
    // **every** memory using the same string, "silently and without
    // confirmation". Appendix A calls the cost "unknown until exercised", and
    // the whole People slice rests on it. Four questions:
    //
    //   1. is there a multi-document write at all — does one sparql_update
    //      touching several GRAPHs apply to all of them, or only to the one
    //      the nuri names?
    //   2. what does a promotion of realistic size cost, sequentially and
    //      concurrently?
    //   3. what does a partial failure leave behind — is there any rollback,
    //      or is a half-promoted archive a state the app must handle?
    //   4. what does a reader see mid-flight? A subscription open across the
    //      rewrite either sees the archive change under it, or it does not.
    //
    // Whatever this answers decides whether promotion can stay silent (§3.3)
    // or needs a progress state and a repair path of its own.
    import { useShape } from "@ng-org/orm/svelte";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import type { Memory } from "../shapes/orm/memoryShape.typings";
    import { createGraphDoc, select, update, fmt } from "./spikeUtils";

    const PREFIXES = `PREFIX app: <did:ng:z:cairns/>
        PREFIX schema: <https://schema.org/>
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>`;

    let log = $state<string[]>([]);
    let count = $state(20);
    // Plain variables: NURIs cross the bridge, so nothing proxied.
    let memoryDocs: string[] = [];
    let contactDoc: string | undefined;

    const memories = useShape(MemoryShapeType, "did:ng:i");
    const spiked = $derived(
        ([...memories] as unknown as Memory[]).filter((m) =>
            m.name?.startsWith("spike8-")
        )
    );

    const say = (s: string) => {
        log = [...log, s];
        console.log("[spike8]", s);
    };

    /** How many of the spike's memories name a contact rather than a bare name. */
    const promotedNow = $derived(
        spiked.filter((m) =>
            [...(m.attendee ?? [])].some((iri) => !iri.includes("#"))
        ).length
    );

    /** N memories, each with the same bare name nested in its own document. */
    async function seed() {
        const t0 = performance.now();
        memoryDocs = [];
        for (let i = 0; i < count; i++) {
            const doc = await createGraphDoc();
            await update(
                `${PREFIXES}
                 INSERT DATA { GRAPH <${doc}> {
                    <${doc}> a app:Memory , schema:Event ;
                        schema:name "spike8-${i}" ;
                        schema:startDate "2019-08-14"^^xsd:date ;
                        schema:attendee <${doc}#person-0> .
                    <${doc}#person-0> a foaf:Person ; foaf:name "Ana" .
                 } }`,
                doc
            );
            memoryDocs.push(doc);
        }
        const ms = performance.now() - t0;
        say(`seeded ${count} memories in ${fmt(ms)} (${fmt(ms / count)} each)`);
    }

    /** The contact the bare name is promoted to: its own document (§3.3). */
    async function makeContact() {
        contactDoc = await createGraphDoc();
        await update(
            `${PREFIXES}
             INSERT DATA { GRAPH <${contactDoc}> {
                <${contactDoc}> a foaf:Person ; foaf:name "Ana" .
             } }`,
            contactDoc
        );
        say(`contact document: ${contactDoc}`);
    }

    /** The rewrite one memory needs — what people.ts will issue. */
    function promoteOps(doc: string, contact: string): string {
        return `${PREFIXES}
            DELETE WHERE { GRAPH <${doc}> { <${doc}> schema:attendee ?a } } ;
            DELETE WHERE { GRAPH <${doc}> { ?p a foaf:Person ; ?x ?y } } ;
            INSERT DATA { GRAPH <${doc}> {
                <${doc}> schema:attendee <${contact}> } }`;
    }

    /**
     * Question 1: can one update touch many documents? If it can, "best
     * effort across N writes" is not the only option on the table.
     */
    async function oneUpdateManyGraphs() {
        if (!contactDoc || memoryDocs.length < 2) return say("seed first");
        const [a, b] = memoryDocs;
        const both = `${PREFIXES}
            INSERT DATA {
                GRAPH <${a}> { <${a}> schema:knows <${contactDoc}> }
                GRAPH <${b}> { <${b}> schema:knows <${contactDoc}> }
            }`;
        for (const [label, nuri] of [
            ["nuri = the first document", a],
            ["nuri = undefined", undefined],
        ] as const) {
            try {
                await update(both, nuri);
                const rows = await select(
                    `${PREFIXES}
                     SELECT ?g WHERE { GRAPH ?g { ?s schema:knows <${contactDoc}> } }`
                );
                const hit = new Set(rows.map((r: any) => r.g.value));
                say(
                    `${label}: landed in ${hit.size} document(s)` +
                        ` — first=${hit.has(a)} second=${hit.has(b)}`
                );
            } catch (e) {
                say(`${label}: threw ${String(e).slice(0, 120)}`);
            }
            await update(
                `${PREFIXES} DELETE WHERE { GRAPH ?g { ?s schema:knows ?o } }`,
                a
            );
        }
    }

    /** Question 2a, and question 4 alongside it: cost, and what a reader sees. */
    async function promoteSequentially() {
        if (!contactDoc || !memoryDocs.length) return say("seed first");
        const t0 = performance.now();
        const samples: number[] = [];
        for (const doc of memoryDocs) {
            await update(promoteOps(doc, contactDoc), doc);
            // What the open subscription reports *while* the rewrite runs.
            samples.push(promotedNow);
        }
        const ms = performance.now() - t0;
        say(
            `sequential: ${memoryDocs.length} documents in ${fmt(ms)}` +
                ` (${fmt(ms / memoryDocs.length)} each)`
        );
        const partial = samples.filter(
            (n) => n > 0 && n < memoryDocs.length
        ).length;
        say(
            `reader saw a half-promoted archive in ${partial} of ${samples.length} samples` +
                ` — [${samples.join(",")}]`
        );
    }

    /** Question 2b: does issuing them together help? */
    async function promoteConcurrently() {
        if (!contactDoc || !memoryDocs.length) return say("seed first");
        // Put the bare name back first, so this measures the same work.
        await Promise.all(
            memoryDocs.map((doc) =>
                update(
                    `${PREFIXES}
                     DELETE WHERE { GRAPH <${doc}> { <${doc}> schema:attendee ?a } } ;
                     INSERT DATA { GRAPH <${doc}> {
                        <${doc}> schema:attendee <${doc}#person-0> .
                        <${doc}#person-0> a foaf:Person ; foaf:name "Ana" . } }`,
                    doc
                )
            )
        );
        const t0 = performance.now();
        const results = await Promise.allSettled(
            memoryDocs.map((doc) => update(promoteOps(doc, contactDoc!), doc))
        );
        const ms = performance.now() - t0;
        const failed = results.filter((r) => r.status === "rejected").length;
        say(
            `concurrent: ${memoryDocs.length} documents in ${fmt(ms)}` +
                ` (${fmt(ms / memoryDocs.length)} each), ${failed} rejected`
        );
    }

    /**
     * Question 3: a promotion that fails in the middle. Best-effort is only a
     * usable answer if what got through stays through.
     */
    async function partialFailure() {
        if (!contactDoc || memoryDocs.length < 5) return say("seed 5+ first");
        const batch = memoryDocs.slice(0, 5);
        // Put the bare name back on this batch, so the failure is visible.
        for (const doc of batch)
            await update(
                `${PREFIXES}
                 DELETE WHERE { GRAPH <${doc}> { <${doc}> schema:attendee ?a } } ;
                 INSERT DATA { GRAPH <${doc}> {
                    <${doc}> schema:attendee <${doc}#person-0> .
                    <${doc}#person-0> a foaf:Person ; foaf:name "Ana" . } }`,
                doc
            );
        let stopped = -1;
        for (let i = 0; i < batch.length; i++) {
            const query =
                i === 2
                    ? `${PREFIXES} INSERT DATA { GRAPH <${batch[i]}> { <${batch[i]}> schema:attendee } }`
                    : promoteOps(batch[i], contactDoc);
            try {
                await update(query, batch[i]);
            } catch (e) {
                stopped = i;
                say(`document ${i} rejected: ${String(e).slice(0, 140)}`);
                break;
            }
        }
        const rows = await select(
            `${PREFIXES}
             SELECT ?doc ?a WHERE { GRAPH ?doc {
                ?m schema:name ?n ; schema:attendee ?a .
                FILTER(STRSTARTS(?n, "spike8-")) } }`
        );
        const promoted = rows.filter(
            (r: any) => !r.a.value.includes("#")
        ).length;
        say(
            `after stopping at ${stopped}: ${promoted} of ${memoryDocs.length}` +
                ` memories point at the contact — the rest still name the bare person`
        );
        say(
            promoted > 0 && promoted < memoryDocs.length
                ? "→ no rollback: a failed promotion leaves the archive split"
                : "→ nothing was left half-written"
        );
    }

    /** Put the bare name back, so a measurement repeats the same work. */
    async function resetBareNames(docs: string[]) {
        await Promise.all(
            docs.map((doc) =>
                update(
                    `${PREFIXES}
                     DELETE WHERE { GRAPH <${doc}> { <${doc}> schema:attendee ?a } } ;
                     INSERT DATA { GRAPH <${doc}> {
                        <${doc}> schema:attendee <${doc}#person-0> .
                        <${doc}#person-0> a foaf:Person ; foaf:name "Ana" . } }`,
                    doc
                )
            )
        );
    }

    /** Every graph rewritten by one update, since round one found that legal. */
    function oneUpdateForAll(docs: string[], contact: string): string {
        const ops = docs.flatMap((doc) => [
            `DELETE WHERE { GRAPH <${doc}> { <${doc}> schema:attendee ?a } }`,
            `DELETE WHERE { GRAPH <${doc}> { ?p a foaf:Person ; ?x ?y } }`,
        ]);
        ops.push(
            `INSERT DATA {\n` +
                docs
                    .map(
                        (doc) =>
                            `  GRAPH <${doc}> { <${doc}> schema:attendee <${contact}> }`
                    )
                    .join("\n") +
                `\n}`
        );
        return `${PREFIXES}\n${ops.join(" ;\n")}`;
    }

    /**
     * Round two, question 1: if the whole promotion is one update, does the
     * reader still see it half-done? Sampled while the update is in flight,
     * because that is the only moment the answer exists.
     */
    async function promoteInOneUpdate() {
        if (!contactDoc || !memoryDocs.length) return say("seed first");
        await resetBareNames(memoryDocs);
        const seen: number[] = [];
        const poll = setInterval(() => seen.push(promotedNow), 5);
        const t0 = performance.now();
        try {
            await update(oneUpdateForAll(memoryDocs, contactDoc), undefined);
        } catch (e) {
            clearInterval(poll);
            return say(`one update for all threw: ${String(e).slice(0, 160)}`);
        }
        const ms = performance.now() - t0;
        clearInterval(poll);
        const partial = new Set(
            seen.filter((n) => n > 0 && n < memoryDocs.length)
        );
        say(
            `one update, ${memoryDocs.length} graphs: ${fmt(ms)}` +
                ` (${fmt(ms / memoryDocs.length)} each)`
        );
        say(
            `reader sampled ${seen.length} times mid-update; intermediate counts seen: ` +
                (partial.size ? [...partial].join(",") : "none")
        );
        const rows = await select(
            `${PREFIXES}
             SELECT (COUNT(*) AS ?n) WHERE { GRAPH ?g {
                ?m schema:attendee <${contactDoc}> } }`
        );
        say(`after it returned: ${rows[0]?.n?.value} memories point at the contact`);
    }

    /**
     * Round two, question 2: one bad graph among many. If the good ones land
     * anyway, a multi-graph update is a convenience and not a transaction —
     * and promotion still needs a repair path.
     */
    async function oneBadGraphAmongMany() {
        if (!contactDoc || memoryDocs.length < 3) return say("seed 3+ first");
        await resetBareNames(memoryDocs);
        const bogus =
            "did:ng:o:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:v:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
        const docs = memoryDocs.slice(0, 3);
        const query =
            `${PREFIXES}\n` +
            [
                `INSERT DATA { GRAPH <${docs[0]}> { <${docs[0]}> schema:attendee <${contactDoc}> } }`,
                `INSERT DATA { GRAPH <${bogus}> { <${bogus}> schema:attendee <${contactDoc}> } }`,
                `INSERT DATA { GRAPH <${docs[2]}> { <${docs[2]}> schema:attendee <${contactDoc}> } }`,
            ].join(" ;\n");
        try {
            await update(query, undefined);
            say("an update naming a document that does not exist did not throw");
        } catch (e) {
            say(`rejected: ${String(e).slice(0, 160)}`);
        }
        const rows = await select(
            `${PREFIXES}
             SELECT ?g WHERE { GRAPH ?g { ?m schema:attendee <${contactDoc}> } }`
        );
        const hit = new Set(rows.map((r: any) => r.g.value));
        say(
            `of the two real documents: first=${hit.has(docs[0])} third=${hit.has(docs[2])}` +
                ` → ${
                    hit.has(docs[0]) || hit.has(docs[2])
                        ? "not a transaction: what could be written was"
                        : "all-or-nothing: nothing was written"
                }`
        );
    }

    /** Leave the store as we found it. */
    async function cleanUp() {
        for (const doc of [...memoryDocs, contactDoc]) {
            if (!doc) continue;
            await update(`DELETE WHERE { GRAPH <${doc}> { ?s ?p ?o } }`, doc);
        }
        say(`deleted ${memoryDocs.length + (contactDoc ? 1 : 0)} documents`);
        memoryDocs = [];
        contactDoc = undefined;
    }
</script>

<div>
    <h2 class="text-lg font-semibold">
        Spike 8 — promotion across many documents (B-06)
    </h2>
    <div class="flex flex-wrap gap-2 my-2 items-center">
        <input
            class="input input-bordered input-sm w-20"
            type="number"
            bind:value={count}
        />
        <button class="btn btn-sm" onclick={seed}>1 · seed memories</button>
        <button class="btn btn-sm" onclick={makeContact}>2 · contact doc</button>
        <button class="btn btn-sm" onclick={oneUpdateManyGraphs}>
            3 · one update, many graphs
        </button>
        <button class="btn btn-sm" onclick={promoteSequentially}>
            4 · promote in sequence
        </button>
        <button class="btn btn-sm" onclick={promoteConcurrently}>
            5 · promote together
        </button>
        <button class="btn btn-sm" onclick={partialFailure}>
            6 · fail in the middle
        </button>
        <button class="btn btn-sm" onclick={promoteInOneUpdate}>
            7 · all in one update
        </button>
        <button class="btn btn-sm" onclick={oneBadGraphAmongMany}>
            8 · one bad graph among many
        </button>
        <button class="btn btn-sm" onclick={cleanUp}>9 · clean up</button>
    </div>

    <p class="text-xs opacity-60">
        live spike memories: {spiked.length} · promoted as the subscription
        sees it: {promotedNow}
    </p>

    <pre class="text-xs bg-base-200 p-2 rounded max-h-72 overflow-y-auto">{log.join("\n")}</pre>
</div>
