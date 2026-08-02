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
            return ([...places] as unknown as PlaceShape[]).map(toPlace);
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
 * Give a place identity of its own: its own document, its own URI (§3.2). This
 * is what S-33's promotion will mint; the picker uses it for nothing, since a
 * place worth naming is worth keeping.
 */
export async function createPlaceDoc(fields: {
    name: string;
    lat?: number;
    lon?: number;
    address?: string;
}): Promise<string> {
    const s = await sessionPromise;
    const doc: string = await s.ng.doc_create(
        s.session_id,
        "Graph",
        "data:graph",
        "store",
        undefined
    );
    const t = [
        `<${doc}> a schema:Place`,
        `<${doc}> schema:name ${stringLiteral(fields.name)}`,
    ];
    if (fields.lat !== undefined && fields.lon !== undefined)
        t.push(...coordTriples(doc, fields.lat, fields.lon));
    if (fields.address)
        t.push(`<${doc}> schema:address ${stringLiteral(fields.address)}`);
    await s.ng.sparql_update(
        s.session_id,
        `${SPARQL_PREFIXES}
         INSERT DATA { GRAPH <${doc}> {\n${t.join(" .\n")} .\n} }`,
        doc
    );
    return doc;
}
