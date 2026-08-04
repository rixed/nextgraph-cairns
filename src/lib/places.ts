// Locations (Specs §3.2). A memory holds `schema:location` as plain IRIs and
// nothing else: spike 7 found that a union-typed property only reports what the
// ORM itself wrote, so a memory written through SPARQL — as every memory is,
// for the date datatypes — could not read its own locations back. Both kinds of
// location are therefore resolved here, by joining the IRI to a place shape
// subscribed over the whole store:
//
//   - an identified place is a document of its own, possibly foreign;
//   - an unnamed location is a subject inside the memory's own document,
//     `<memory>#place-N`. It has a URI only because RDF requires one to hang
//     triples off; it is never offered by the picker and never indexed, which
//     is what §3.2 means by "no URI".
//
// A location the app cannot resolve is still shown, as its bare reference: a
// place document that has not synced yet is a broken reference (§8), not a
// reason to drop the claim.

import { useShape } from "@ng-org/orm/svelte";
import { OrmSubscription, normalizeScope } from "@ng-org/orm";
import { sessionPromise } from "./ngSession";
import { oneEach } from "./identity";
import { PlaceShapeType } from "../shapes/orm/placeShape.shapeTypes";
import type { Place as PlaceShape } from "../shapes/orm/placeShape.typings";
import {
    SPARQL_PREFIXES,
    decimalLiteral,
    stringLiteral,
} from "./typedLiterals";

/** A place as the app cares about it, flattened from the shape. */
export interface Place {
    /** The document the triples live in — a memory's, for a nested one. */
    doc: string;
    /** The subject IRI: what a memory's `schema:location` holds. */
    id: string;
    name?: string;
    lat?: number;
    lon?: number;
    address?: string;
    containedIn?: string;
    sameAs?: string;
}

export function toPlace(p: PlaceShape): Place {
    return {
        doc: p["@graph"],
        id: p["@id"],
        name: p.name,
        // Read from the flat pair, not from `schema:geo`, which arrives as a
        // bare IRI: a nested object written by SPARQL is invisible to the ORM
        // (spike 7). Both are written; this line changes when that is fixed
        // upstream, and nothing else does.
        lat: p.lat,
        lon: p.long,
        address: p.address,
        containedIn: p.containedInPlace,
        sameAs: p.sameAs,
    };
}

/** Call during component initialisation, like any other subscription hook. */
export function useAllPlaces() {
    const places = useShape(PlaceShapeType, "did:ng:i");
    return {
        get all(): Place[] {
            // One entry per place, whatever the store says twice: a gazetteer's
            // place and another application's record of it are one place here,
            // which is what `findPlace` already assumes (lib/identity.ts).
            return oneEach(
                ([...places] as unknown as PlaceShape[]).map(toPlace),
                (p) => p.id
            );
        },
    };
}

/** Resolves once the place subscription has delivered its first answer. */
export function placesReady(): Promise<unknown> {
    return OrmSubscription.getOrCreate(
        PlaceShapeType as any,
        normalizeScope("did:ng:i")
    ).readyPromise;
}

/**
 * Whether a location has identity of its own, and can therefore be pointed at
 * from more than one memory (§3.2). A location minted inside a memory carries
 * that memory's document in its IRI and is nobody else's business.
 */
export function isIdentified(iri: string): boolean {
    return !iri.includes("#");
}

/** The memory an unnamed location belongs to, if it is one. */
export function nestedIn(iri: string): string | undefined {
    const hash = iri.indexOf("#");
    return hash < 0 ? undefined : iri.slice(0, hash);
}

/** What to show for a location: its name, else its coordinates, else itself. */
export function placeLabel(place: Place | undefined, iri: string): string {
    if (place?.name) return place.name;
    if (place && place.lat !== undefined && place.lon !== undefined)
        return formatCoords(place.lat, place.lon);
    // Unresolved: the document has not arrived, or nothing in the store
    // matches the shape. Show the reference rather than an empty line (§8).
    return isIdentified(iri) ? "a place not synced here yet" : "a location";
}

