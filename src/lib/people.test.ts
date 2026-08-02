import { describe, expect, it } from "vitest";
import {
    attendeeDraftOf,
    attendeeTriples,
    bareOccurrences,
    groupPeople,
    isBareName,
    personKey,
    personLabel,
    type Person,
} from "./people";

const person = (doc: string, id: string, name?: string): Person => ({
    doc,
    id,
    name,
});

const MEM1 = "did:ng:o:mem1";
const MEM2 = "did:ng:o:mem2";
const PEOPLE_DOC = "did:ng:o:people";
const memoryDocs = new Set([MEM1, MEM2]);

describe("bare name or contact", () => {
    it("is decided by the document, not by the shape", () => {
        // Both are foaf:Person with a name; only one lives in a memory.
        expect(
            isBareName(person(MEM1, `${MEM1}#person-0`, "Ana"), memoryDocs)
        ).toBe(true);
        expect(
            isBareName(person(PEOPLE_DOC, `${PEOPLE_DOC}#p-1`, "Ana"), memoryDocs)
        ).toBe(false);
    });

    it("treats a person record from another application as a contact", () => {
        expect(
            isBareName(person("did:ng:o:someapp", "did:ng:o:someapp", "Ana"), memoryDocs)
        ).toBe(false);
    });
});

describe("personKey", () => {
    it("merges the same name written differently", () => {
        expect(personKey(person(MEM1, "a", " Ana "), "a")).toBe(
            personKey(person(MEM2, "b", "ana"), "b")
        );
    });

    it("keeps someone whose name has not arrived yet to themselves", () => {
        // §8, "partially loaded": a record can match its shape before its
        // name does, and two nameless people are not the same person.
        expect(personKey(undefined, "a")).not.toBe(personKey(undefined, "b"));
    });
});

describe("personLabel", () => {
    it("says what it cannot resolve rather than nothing", () => {
        expect(personLabel(undefined, `${MEM1}#person-0`)).toBe("someone");
        expect(personLabel(undefined, "did:ng:o:contact")).toMatch(
            /not synced/
        );
    });
});

describe("groupPeople", () => {
    const all = [
        person(MEM1, `${MEM1}#person-0`, "Ana"),
        person(MEM2, `${MEM2}#person-0`, "ana"),
        person(MEM2, `${MEM2}#person-1`, "Bruno"),
        person(PEOPLE_DOC, `${PEOPLE_DOC}#p-9`, "Chloé"),
    ];
    const memories = [
        { doc: MEM1, attendees: [`${MEM1}#person-0`] },
        {
            doc: MEM2,
            attendees: [`${MEM2}#person-0`, `${MEM2}#person-1`],
        },
    ];

    it("merges bare names that share a string across memories", () => {
        const groups = groupPeople(all, memories, memoryDocs);
        const ana = groups.find((g) => g.name.toLowerCase() === "ana")!;
        expect(ana.memories).toEqual([MEM1, MEM2]);
        expect(ana.iris).toHaveLength(2);
        expect(ana.contact).toBeUndefined();
    });

    it("orders by how many memories someone appears in", () => {
        const groups = groupPeople(all, memories, memoryDocs);
        expect(groups[0].memories.length).toBeGreaterThanOrEqual(
            groups[1].memories.length
        );
    });

    it("keeps a contact nobody has a memory with", () => {
        const groups = groupPeople(all, memories, memoryDocs);
        const chloe = groups.find((g) => g.name === "Chloé")!;
        expect(chloe.contact).toBeDefined();
        expect(chloe.memories).toEqual([]);
    });

    // Marked `fails` on purpose: this is what §3.3 requires and what the app
    // does not do — see the note on personKey. It passes while the behaviour is
    // wrong, and starts failing the day someone fixes it, which is the prompt
    // to delete the `.fails` rather than to discover the case again.
    it.fails("keeps two contact records that share a name apart", () => {
        const twoAnas = [
            person(PEOPLE_DOC, `${PEOPLE_DOC}#p-1`, "Ana Reis"),
            person(PEOPLE_DOC, `${PEOPLE_DOC}#p-2`, "Ana Reis"),
        ];
        const groups = groupPeople(twoAnas, [], memoryDocs);
        expect(groups).toHaveLength(2);
    });

    it("merges a bare name with the contact of the same name", () => {
        const withContact = [
            ...all,
            person(PEOPLE_DOC, `${PEOPLE_DOC}#p-1`, "Ana"),
        ];
        const groups = groupPeople(withContact, memories, memoryDocs);
        const ana = groups.filter((g) => g.name.toLowerCase() === "ana");
        expect(ana).toHaveLength(1);
        expect(ana[0].contact?.id).toBe(`${PEOPLE_DOC}#p-1`);
    });
});

describe("bareOccurrences", () => {
    const all = [
        person(MEM1, `${MEM1}#person-0`, "Ana"),
        person(MEM2, `${MEM2}#person-0`, "Ana"),
        person(PEOPLE_DOC, `${PEOPLE_DOC}#p-1`, "Ana"),
    ];
    const memories = [
        { doc: MEM1, attendees: [`${MEM1}#person-0`] },
        {
            doc: MEM2,
            // Already a contact here, plus a bare name of the same person.
            attendees: [`${MEM2}#person-0`, `${PEOPLE_DOC}#p-1`],
        },
    ];

    it("finds what a promotion has to rewrite, and nothing else", () => {
        const occ = bareOccurrences("name:ana", all, memories, memoryDocs);
        expect(occ).toEqual([
            { memoryDoc: MEM1, iri: `${MEM1}#person-0` },
            { memoryDoc: MEM2, iri: `${MEM2}#person-0` },
        ]);
    });
});

describe("attendeeTriples", () => {
    it("references a contact and writes nothing about them", () => {
        expect(
            attendeeTriples(MEM1, [
                { kind: "contact", iri: `${PEOPLE_DOC}#p-1` },
            ])
        ).toEqual([`<${MEM1}> schema:attendee <${PEOPLE_DOC}#p-1>`]);
    });

    it("writes a bare name into the memory's own document", () => {
        const t = attendeeTriples(MEM1, [{ kind: "bare", name: " Ana " }]);
        expect(t[0]).toBe(`<${MEM1}> schema:attendee <${MEM1}#person-0>`);
        expect(t).toContain(`<${MEM1}#person-0> foaf:name "Ana"`);
    });

    it("ignores an empty name rather than minting an empty person", () => {
        expect(attendeeTriples(MEM1, [{ kind: "bare", name: "   " }])).toEqual(
            []
        );
    });
});

describe("attendeeDraftOf", () => {
    const all = [
        person(MEM1, `${MEM1}#person-0`, "Ana"),
        person(PEOPLE_DOC, `${PEOPLE_DOC}#p-1`, "Bruno"),
    ];

    it("reads a bare name back as its string", () => {
        expect(attendeeDraftOf(`${MEM1}#person-0`, all, memoryDocs)).toEqual({
            kind: "bare",
            name: "Ana",
        });
    });

    it("reads a contact back as a reference", () => {
        expect(attendeeDraftOf(`${PEOPLE_DOC}#p-1`, all, memoryDocs)).toEqual({
            kind: "contact",
            iri: `${PEOPLE_DOC}#p-1`,
        });
    });

    it("treats an unresolved attendee as a contact, not as a lost name", () => {
        // A record that has not synced is still a reference to someone; the
        // alternative would rewrite it as an empty bare name on the next save.
        expect(attendeeDraftOf("did:ng:o:elsewhere", all, memoryDocs)).toEqual({
            kind: "contact",
            iri: "did:ng:o:elsewhere",
        });
    });
});
