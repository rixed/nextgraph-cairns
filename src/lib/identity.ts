// Identity in a store this app does not own.
//
// Every subscription and every query here spans the whole store, and a subject
// is described by whichever documents happen to describe it: two applications
// may each publish their own record of one place, one contact, one concept, and
// both arrive (§5). The app already treats the subject IRI as the identity —
// `findPlace`, `findPerson`, `findEvent` all take the first match — so a set
// that reaches a screen shows a subject once, decided here rather than
// rediscovered by every list.
//
// This is not tidiness. A keyed list handed the same key twice does not
// degrade: Svelte throws `each_key_duplicate`, and the screen, along with
// everything mounted beside it, is gone. Foreign data must never be able to do
// that (§8 — annotate what is odd, never break on it).

/** The first of each key, in the order they arrived. */
export function oneEach<T>(all: T[], keyOf: (x: T) => string): T[] {
    const seen = new Set<string>();
    return all.filter((x) => {
        const key = keyOf(x);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
