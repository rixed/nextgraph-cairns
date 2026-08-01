// The census behind S-76 (Specs §5, §6.2).
//
// The store contains documents, not applications' data. What the app can say
// about it is therefore: which shapes it recognises, how many documents match
// each, and what coverage the properties it actually uses have. Coverage is the
// useful figure — it predicts whether the media grid and the map will be rich
// or sparse. Nothing here asks which application wrote anything: documents
// belong to the user, and the app has no business asking.

import { select } from "./query";

const SCHEMA = "https://schema.org/";
const SKOS = "http://www.w3.org/2004/02/skos/core#";
const FOAF = "http://xmlns.com/foaf/0.1/";
const EXIF = "http://www.w3.org/2003/12/exif/ns#";
const GSP = "http://www.opengis.net/ont/geosparql#";
const APP = "did:ng:z:cairns/";

export interface Property {
    label: string;
    iri: string;
}

export interface Probe {
    label: string;
    /** Several types count as one shape when the app treats them alike. */
    types: string[];
    /** Types that disqualify a match — a memory is an event, but not one of
     *  the public events this probe is asking about. */
    notTypes?: string[];
    /** What the app does with it, in the user's terms. */
    use: string;
    /** Properties the app actually reads, for coverage. */
    properties?: Property[];
    /** Documents Cairns writes itself, listed apart from what it discovers. */
    own?: boolean;
}

export const PROBES: Probe[] = [
    {
        label: "Memories",
        types: [`${APP}Memory`],
        use: "one document each — the only substantive thing this app owns",
        own: true,
        properties: [
            { label: "have a title", iri: `${SCHEMA}name` },
            { label: "carry tags", iri: "http://purl.org/dc/terms/subject" },
            { label: "attach media explicitly", iri: `${SCHEMA}subjectOf` },
        ],
    },
    {
        label: "Rejections",
        types: [`${APP}Rejections`],
        use: "what you told the app to stop suggesting",
        own: true,
    },
    {
        label: "Image descriptors",
        types: [`${SCHEMA}ImageObject`],
        use: "pictured in the grid, on a memory, and later on the map",
        properties: [
            { label: "publish a thumbnail", iri: `${SCHEMA}thumbnailUrl` },
            { label: "carry a capture time", iri: `${EXIF}dateTimeOriginal` },
            { label: "carry coordinates", iri: `${EXIF}gpsLatitude` },
        ],
    },
    {
        label: "Video descriptors",
        types: [`${SCHEMA}VideoObject`],
        use: "played on their own screen; a tile elsewhere",
        properties: [
            { label: "publish a thumbnail", iri: `${SCHEMA}thumbnailUrl` },
            { label: "carry a capture time", iri: `${EXIF}dateTimeOriginal` },
        ],
    },
    {
        label: "Audio descriptors",
        types: [`${SCHEMA}AudioObject`],
        use: "played on their own screen; never picturable",
        properties: [
            { label: "carry a capture time", iri: `${EXIF}dateTimeOriginal` },
        ],
    },
    {
        label: "Concept schemes",
        types: [`${SKOS}ConceptScheme`],
        use: "the vocabulary tags come from — appended to, never restructured",
        properties: [{ label: "are named", iri: `${SKOS}prefLabel` }],
    },
    {
        label: "Concepts",
        types: [`${SKOS}Concept`],
        use: "the tags themselves",
    },
    {
        label: "Person records",
        types: [`${FOAF}Person`, "http://www.w3.org/2006/vcard/ns#Individual"],
        use: "attendees of a memory, once People is built",
    },
    {
        label: "Places",
        types: [`${SCHEMA}Place`],
        use: "where a memory happened, once locations are built",
        properties: [
            { label: "are named", iri: `${SCHEMA}name` },
            {
                label: "carry coordinates",
                iri: "http://www.w3.org/2003/01/geo/wgs84_pos#lat",
            },
        ],
    },
    {
        label: "Events",
        types: [`${SCHEMA}Event`],
        notTypes: [`${APP}Memory`],
        use: "public events a memory can be about, and capture hints",
    },
    {
        label: "Reservations",
        types: [
            `${SCHEMA}Reservation`,
            `${SCHEMA}LodgingReservation`,
            `${SCHEMA}FlightReservation`,
            `${SCHEMA}TrainReservation`,
            `${SCHEMA}FoodEstablishmentReservation`,
            `${SCHEMA}EventReservation`,
        ],
        use: "shown when imminent, and on a memory they overlap",
    },
    {
        label: "Geometries and tracks",
        types: [`${GSP}Geometry`],
        use: "a map layer, and a memory's trace when the times overlap",
    },
];

export interface CensusRow {
    label: string;
    use: string;
    own: boolean;
    subjects: number;
    documents: number;
    coverage: { label: string; have: number }[];
}

function match(p: Probe, extra = ""): string {
    const values = p.types.map((t) => `<${t}>`).join(" ");
    const excluded = (p.notTypes ?? [])
        .map((t) => `FILTER NOT EXISTS { ?s a <${t}> }`)
        .join("\n            ");
    return `VALUES ?t { ${values} } ?s a ?t ${extra}\n            ${excluded}`;
}

async function countSubjects(p: Probe): Promise<number> {
    const rows = await select(
        `SELECT DISTINCT ?s WHERE { GRAPH ?g { ${match(p)} } }`
    );
    return rows.length;
}

async function countDocuments(p: Probe): Promise<number> {
    const rows = await select(
        `SELECT DISTINCT ?doc WHERE { GRAPH ?doc { ${match(p)} } }`
    );
    return rows.length;
}

async function countWithProperty(p: Probe, property: string): Promise<number> {
    const rows = await select(
        `SELECT DISTINCT ?s WHERE { GRAPH ?g { ${match(p, `; <${property}> ?v`)} } }`
    );
    return rows.length;
}

/** Run every probe. Absent shapes come back with zero, for the caller to hide. */
export async function census(): Promise<CensusRow[]> {
    return await Promise.all(
        PROBES.map(async (p): Promise<CensusRow> => {
            const [subjects, documents] = await Promise.all([
                countSubjects(p),
                countDocuments(p),
            ]);
            const coverage = subjects
                ? await Promise.all(
                      (p.properties ?? []).map(async (prop) => ({
                          label: prop.label,
                          have: await countWithProperty(p, prop.iri),
                      }))
                  )
                : [];
            return {
                label: p.label,
                use: p.use,
                own: p.own ?? false,
                subjects,
                documents,
                coverage,
            };
        })
    );
}
