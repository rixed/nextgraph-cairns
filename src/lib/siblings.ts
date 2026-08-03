// S-20's sibling sections (§6.2): the other memories at the same place, with
// the same people, sharing tags, or about the same public event.
//
// Pure derivation, like browseFilter — nothing here is stored, and nothing
// needs to be (§1.3.16). A sibling relation is just an equality between two
// memories' references, so it is recomputed from whatever has synced. That is
// also why it degrades correctly under §8: a place that has not arrived yet
// simply produces no group, rather than a wrong one.

import { compareIntervals, interval, parsePrecisionDate } from "./dates";
import { isIdentified } from "./places";
import { findPerson, personKey, type Person } from "./people";
import type { Memory } from "../shapes/orm/memoryShape.typings";

export type Facet = "place" | "person" | "tag" | "event";

/**
 * One shared thing and the memories that share it. `via` is the IRI of the
 * place, tag or event — for people it is a `personKey`, because a companion is
 * one person whether or not their bare names have been promoted (§3.3), the
 * same identity the browse filter's person facet uses.
 */
export interface SiblingGroup {
    facet: Facet;
    via: string;
    members: Memory[];
}

/** Everything the derivation needs beyond the memories themselves. */
export interface SiblingContext {
    people: Person[];
}

/**
 * What a memory shares with others, per facet.
 *
 * Locations are restricted to identified places. An unnamed one lives inside
 * its own memory's document as `<doc>#place-N` (§3.2), so its IRI is unique by
 * construction and could never match another memory's — offering it here would
 * be a facet that can never fire. Two dropped pins a street apart are S-22b's
 * business, where proximity is visible, not an equality join's.
 *
 * Tags match exactly, not up the hierarchy: `Portugal/Sintra` and `Portugal`
 * are different claims, and a broader match would make every memory in the
 * country a sibling of every other — which is what S-22a's tag filter is for.
 */
function keysOf(m: Memory, ctx: SiblingContext): Map<Facet, string[]> {
    return new Map<Facet, string[]>([
        ["place", [...(m.location ?? [])].filter(isIdentified)],
        [
            "person",
            [...(m.attendee ?? [])].map((iri) =>
                personKey(findPerson(ctx.people, iri), iri)
            ),
        ],
        ["tag", [...(m.subject ?? [])]],
        ["event", [...(m.about ?? [])]],
    ]);
}

/**
 * Newest first. The archive's own order is oldest first (§3.1 collation), but
 * a sibling list answers "when else did this happen?", and the answer that
 * matters most is usually the nearest one. Memories with no readable date sort
 * last rather than being dropped — the reference is still true (§1.3.15).
 */
function byRecency(a: Memory, b: Memory): number {
    const da = parsePrecisionDate(a.startDate);
    const db = parsePrecisionDate(b.startDate);
    if (!da || !db) return da ? -1 : db ? 1 : 0;
    return -compareIntervals(interval(da), interval(db));
}

export const FACET_ORDER: Facet[] = ["place", "person", "tag", "event"];

/**
 * The sibling groups of one memory, most-shared first within each facet.
 * A group with no other member is not a group, so a memory alone at a place it
 * alone was tagged with yields nothing at all — the section is absent, not
 * empty (§8: never an empty state advertising what is missing).
 */
export function siblingGroups(
    memory: Memory,
    all: Memory[],
    ctx: SiblingContext
): SiblingGroup[] {
    const doc = memory["@graph"] as string;
    const mine = keysOf(memory, ctx);
    // Once per memory, not once per memory per shared value: resolving an
    // attendee to a person is a scan of the contacts, and the archive is
    // scanned again for every group.
    const others = all
        .filter((m) => m["@graph"] !== doc)
        .map((m) => ({ m, keys: keysOf(m, ctx) }));
    const groups: SiblingGroup[] = [];
    for (const facet of FACET_ORDER) {
        for (const via of mine.get(facet) ?? []) {
            const members = others
                .filter((o) => (o.keys.get(facet) ?? []).includes(via))
                .map((o) => o.m)
                .sort(byRecency);
            if (members.length) groups.push({ facet, via, members });
        }
    }
    return groups.sort(
        (a, b) =>
            FACET_ORDER.indexOf(a.facet) - FACET_ORDER.indexOf(b.facet) ||
            b.members.length - a.members.length
    );
}
