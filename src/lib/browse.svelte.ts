// The state the S-22 shell owns and its three projections share (§6.2): the
// filter, the selection, and where each projection had been scrolled to.
//
// It lives in a module rather than in the shell component because switching
// projection replaces the route — and the specs are explicit that the filter
// and the scroll position survive that switch. The selection survives it too:
// selecting in the time projection and acting on the selection from the media
// one is the same set of memories seen twice, which is the whole claim of §1.1.
//
// The filter's predicate lives in browseFilter.ts, and is re-exported here so
// a screen has one import rather than two.

import type { PrecisionDate } from "./dates";
import type { LocationDraft } from "./places";
import {
    activeFacets,
    emptyFacets,
    without,
    type FacetName,
    type Facets,
    type Projection,
} from "./browseFilter";

export * from "./browseFilter";

let facets = $state<Facets>(emptyFacets());
let selected = $state<string[]>([]);
let selecting = $state(false);
const scrollOf: Record<Projection, number> = { time: 0, space: 0, media: 0 };

/**
 * A selection carried to S-21 by "write a memory about these" (§4.4). Read
 * once, then dropped: it is a hand-off, not a document.
 */
export interface Draft {
    /** Absent when the capture is about a place rather than a moment: a pin
     *  dropped on the map says where, and the editor's default says when. */
    startDate?: PrecisionDate;
    endDate?: PrecisionDate;
    tags: string[];
    media: string[];
    /** Drafts, not IRIs: a dropped pin is a location with no identity yet. */
    locations: LocationDraft[];
    /** Contacts the selection names — §4.4 asks for these as suggestions. */
    attendees: string[];
}
let draft: Draft | undefined;

export const browse = {
    get facets(): Facets {
        return facets;
    },
    get active(): boolean {
        return activeFacets(facets).length > 0;
    },
    clear() {
        facets = emptyFacets();
    },
    /** Drop one facet by name — what the empty-result state offers (§8). */
    drop(name: FacetName) {
        facets = without(facets, name);
    },

    get selecting(): boolean {
        return selecting;
    },
    get selected(): string[] {
        return selected;
    },
    isSelected(id: string): boolean {
        return selected.includes(id);
    },
    /**
     * Everything on screen at once — what makes a filter, and so a search
     * result handed over as one (§6.2), a bulk action rather than forty taps.
     */
    selectAll(ids: string[]) {
        selecting = true;
        selected = [...new Set(ids)];
    },
    toggle(id: string) {
        selected = selected.includes(id)
            ? selected.filter((s) => s !== id)
            : [...selected, id];
    },
    /**
     * Selection is per projection: the time projection selects memories, the
     * media one selects photographs, and one set of ids means nothing to the
     * other. Entering selection mode therefore starts empty.
     */
    startSelecting() {
        selecting = true;
        selected = [];
    },
    stopSelecting() {
        selecting = false;
        selected = [];
    },

    scrollFor(p: Projection): number {
        return scrollOf[p];
    },
    rememberScroll(p: Projection, y: number) {
        scrollOf[p] = y;
    },

    setDraft(d: Draft) {
        draft = d;
    },
    takeDraft(): Draft | undefined {
        const d = draft;
        draft = undefined;
        return d;
    },
};
