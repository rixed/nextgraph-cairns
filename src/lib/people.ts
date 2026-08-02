// People (Specs §3.3). A memory's `schema:attendee` holds plain IRIs, exactly
// as `schema:location` does, and the two kinds of value are told apart by the
// document they live in rather than by their shape:
//
//   - a **contact** has a record in the shared people document (§5), a
//     user-owned document this app appends to and never restructures;
//   - a **bare name** is a subject inside the memory's own document, carrying
//     a name and nothing else — a name with no record behind it.
//
// Promotion turns the second into the first and rewrites every memory that
// used the same string (§3.3). Spike 8 found that one `sparql_update` reaching
// every affected graph is rejected whole when any part of it is bad, where a
// per-document loop leaves a split archive — so promotion is one update, and
// there is no half-promoted state for the app to repair.

import { useShape } from "@ng-org/orm/svelte";
import { OrmSubscription, normalizeScope } from "@ng-org/orm";
import { sessionPromise } from "./ngSession";
import { PersonShapeType } from "../shapes/orm/personShape.shapeTypes";
import type { Person as PersonShape } from "../shapes/orm/personShape.typings";
import { SPARQL_PREFIXES, stringLiteral } from "./typedLiterals";

const FOAF = "http://xmlns.com/foaf/0.1/";

/** A person as the app cares about them, flattened from the shape. */
export interface Person {
    /** The document the triples live in — a memory's, for a bare name. */
    doc: string;
    /** The subject IRI: what a memory's `schema:attendee` holds. */
    id: string;
    name?: string;
    image?: string;
}

export function toPerson(p: PersonShape): Person {
    return {
        doc: p["@graph"],
        id: p["@id"],
        name: p.name,
        image: p.image,
    };
}

/** Call during component initialisation, like any other subscription hook. */
export function useAllPeople() {
    const people = useShape(PersonShapeType, "did:ng:i");
    return {
        get all(): Person[] {
            return ([...people] as unknown as PersonShape[]).map(toPerson);
        },
    };
}

/** Resolves once the people subscription has delivered its first answer. */
export function peopleReady(): Promise<unknown> {
    return OrmSubscription.getOrCreate(
        PersonShapeType as any,
        normalizeScope("did:ng:i")
    ).readyPromise;
}

/**
 * Two people are the same person, for the app's purposes, when they carry the
 * same name — which is exactly the claim §3.3 makes when it promotes every
 * memory using a string at once. A person with no name yet is only themselves.
 *
 * Two real people who share a name are handled afterwards, by reassigning
 * individual memories (§3.3); nothing here pretends otherwise.
 */
export function personKey(p: Person | undefined, iri: string): string {
    const name = p?.name?.trim().toLowerCase();
    return name ? `name:${name}` : `iri:${iri}`;
}

export function findPerson(all: Person[], iri: string): Person | undefined {
    return all.find((p) => p.id === iri);
}

/** What to show for an attendee: their name, else that they are unresolved. */
export function personLabel(p: Person | undefined, iri: string): string {
    if (p?.name?.trim()) return p.name;
    return iri.includes("#") ? "someone" : "a contact not synced here yet";
}

/**
 * A bare name is a person whose triples live in one of the app's own memory
 * documents. Anything else — the shared people document, or a record another
 * application published — is a contact.
 */
export function isBareName(p: Person, memoryDocs: Set<string>): boolean {
    return memoryDocs.has(p.doc);
}

export interface PersonGroup {
    key: string;
    name: string;
    /** Every IRI that stands for this person, across memories. */
    iris: string[];
    /** The contact record, when one exists. */
    contact?: Person;
    /** Memory documents they appear in. */
    memories: string[];
}

/**
 * People as the app shows them: one entry per person, merging the bare names
 * that share a string with each other and with the contact of that name. This
 * is what makes S-60 legible before anything has been promoted, and what
 * promotion then makes true in the data.
 */
export function groupPeople(
    all: Person[],
    memories: { doc: string; attendees: string[] }[],
    memoryDocs: Set<string>
): PersonGroup[] {
    const byKey = new Map<string, PersonGroup>();
    const add = (iri: string, memoryDoc?: string) => {
        const person = findPerson(all, iri);
        const key = personKey(person, iri);
        const group =
            byKey.get(key) ??
            byKey
                .set(key, {
                    key,
                    name: personLabel(person, iri),
                    iris: [],
                    memories: [],
                })
                .get(key)!;
        if (!group.iris.includes(iri)) group.iris.push(iri);
        if (person && !isBareName(person, memoryDocs) && !group.contact)
            group.contact = person;
        if (memoryDoc && !group.memories.includes(memoryDoc))
            group.memories.push(memoryDoc);
        return group;
    };
    for (const m of memories) for (const iri of m.attendees) add(iri, m.doc);
    // A contact nobody has been in a memory with is still someone you know.
    for (const p of all) if (!isBareName(p, memoryDocs)) add(p.id);
    return [...byKey.values()].sort(
        (a, b) =>
            b.memories.length - a.memories.length ||
            a.name.localeCompare(b.name)
    );
}

/**
 * Every bare name standing for this person, and the memory that holds it —
 * what promotion has to rewrite (§3.3). A contact reference is not an
 * occurrence: it is already what promotion produces.
 */