export function formatCoords(lat: number, lon: number): string {
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

export function findPlace(all: Place[], iri: string): Place | undefined {
    return all.find((p) => p.id === iri);
}

/**
 * The chain containing a place, outermost last — Alfama → Lisboa → Portugal
 * (§6.2, S-31). Each step is a place of its own and opens as one.
 *
 * A place already seen ends the walk. Foreign data is free to say that Lisboa
 * is in Alfama as well, and a cycle then repeats a step forever — or, once the
 * walk is bounded, repeats it twice, which is enough to hand a keyed list the
 * same key twice and take the screen down. Stopping at the repeat shows the
 * chain as far as it makes sense and no further, which is `segmentsOf`'s rule
 * for tag paths applied to somewhere else's containment.
 */
export function containingChain(
    all: Place[],
    iri: string
): { iri: string; label: string }[] {
    const out: { iri: string; label: string }[] = [];
    const seen = new Set<string>([iri]);
    let at = findPlace(all, iri)?.containedIn;
    while (at && !seen.has(at)) {
        seen.add(at);
        const p = findPlace(all, at);
        out.push({ iri: at, label: placeLabel(p, at) });
        at = p?.containedIn;
    }
    return out;
}

/**
 * Whether `iri` is `ancestor` or sits under it through `schema:containedInPlace`
 * — the transitive place facet of the S-22 filter (§6.2). The walk is bounded
 * by the number of places, so a cycle in foreign data cannot hang the filter.
 */
export function isWithin(all: Place[], iri: string, ancestor: string): boolean {
    let current: string | undefined = iri;
    for (let i = 0; current && i <= all.length; i++) {
        if (current === ancestor) return true;
        current = findPlace(all, current)?.containedIn;
    }
    return false;
}

// ---------------------------------------------------------------------------
// Writing the claim
//
// Locations are written with the memory, in the memory's own document. An
// identified place is referenced and never copied — the app does not own it,
// even when it wrote it.
// ---------------------------------------------------------------------------

/** What the picker (S-32) returns and the editor (S-21) holds until saved. */
export type LocationDraft =
    | { kind: "place"; iri: string }
    | { kind: "unnamed"; lat: number; lon: number; name?: string };

/** The draft that represents a location already stored on a memory. */
export function draftOf(iri: string, all: Place[]): LocationDraft {
    if (isIdentified(iri)) return { kind: "place", iri };
    const p = findPlace(all, iri);
    return {
        kind: "unnamed",
        lat: p?.lat ?? 0,
        lon: p?.lon ?? 0,
        name: p?.name,
    };
}

/**
 * Coordinates on a place, in both forms (see placeShape.shex): `schema:geo`,
 * which is what §3.2 asks for and what another application will read, and a
 * flat WGS84 pair, which is the only one this app can read back today. The
 * flat pair is a workaround for a NextGraph limitation and is meant to go; both
 * are always written together, so its removal costs nothing.
 */
export function coordTriples(subject: string, lat: number, lon: number): string[] {
    // A place minted inside a memory already carries a fragment, and a URI
    // holds only one.
    const geo = subject.includes("#") ? `${subject}-geo` : `${subject}#geo`;
    return [
        `<${subject}> geo:lat ${decimalLiteral(lat)}`,
        `<${subject}> geo:long ${decimalLiteral(lon)}`,
        `<${subject}> schema:geo <${geo}>`,
        `<${geo}> a schema:GeoCoordinates`,
        `<${geo}> schema:latitude ${decimalLiteral(lat)}`,
        `<${geo}> schema:longitude ${decimalLiteral(lon)}`,
    ];
}

/**
 * The triples a memory's locations contribute to its own document. Unnamed
 * locations are numbered from the position they hold in the editor, so
 * rewriting a memory produces the same subjects for the same list — the IRIs
 * are derived, not identity.
 */
export function locationTriples(
    subject: string,
    locations: LocationDraft[]
): string[] {
    const t: string[] = [];
    locations.forEach((loc, i) => {
        if (loc.kind === "place") {
            t.push(`<${subject}> schema:location <${loc.iri}>`);
            return;
        }
        const iri = `${subject}#place-${i}`;
        t.push(`<${subject}> schema:location <${iri}>`);
        t.push(`<${iri}> a schema:Place`);
        t.push(...coordTriples(iri, loc.lat, loc.lon));
        if (loc.name?.trim())
            t.push(`<${iri}> schema:name ${stringLiteral(loc.name.trim())}`);
    });
    return t;
}

/**
 * Unnamed locations are rewritten wholesale with the memory that holds them,
 * so the old ones go first. Only subjects inside the memory's own document
 * match: a referenced place lives elsewhere and is never touched.
 *
 * The coordinates node goes in its own statement — a single conjunctive
 * pattern would delete nothing at all for a place that has no coordinates.
 */
export function dropNestedPlaces(doc: string): string[] {
    return [
        `DELETE WHERE { GRAPH <${doc}> { ?p a schema:Place ; ?x ?y } }`,
        `DELETE WHERE { GRAPH <${doc}> { ?g a schema:GeoCoordinates ; ?x ?y } }`,
    ];
}

/**
 * The coordinates node of a subject — the one `coordTriples` writes, which a
 * nested place hangs off its own fragment because a URI holds only one.
 */
function geoNodeOf(subject: string): string {
    return subject.includes("#") ? `${subject}-geo` : `${subject}#geo`;
}

/**
 * Edit an unnamed location in place (S-33): its free-text name and its
 * coordinates, inside the memory that holds it.
 *
 * Surgical rather than the wholesale rewrite `updateMemory` does, because this
 * screen is reached from a memory that is not being edited: the other locations
 * of that memory, and everything else in its document, must come out
 * untouched. The IRI is not rewritten either — it is derived from a position
 * (§3.2), and the reference on the memory keeps pointing at it.
 */
export async function updateUnnamedLocation(
    iri: string,
    fields: { name?: string; lat: number; lon: number }
): Promise<void> {
    const doc = nestedIn(iri);
    if (!doc) throw new Error(`not an unnamed location: ${iri}`);
    const s = await sessionPromise;
    const t = [`<${iri}> a schema:Place`, ...coordTriples(iri, fields.lat, fields.lon)];
    if (fields.name?.trim())
        t.push(`<${iri}> schema:name ${stringLiteral(fields.name.trim())}`);
    await s.ng.sparql_update(
        s.session_id,
        `${SPARQL_PREFIXES}
         DELETE WHERE { GRAPH <${doc}> { <${iri}> ?p ?o } } ;
         DELETE WHERE { GRAPH <${doc}> { <${geoNodeOf(iri)}> ?p ?o } } ;
         INSERT DATA { GRAPH <${doc}> {\n${t.join(" .\n")} .\n} }`,
        doc
    );
}

/**
 * Promotion (S-33): give an unnamed location identity — its own document, its
 * own URI — and repoint the memory that held it at the new place.
 *
 * One `sparql_update` over both graphs (B-06, spike 8): the place is written
 * and the memory is repointed together, or neither is. The alternative leaves
 * either a place nobody references or a memory pointing at a place that does
 * not exist. The document itself must be minted first — `doc_create` is what
 * produces the NURI the update names — so a failure after it leaves an empty
 * document and nothing else, which is inert rather than wrong.
 *
 * `sameAs` is the reconciliation §3.2 and B-04 ask for: when the place already
 * has an identity somewhere — Wikidata, OSM — say so rather than pretending
 * this app's URI is the first one. Minting is what you do when no external
 * match exists.
 *
 * Returns the new place's NURI.
 */
export async function promoteLocation(
    iri: string,
    fields: { name: string; lat: number; lon: number; sameAs?: string }
): Promise<string> {
    const memoryDoc = nestedIn(iri);
    if (!memoryDoc) throw new Error(`not an unnamed location: ${iri}`);
    const name = fields.name.trim();
    if (!name) throw new Error("a place worth minting has a name");
    const s = await sessionPromise;
    const doc: string = await s.ng.doc_create(
        s.session_id,
        "Graph",
        "data:graph",
        "store",
        undefined
    );

    const place = [
        `<${doc}> a schema:Place`,
        `<${doc}> schema:name ${stringLiteral(name)}`,
        ...coordTriples(doc, fields.lat, fields.lon),
    ];
    if (fields.sameAs?.trim())
        place.push(`<${doc}> owl:sameAs <${fields.sameAs.trim()}>`);

    await s.ng.sparql_update(
        s.session_id,
        `${SPARQL_PREFIXES}
         DELETE WHERE { GRAPH <${memoryDoc}> {
            <${memoryDoc}> schema:location <${iri}> } } ;
         DELETE WHERE { GRAPH <${memoryDoc}> { <${iri}> ?p ?o } } ;
         DELETE WHERE { GRAPH <${memoryDoc}> { <${geoNodeOf(iri)}> ?p ?o } } ;
         INSERT DATA {
            GRAPH <${doc}> {\n${place.join(" .\n")} .\n}
            GRAPH <${memoryDoc}> {
               <${memoryDoc}> schema:location <${doc}> . }
         }`,
        // Undefined: this update belongs to no single document (spike 8).
        undefined
    );
    return doc;
}

/** A place document this app can write at all: ours to reach, not a gazetteer's. */
export function isWritable(iri: string): boolean {
    return isIdentified(iri) && iri.startsWith("did:ng:");
}

/** The fields S-33 knows how to edit on an identified place. */
export interface PlaceFields {
    name?: string;
    lat?: number;
    lon?: number;
    sameAs?: string;
}

/**
 * Edit an identified place — S-31's "edit if locally owned" (§6.2).
 *
 * **Every deletion names the exact value it removes.** Not
 * `DELETE WHERE { <p> schema:name ?v }`, which would take a second name in
 * another language, or every `owl:sameAs` when the shape shows the app only
 * one. A place document may hold opening hours, categories, an address broken
 * into parts, whatever the application that wrote it cared about; this app
 * models six properties and must leave the rest exactly as it found them (§5).
 * So the caller passes what it read, and only that is withdrawn.
 *
 * The consequence is worth stating: an edit made while another device holds a
 * stale value withdraws the stale one, not the current one, and the current one
 * survives beside the new. That is a merge to resolve, not data destroyed —
 * which is the correct trade for a store the user shares with applications this
 * one has never heard of.
 */
export async function updatePlaceFields(
    iri: string,
    next: PlaceFields,
    previous: PlaceFields
): Promise<void> {
    if (!isWritable(iri))
        throw new Error(`not a place this app can write: ${iri}`);
    const s = await sessionPromise;
    const ops: string[] = [];
    const drop = (p: string, v: string) =>
        ops.push(`DELETE DATA { GRAPH <${iri}> { <${iri}> ${p} ${v} } }`);
    const add = (p: string, v: string) =>
        ops.push(`INSERT DATA { GRAPH <${iri}> { <${iri}> ${p} ${v} } }`);

    const name = next.name?.trim();
    if (previous.name !== undefined && previous.name !== name)
        drop("schema:name", stringLiteral(previous.name));
    if (name && name !== previous.name) add("schema:name", stringLiteral(name));

    const sameAs = next.sameAs?.trim();
    if (previous.sameAs && previous.sameAs !== sameAs)
        drop("owl:sameAs", `<${previous.sameAs}>`);
    if (sameAs && sameAs !== previous.sameAs) add("owl:sameAs", `<${sameAs}>`);

    const moved =
        next.lat !== undefined &&
        next.lon !== undefined &&
        (next.lat !== previous.lat || next.lon !== previous.lon);
    if (moved) {
        if (previous.lat !== undefined)
            drop("geo:lat", decimalLiteral(previous.lat));
        if (previous.lon !== undefined)
            drop("geo:long", decimalLiteral(previous.lon));
        add("geo:lat", decimalLiteral(next.lat!));
        add("geo:long", decimalLiteral(next.lon!));
        // The structured node, wherever it is and whatever else it carries:
        // its two coordinates are replaced, and its own IRI is left to be
        // whatever the document already says — a foreign place may well not
        // have used ours. Bound in the WHERE clause because the ORM cannot
        // read a nested object back (B-14) and so cannot tell us its name.
        ops.push(
            `DELETE { GRAPH <${iri}> {
                ?n schema:latitude ?la . ?n schema:longitude ?lo } }
             INSERT { GRAPH <${iri}> {
                ?n schema:latitude ${decimalLiteral(next.lat!)} .
                ?n schema:longitude ${decimalLiteral(next.lon!)} } }
             WHERE { GRAPH <${iri}> {
                <${iri}> schema:geo ?n .
                OPTIONAL { ?n schema:latitude ?la }
                OPTIONAL { ?n schema:longitude ?lo } } }`
        );
        // And if the document has no coordinates node at all, give it the one
        // §3.2 asks for rather than leaving the flat pair to stand alone.
        ops.push(
            `INSERT { GRAPH <${iri}> {
                <${iri}> schema:geo <${geoNodeOf(iri)}> .
                <${geoNodeOf(iri)}> a schema:GeoCoordinates ;
                    schema:latitude ${decimalLiteral(next.lat!)} ;
                    schema:longitude ${decimalLiteral(next.lon!)} } }
             WHERE { GRAPH <${iri}> {
                <${iri}> a schema:Place .
                FILTER NOT EXISTS { <${iri}> schema:geo ?any } } }`
        );
    }

    if (!ops.length) return;
    await s.ng.sparql_update(
        s.session_id,
        `${SPARQL_PREFIXES}\n${ops.join(" ;\n")}`,
        iri
    );
}

// `createPlaceDoc` lived here, written ahead of S-33 and never called: promotion
// mints the document and repoints the memory in one update, which this could
// not do. An exported writer that mints documents and nothing calls is a thing
// that gets called by mistake, so it is gone rather than kept warm.
