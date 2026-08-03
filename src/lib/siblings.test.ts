import { describe, expect, it } from "vitest";
import { siblingGroups, type SiblingContext } from "./siblings";
import type { Person } from "./people";
import type { Memory } from "../shapes/orm/memoryShape.typings";

const memory = (
    doc: string,
    fields: Partial<Memory> & { startDate: string }
): Memory =>
    ({
        "@graph": doc,
        "@id": doc,
        "@type": new Set(["did:ng:z:cairns/Memory"]),
        ...fields,
    }) as Memory;

const person = (id: string, name?: string): Person => ({ doc: id, id, name });

const ctx = (people: Person[] = []): SiblingContext => ({ people });

const SINTRA = "did:ng:o:sintra";
const LISBON = "did:ng:o:lisbon";
const SURF = "did:ng:o:tag-surf";
const FESTA = "did:ng:o:festa";

describe("siblings by place", () => {
    const here = memory("did:ng:o:a", {
        startDate: "2024-05-02",
        location: new Set([SINTRA]),
    });
    const also = memory("did:ng:o:b", {
        startDate: "2023-01-01",
        location: new Set([SINTRA]),
    });
    const elsewhere = memory("did:ng:o:c", {
        startDate: "2024-06-01",
        location: new Set([LISBON]),
    });

    it("groups the memories at the same place", () => {
        const g = siblingGroups(here, [here, also, elsewhere], ctx());
        expect(g).toHaveLength(1);
        expect(g[0].facet).toBe("place");
        expect(g[0].via).toBe(SINTRA);
        expect(g[0].members.map((m) => m["@graph"])).toEqual(["did:ng:o:b"]);
    });

    it("never lists the memory in hand as its own sibling", () => {
        const twin = memory("did:ng:o:a", {
            startDate: "2024-05-02",
            location: new Set([SINTRA]),
        });
        const g = siblingGroups(here, [here, twin], ctx());
        expect(g).toHaveLength(0);
    });

    it("ignores unnamed places, whose IRIs are unique by construction", () => {
        const pinned = memory("did:ng:o:d", {
            startDate: "2024-05-02",
            location: new Set(["did:ng:o:d#place-0"]),
        });
        const other = memory("did:ng:o:e", {
            startDate: "2024-05-03",
            location: new Set(["did:ng:o:e#place-0"]),
        });
        expect(siblingGroups(pinned, [pinned, other], ctx())).toEqual([]);
    });
});

describe("siblings by person", () => {
    // Two bare names in two different memory documents, plus a contact: one
    // person, by §3.3's rule, and so one group.
    const ana = person("did:ng:o:people#ana", "Ana");
    const bareA = person("did:ng:o:a#person-0", "Ana");
    const bareB = person("did:ng:o:b#person-0", "ana");

    const here = memory("did:ng:o:a", {
        startDate: "2024-05-02",
        attendee: new Set(["did:ng:o:a#person-0"]),
    });
    const bare = memory("did:ng:o:b", {
        startDate: "2024-03-02",
        attendee: new Set(["did:ng:o:b#person-0"]),
    });
    const promoted = memory("did:ng:o:c", {
        startDate: "2024-04-02",
        attendee: new Set(["did:ng:o:people#ana"]),
    });

    it("merges bare names with the contact of the same name", () => {
        const g = siblingGroups(
            here,
            [here, bare, promoted],
            ctx([ana, bareA, bareB])
        );
        expect(g).toHaveLength(1);
        expect(g[0].facet).toBe("person");
        expect(g[0].via).toBe("name:ana");
        // Newest first.
        expect(g[0].members.map((m) => m["@graph"])).toEqual([
            "did:ng:o:c",
            "did:ng:o:b",
        ]);
    });

    it("keeps unresolved attendees apart", () => {
        const g = siblingGroups(here, [here, bare, promoted], ctx());
        expect(g).toEqual([]);
    });
});

describe("siblings by tag and by event", () => {
    const here = memory("did:ng:o:a", {
        startDate: "2024-05-02",
        subject: new Set([SURF, "did:ng:o:tag-rain"]),
        about: new Set([FESTA]),
    });
    const shared = memory("did:ng:o:b", {
        startDate: "2022-05-02",
        subject: new Set([SURF]),
        about: new Set([FESTA]),
    });
    const other = memory("did:ng:o:c", {
        startDate: "2025-05-02",
        subject: new Set(["did:ng:o:tag-food"]),
    });

    it("yields one group per shared value, and none for the unshared", () => {
        const g = siblingGroups(here, [here, shared, other], ctx());
        expect(g.map((x) => [x.facet, x.via])).toEqual([
            ["tag", SURF],
            ["event", FESTA],
        ]);
    });

    it("names the same memory once per reason, never twice for one", () => {
        // Two groups, one memory in each: the section is a list of reasons.
        const g = siblingGroups(here, [here, shared, other], ctx());
        expect(g.map((x) => x.members.map((m) => m["@graph"]))).toEqual([
            ["did:ng:o:b"],
            ["did:ng:o:b"],
        ]);
    });
});

describe("ordering", () => {
    const here = memory("did:ng:o:a", {
        startDate: "2024-05-02",
        location: new Set([SINTRA]),
        subject: new Set([SURF]),
    });
    const mk = (doc: string, startDate: string) =>
        memory(doc, {
            startDate,
            location: new Set([SINTRA]),
            subject: new Set([SURF]),
        });

    it("puts the largest group of the same facet first", () => {
        const all = [here, mk("did:ng:o:b", "2020-01-01")];
        // The tag is on both siblings, the place on one.
        all.push(
            memory("did:ng:o:c", {
                startDate: "2021-01-01",
                subject: new Set([SURF]),
            })
        );
        const g = siblingGroups(here, all, ctx());
        expect(g.map((x) => x.facet)).toEqual(["place", "tag"]);
        expect(g[1].members).toHaveLength(2);
    });

    it("sorts members newest first, undated last", () => {
        const undated = memory("did:ng:o:z", {
            startDate: "not a date",
            location: new Set([SINTRA]),
        });
        const g = siblingGroups(
            here,
            [here, mk("did:ng:o:b", "2020-01-01"), mk("did:ng:o:c", "2023-07"), undated],
            ctx()
        );
        expect(g[0].members.map((m) => m["@graph"])).toEqual([
            "did:ng:o:c",
            "did:ng:o:b",
            "did:ng:o:z",
        ]);
    });
});