export function bareOccurrences(
    key: string,
    all: Person[],
    memories: { doc: string; attendees: string[] }[],
    memoryDocs: Set<string>
): { memoryDoc: string; iri: string }[] {
    const out: { memoryDoc: string; iri: string }[] = [];
    for (const m of memories)
        for (const iri of m.attendees) {
            const p = findPerson(all, iri);
            if (!p || !isBareName(p, memoryDocs)) continue;
            if (personKey(p, iri) === key) out.push({ memoryDoc: m.doc, iri });
        }
    return out;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** What the editor holds until saved, and what the picker returns. */
export type AttendeeDraft =
    | { kind: "contact"; iri: string }
    | { kind: "bare"; name: string };

/** The draft that represents an attendee already stored on a memory. */
export function attendeeDraftOf(
    iri: string,
    all: Person[],
    memoryDocs: Set<string>
): AttendeeDraft {
    const p = findPerson(all, iri);
    if (p && isBareName(p, memoryDocs))
        return { kind: "bare", name: p.name ?? "" };
    return { kind: "contact", iri };
}

/**
 * The triples a memory's attendees contribute to its own document. Bare names
 * are numbered by position, like unnamed places: the IRI is derived, and is
 * not identity — which is the whole of what §3.3 says about them.
 */
export function attendeeTriples(
    subject: string,
    attendees: AttendeeDraft[]
): string[] {
    const t: string[] = [];
    attendees.forEach((a, i) => {
        if (a.kind === "contact") {
            t.push(`<${subject}> schema:attendee <${a.iri}>`);
            return;
        }
        const name = a.name.trim();
        if (!name) return;
        const iri = `${subject}#person-${i}`;
        t.push(`<${subject}> schema:attendee <${iri}>`);
        t.push(`<${iri}> a foaf:Person`);
        t.push(`<${iri}> foaf:name ${stringLiteral(name)}`);
    });
    return t;
}

/** Bare names are rewritten wholesale with the memory that holds them. */
export function dropBareNames(doc: string): string {
    return `DELETE WHERE { GRAPH <${doc}> { ?p a foaf:Person ; ?x ?y } }`;
}

let peopleDocPromise: Promise<string> | undefined;

/** The shared people document, created on first use (§5, B-03). */
export function peopleDoc(): Promise<string> {
    return (peopleDocPromise ??= findOrCreatePeopleDoc());
}

async function findOrCreatePeopleDoc(): Promise<string> {
    const s = await sessionPromise;
    const ret = await s.ng.sparql_query(
        s.session_id,
        `SELECT ?doc WHERE { GRAPH ?doc { ?s a <${FOAF}Group> } }`,
        undefined,
        undefined
    );
    const found = ret?.results?.bindings?.[0]?.doc?.value;
    if (found) return found;

    const doc: string = await s.ng.doc_create(
        s.session_id,
        "Graph",
        "data:graph",
        "store",
        undefined
    );
    await s.ng.sparql_update(
        s.session_id,
        `${SPARQL_PREFIXES}
         INSERT DATA { GRAPH <${doc}> {
            <${doc}> a foaf:Group ;
                schema:name ${stringLiteral("People")} .
         } }`,
        doc
    );
    return doc;
}

/** A contact IRI inside the shared document. Derived, unguessable, stable. */
function mintContactIri(doc: string): string {
    const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    return `${doc}#p-${rand}`;
}

/**
 * Promote a bare name to a contact and rewrite every memory that used it —
 * §3.3, in **one update over every affected graph** (spike 8). Nothing is
 * written at all if any part of it fails, so there is no state where half the
 * archive knows this person and half does not.
 *
 * Returns the contact's IRI.
 */
export async function promoteBareName(
    name: string,
    occurrences: { memoryDoc: string; iri: string }[]
): Promise<string> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("a bare name needs a name");
    const doc = await peopleDoc();
    const contact = mintContactIri(doc);
    const s = await sessionPromise;

    const ops: string[] = [];
    for (const { memoryDoc, iri } of occurrences) {
        ops.push(
            `DELETE WHERE { GRAPH <${memoryDoc}> {
                <${memoryDoc}> schema:attendee <${iri}> } }`,
            `DELETE WHERE { GRAPH <${memoryDoc}> { <${iri}> ?p ?o } }`
        );
    }
    const inserts = [
        `GRAPH <${doc}> {
            <${contact}> a foaf:Person ; foaf:name ${stringLiteral(trimmed)} .
            <${doc}> foaf:member <${contact}> . }`,
        ...occurrences.map(
            ({ memoryDoc }) =>
                `GRAPH <${memoryDoc}> {
                    <${memoryDoc}> schema:attendee <${contact}> . }`
        ),
    ];
    ops.push(`INSERT DATA {\n${inserts.join("\n")}\n}`);

    await s.ng.sparql_update(
        s.session_id,
        `${SPARQL_PREFIXES}\n${ops.join(" ;\n")}`,
        // Undefined rather than one document's NURI: this update belongs to no
        // single document, and spike 8 found both forms reach every graph.
        undefined
    );
    return contact;
}

/** Append a contact nobody has been in a memory with yet. */
export async function createContact(name: string): Promise<string> {
    return promoteBareName(name, []);
}
