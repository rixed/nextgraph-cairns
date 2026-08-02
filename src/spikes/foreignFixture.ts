// The foreign-document fixture: stands in for every application Cairns is
// specified to read from and never write to (Specs §5).
//
// `mediaFixture.ts` already plays the camera. This module plays the rest of the
// store: a contacts application, somebody else's vocabulary, a gazetteer, a
// travel-booking inbox, an events feed and a GPS logger. Without it those rows
// of the census (§6.2, S-76) read zero forever, S-01's reservation card has
// nothing to show, and the map slice has no track to draw — so the behaviour
// the spec describes cannot be built, let alone driven headlessly.
//
// Like mediaFixture, this lives outside src/lib deliberately: the app must not
// gain a write path to any of these shapes. The one exception is the contacts,
// which go into the shared people document the app itself appends to (§5) —
// that document is user-owned, and appending is legitimate for any application.
//
// **Every subject written here carries `app:fixture "seed-foreign"`.** The
// ng-dev stack is shared with other people's testing, so a fixture that cannot
// be removed exactly is a fixture that should not be written. The marker is the
// only inauthentic thing in these documents; nothing in the app reads it.

import { sessionPromise } from "../lib/ngSession";
import { SPARQL_PREFIXES, stringLiteral } from "../lib/typedLiterals";
import { schemeDoc } from "../lib/tags";
import { peopleDoc } from "../lib/people";

export const FIXTURE_MARK = "seed-foreign";

/** The app's prefixes plus the ones only foreign documents use. */
const PREFIXES = `${SPARQL_PREFIXES}
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX gsp: <http://www.opengis.net/ont/geosparql#>
PREFIX vcard: <http://www.w3.org/2006/vcard/ns#>`;

const MARK = `app:fixture ${stringLiteral(FIXTURE_MARK)}`;

export type Say = (s: string) => void;

async function update(query: string, nuri?: string): Promise<void> {
    const s = await sessionPromise;
    await s.ng.sparql_update(s.session_id, `${PREFIXES}\n${query}`, nuri);
}

async function select(query: string): Promise<any[]> {
    const s = await sessionPromise;
    const ret = await s.ng.sparql_query(
        s.session_id,
        `${PREFIXES}\n${query}`,
        undefined,
        undefined
    );
    return ret?.results?.bindings ?? [];
}

async function newDoc(): Promise<string> {
    const s = await sessionPromise;
    return await s.ng.doc_create(
        s.session_id,
        "Graph",
        "data:graph",
        "store",
        undefined
    );
}

/** Write one document's worth of triples, marker included, in one update. */
async function writeDoc(triples: string[]): Promise<string> {
    const doc = await newDoc();
    const t = triples.map((x) => x.replaceAll("$DOC", doc));
    t.push(`<${doc}> ${MARK}`);
    await update(`INSERT DATA { GRAPH <${doc}> {\n${t.join(" .\n")} .\n} }`, doc);
    return doc;
}

/** A stable fragment slug, so re-running the fixture does not duplicate it. */
function slug(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

// Local time, not UTC: a reservation at 21:00 is at 21:00 wherever the fixture
// runs, and toISOString would quietly move it.
const iso = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, "0");
    return (
        `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
        `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    );
};
const inDays = (n: number, hour = 9) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(hour, 0, 0, 0);
    return iso(d);
};
const dt = (s: string) => `"${s}"^^xsd:dateTime`;

// ---------------------------------------------------------------- contacts

// Deliberately varied: diacritics, non-Latin script, a mononym, a very long
// name, and two people who share one — §3.3's hard case, which the app has to
// keep apart by record rather than by string.
const NAMES = [
    "Ana Reis", "Bruno Salgado", "Chloé Marchand", "Dmitri Volkov",
    "Eleni Papadopoulou", "Farida Benali", "Gustavo Pinto", "Hana Kobayashi",
    "Ingrid Sørensen", "Jamal Idrissi", "Kasia Nowak", "Liam O'Connell",
    "Mariana Duarte", "Nils Bergström", "Olu Adeyemi", "Paulo Rocha",
    "Quim", "Rita Nogueira", "Samir Haddad", "Tereza Kučerová",
    "Ubaldo Ferrari", "Vera Lindqvist", "Wei Zhang", "Xavier Belmonte",
    "Yasmin Karim", "Zoltán Balogh", "Ana Reis", "Alice Fournier",
    "Bea Antunes", "Carlos Mendes", "Daniela Sá", "Erik Lindholm",
    "Fatou Diallo", "Gonçalo Vieira", "Helle Andersen", "Iker Etxeberria",
    "Joana Cardoso", "Kwame Mensah", "Lucía Ibáñez", "Miguel Torres",
    "Nadia Petrova", "Óscar Delgado", "Priya Raghunathan", "Quentin Roussel",
    "Rui Barreto", "Sofia Almeida", "Tomás Guerreiro", "Ulrike Hoffmann",
    "Valentina Rossi", "Wanda Lewandowska", "Yannis Stavrou", "Zeynep Kaya",
    "Aoife Ní Bhraonáin", "Bartholomew Fitzwilliam-Hastings", "Camille Dubois",
    "Diego Fernández", "Emeka Okafor", "Fernanda Lopes", "Grigore Popescu",
    "Hiroshi Tanaka", "Isabela Cunha", "Jonas Meyer", "Karim Belhadj",
    "Leila Moreau", "Matteo Bianchi", "Nuno Baptista", "Olga Sokolova",
    "Pedro Coelho", "Rania Chahine", "Stefan Novák", "Tiago Ferreira",
    "Ursula Klein", "Виктор Орлов",
];

/**
 * Contacts, the way a contacts application would leave them: mostly appended
 * to the shared people document, a few in documents of their own (an app that
 * keeps one document per contact), and two written as `vcard:Individual` —
 * a shape §5 names but `personShape.shex` does not match, so the census counts
 * them and the People screen does not list them. That gap is real and this is
 * where it becomes visible instead of theoretical.
 */
export async function seedContacts(count: number, say: Say): Promise<void> {
    const doc = await peopleDoc();
    const wanted = NAMES.slice(0, Math.min(count, NAMES.length));
    if (count > NAMES.length)
        say(`(only ${NAMES.length} distinct names available)`);

    // Roughly one in ten gets its own document, as a doc-per-contact app does.
    const own = wanted.filter((_, i) => i % 10 === 7);
    const shared = wanted.filter((_, i) => i % 10 !== 7);

    const triples: string[] = [];
    shared.forEach((name, i) => {
        // A slug rather than mintContactIri's random suffix, so re-running is
        // idempotent; a real contacts app would mint, and does not re-run.
        const iri = `${doc}#p-fx-${slug(name)}-${i}`;
        triples.push(
            `<${iri}> a foaf:Person`,
            `<${iri}> foaf:name ${stringLiteral(name)}`,
            `<${iri}> ${MARK}`,
            `<${doc}> foaf:member <${iri}>`
        );
    });
    await update(
        `INSERT DATA { GRAPH <${doc}> {\n${triples.join(" .\n")} .\n} }`,
        doc
    );
    say(`appended ${shared.length} contacts to the shared people document`);

    for (const name of own)
        await writeDoc([
            `<$DOC> a foaf:Person`,
            `<$DOC> foaf:name ${stringLiteral(name)}`,
        ]);
    say(`wrote ${own.length} contacts in documents of their own`);

    for (const name of ["Renata Sequeira", "Ahmed Zerouali"])
        await writeDoc([
            `<$DOC> a vcard:Individual`,
            `<$DOC> vcard:fn ${stringLiteral(name)}`,
        ]);
    say(
        "wrote 2 vcard:Individual records — counted by the census, NOT listed" +
            " by People: app:PersonShape matches foaf:Person only"
    );
}

// -------------------------------------------------------------------- tags

// A travel archive's vocabulary is mostly about texture, not about places:
// what the day was like, how you moved, what went wrong.
const TAGS = [
    "night-train", "ferry-crossing", "wild-camping", "border-queue",
    "roadside-mechanic", "laundry-day", "cold-swim", "market-day",
    "first-light", "thunderstorm", "wrong-turn", "kindness-of-strangers",
    "hitched-a-lift", "sleeping-in-the-van", "no-signal", "found-a-spring",
    "detour", "long-drive", "rest-day", "hill-walk", "sea-fog",
    "shared-table", "bad-coffee", "unexpected-fee", "missed-connection",
    "birthday-on-the-road", "last-day", "going-home",
];

// Another application's scheme, on a subject of its own. §3.5 says foreign
// vocabularies are welcome and never restructured — reading across two schemes
// is the case that proves it.
const FOREIGN_SCHEME = "Field notes";
const FOREIGN_TAGS = [
    "cork oak", "stone pine", "white stork", "azure-winged magpie",
    "Atlantic swell", "levada", "schist",
];

export async function seedTags(say: Say): Promise<void> {
    const doc = await schemeDoc();
    const existing = new Set(
        (
            await select(
                `SELECT ?l WHERE { GRAPH <${doc}> { ?c a skos:Concept ; skos:prefLabel ?l } }`
            )
        ).map((b: any) => b.l.value)
    );
    const fresh = TAGS.filter((t) => !existing.has(t));
    if (fresh.length) {
        const triples = fresh.flatMap((label) => {
            const iri = `${doc}#c-fx-${slug(label)}`;
            return [
                `<${iri}> a skos:Concept`,
                `<${iri}> skos:prefLabel ${stringLiteral(label)}`,
                `<${iri}> skos:inScheme <${doc}>`,
                `<${iri}> ${MARK}`,
            ];
        });
        await update(
            `INSERT DATA { GRAPH <${doc}> {\n${triples.join(" .\n")} .\n} }`,
            doc
        );
    }
    say(
        `appended ${fresh.length} concepts to the local scheme` +
            (fresh.length < TAGS.length
                ? ` (${TAGS.length - fresh.length} were already there)`
                : "")
    );

    const t = [
        `<$DOC> a skos:ConceptScheme`,
        `<$DOC> skos:prefLabel ${stringLiteral(FOREIGN_SCHEME)}`,
    ];
    FOREIGN_TAGS.forEach((label) => {
        const iri = `$DOC#c-${slug(label)}`;
        t.push(
            `<${iri}> a skos:Concept`,
            `<${iri}> skos:prefLabel ${stringLiteral(label)}`,
            `<${iri}> skos:inScheme <$DOC>`,
            `<${iri}> ${MARK}`
        );
    });
    await writeDoc(t);
    say(
        `wrote a second, foreign scheme "${FOREIGN_SCHEME}" with ` +
            `${FOREIGN_TAGS.length} concepts`
    );
}

// ------------------------------------------------------------------ places

interface PlaceSpec {
    name: string;
    lat?: number;
    lon?: number;
    address?: string;
    /** Key of the containing place in this same list. */
    within?: string;
    sameAs?: string;
    /**
     * Write coordinates only as the nested `schema:geo` node — the durable
     * form another application actually uses. Cairns cannot read it back
     * (B-14, and the TEMPORARY note in placeShape.shex), so a couple of these
     * exist to keep that limitation visible in real data.
     */
    nestedOnly?: boolean;
}

const PLACES: Record<string, PlaceSpec> = {
    portugal: { name: "Portugal", lat: 39.5, lon: -8.0, sameAs: "http://www.wikidata.org/entity/Q45" },
    lisboa: { name: "Lisboa", lat: 38.7223, lon: -9.1393, within: "portugal", sameAs: "http://www.wikidata.org/entity/Q597" },
    alfama: { name: "Alfama", lat: 38.7118, lon: -9.1287, within: "lisboa" },
    miradouro: { name: "Miradouro da Senhora do Monte", lat: 38.7169, lon: -9.1319, within: "lisboa", sameAs: "https://www.openstreetmap.org/node/3054019418" },
    caisdosodre: { name: "Cais do Sodré", lat: 38.7057, lon: -9.1447, within: "lisboa" },
    bertrand: { name: "Livraria Bertrand", address: "Rua Garrett 73, 1200-203 Lisboa", within: "lisboa" },
    sintra: { name: "Sintra", lat: 38.8029, lon: -9.3817, within: "portugal" },
    ursa: { name: "Praia da Ursa", lat: 38.7897, lon: -9.4855, within: "sintra", nestedOnly: true },
    porto: { name: "Porto", lat: 41.1579, lon: -8.6291, within: "portugal", sameAs: "http://www.wikidata.org/entity/Q36433", nestedOnly: true },
};

/**
 * A gazetteer, in dependency order so `schema:containedInPlace` points at a
 * document that already exists. The chain is the point: the S-22 place facet
 * is transitive, and until now nothing in the store was more than one deep.
 */
export async function seedPlaces(say: Say): Promise<Record<string, string>> {
    const iris: Record<string, string> = {};
    const order = ["portugal", "lisboa", "alfama", "miradouro", "caisdosodre", "bertrand", "sintra", "ursa", "porto"];
    for (const key of order) {
        const p = PLACES[key];
        const t = [`<$DOC> a schema:Place`, `<$DOC> schema:name ${stringLiteral(p.name)}`];
        if (p.lat !== undefined && p.lon !== undefined) {
            t.push(
                `<$DOC> schema:geo <$DOC#geo>`,
                `<$DOC#geo> a schema:GeoCoordinates`,
                `<$DOC#geo> schema:latitude "${p.lat}"^^xsd:decimal`,
                `<$DOC#geo> schema:longitude "${p.lon}"^^xsd:decimal`,
                `<$DOC#geo> ${MARK}`
            );
            if (!p.nestedOnly)
                t.push(
                    `<$DOC> geo:lat "${p.lat}"^^xsd:decimal`,
                    `<$DOC> geo:long "${p.lon}"^^xsd:decimal`
                );
        }
        if (p.address) t.push(`<$DOC> schema:address ${stringLiteral(p.address)}`);
        if (p.sameAs) t.push(`<$DOC> owl:sameAs <${p.sameAs}>`);
        if (p.within) t.push(`<$DOC> schema:containedInPlace <${iris[p.within]}>`);
        iris[key] = await writeDoc(t);
    }
    const nested = order.filter((k) => PLACES[k].nestedOnly);
    say(
        `wrote ${order.length} places, nested up to 3 deep ` +
            `(Alfama → Lisboa → Portugal)`
    );
    say(
        `  ${nested.length} of them carry coordinates ONLY as schema:geo ` +
            `(${nested.join(", ")}) — the app will show them without any (B-14)`
    );
    say(`  1 has an address and no coordinates at all (bertrand)`);
    return iris;
}

/** The gazetteer as already seeded, so the later steps can run on their own. */
export async function existingPlaces(): Promise<Record<string, string>> {
    const byName = new Map(
        Object.entries(PLACES).map(([key, p]) => [p.name, key])
    );
    const rows = await select(
        `SELECT ?s ?n WHERE { GRAPH ?g { ?s a schema:Place ; schema:name ?n ; ${MARK} } }`
    );
    const out: Record<string, string> = {};
    for (const r of rows as any[]) {
        const key = byName.get(r.n.value);
        if (key) out[key] = r.s.value;
    }
    return out;
}

// ------------------------------------------------------------------ events

/** Public events: capture hints for the date picker, and what a memory is about. */
export async function seedEvents(
    places: Record<string, string>,
    say: Say
): Promise<void> {
    const specs = [
        { name: "Jazz em Agosto", start: "2019-08-03T18:00:00", end: "2019-08-11T23:00:00", at: "lisboa" },
        { name: "Feira da Ladra", start: "2019-08-13T09:00:00", end: "2019-08-13T17:00:00", at: "alfama" },
        { name: "Festival ao Largo", start: inDays(2, 21), end: inDays(2, 23), at: "caisdosodre" },
        { name: "Serralves em Festa", start: inDays(34, 10), end: inDays(36, 22), at: "porto" },
        { name: "Maré Viva", start: inDays(-120, 11), end: inDays(-120, 19), at: "ursa" },
    ];
    for (const e of specs) {
        const t = [
            `<$DOC> a schema:Event`,
            `<$DOC> schema:name ${stringLiteral(e.name)}`,
            `<$DOC> schema:startDate ${dt(e.start)}`,
            `<$DOC> schema:endDate ${dt(e.end)}`,
        ];
        if (places[e.at]) t.push(`<$DOC> schema:location <${places[e.at]}>`);
        await writeDoc(t);
    }
    say(
        `wrote ${specs.length} public events — one running now-ish, one past, ` +
            `two in the media fixture's window (August 2019)`
    );
}

// ------------------------------------------------------------ reservations

/**
 * Reservations, in the five shapes §5 lists. Two are imminent, which is the
 * only reason S-01's second card can ever appear; the rest sit inside the
 * August 2019 window the media fixture uses, so the date-overlap join has
 * something on both sides.
 */
export async function seedReservations(
    places: Record<string, string>,
    say: Say
): Promise<void> {
    const who = stringLiteral("Cairns fixture");
    const specs: { type: string; num: string; triples: string[]; at?: string }[] = [
        {
            type: "schema:FlightReservation",
            num: "TP-4471-QX",
            triples: [
                `<$DOC#for> a schema:Flight`,
                `<$DOC#for> schema:flightNumber "TP1043"`,
                `<$DOC#for> schema:departureTime ${dt("2019-08-11T07:25:00")}`,
                `<$DOC#for> schema:arrivalTime ${dt("2019-08-11T09:05:00")}`,
                `<$DOC#for> ${MARK}`,
            ],
        },
        {
            type: "schema:LodgingReservation",
            num: "BK-88213094",
            at: "alfama",
            triples: [
                `<$DOC> schema:checkinTime ${dt("2019-08-11T15:00:00")}`,
                `<$DOC> schema:checkoutTime ${dt("2019-08-16T11:00:00")}`,
                `<$DOC#for> a schema:LodgingBusiness`,
                `<$DOC#for> schema:name ${stringLiteral("Casa das Janelas")}`,
                `<$DOC#for> ${MARK}`,
            ],
        },
        {
            type: "schema:FoodEstablishmentReservation",
            num: "RS-2019-0813",
            at: "alfama",
            triples: [
                `<$DOC> schema:startTime ${dt("2019-08-13T20:30:00")}`,
                `<$DOC> schema:partySize "4"^^xsd:integer`,
                `<$DOC#for> a schema:FoodEstablishment`,
                `<$DOC#for> schema:name ${stringLiteral("Tasca do Chico")}`,
                `<$DOC#for> ${MARK}`,
            ],
        },
        {
            type: "schema:TrainReservation",
            num: "CP-7Y2K19",
            at: "porto",
            triples: [
                `<$DOC#for> a schema:TrainTrip`,
                `<$DOC#for> schema:trainNumber "AP125"`,
                `<$DOC#for> schema:departureTime ${dt("2019-08-16T13:30:00")}`,
                `<$DOC#for> schema:arrivalTime ${dt("2019-08-16T16:22:00")}`,
                `<$DOC#for> ${MARK}`,
            ],
        },
        {
            type: "schema:EventReservation",
            num: "TK-99120",
            at: "caisdosodre",
            triples: [
                `<$DOC> schema:startTime ${dt(inDays(1, 21))}`,
                `<$DOC#for> a schema:Event`,
                `<$DOC#for> schema:name ${stringLiteral("Festival ao Largo")}`,
                `<$DOC#for> schema:startDate ${dt(inDays(1, 21))}`,
                `<$DOC#for> ${MARK}`,
            ],
        },
        {
            type: "schema:LodgingReservation",
            num: "BK-91007755",
            at: "sintra",
            triples: [
                `<$DOC> schema:checkinTime ${dt(inDays(3, 16))}`,
                `<$DOC> schema:checkoutTime ${dt(inDays(5, 11))}`,
                `<$DOC#for> a schema:LodgingBusiness`,
                `<$DOC#for> schema:name ${stringLiteral("Quinta do Vento")}`,
                `<$DOC#for> ${MARK}`,
            ],
        },
    ];

    for (const r of specs) {
        const t = [
            `<$DOC> a schema:Reservation`,
            // Both the generic type and the specific one: the census probes
            // either, and a reader that only knows schema:Reservation still
            // finds it. That is how these documents arrive in practice.
            `<$DOC> a ${r.type}`,
            `<$DOC> schema:reservationNumber ${stringLiteral(r.num)}`,
            `<$DOC> schema:reservationStatus <https://schema.org/ReservationConfirmed>`,
            `<$DOC> schema:underName ${who}`,
            `<$DOC> schema:reservationFor <$DOC#for>`,
            ...r.triples,
        ];
        if (r.at && places[r.at])
            t.push(`<$DOC#for> schema:location <${places[r.at]}>`);
        await writeDoc(t);
    }
    say(
        `wrote ${specs.length} reservations across 5 shapes — 2 imminent ` +
            `(tomorrow evening, and a stay in 3 days), 4 in August 2019`
    );
}

// ------------------------------------------------------------------ tracks

const TRACKS = [
    { name: "Morning walk, Alfama", start: "2019-08-13T08:05:00", end: "2019-08-13T09:40:00", from: [38.7118, -9.1287], to: [38.7169, -9.1319] },
    { name: "Ferry to Cacilhas", start: "2019-08-14T17:02:00", end: "2019-08-14T17:21:00", from: [38.7057, -9.1447], to: [38.6863, -9.1494] },
    { name: "Sintra ridge", start: "2019-08-17T10:15:00", end: "2019-08-17T15:30:00", from: [38.8029, -9.3817], to: [38.7897, -9.4855] },
    { name: "Ride north", start: "2019-08-16T13:30:00", end: "2019-08-16T16:22:00", from: [38.7223, -9.1393], to: [41.1579, -8.6291] },
];

/** A LINESTRING of `n` points between two corners, wobbled so it is not a ruler. */
function wkt(from: number[], to: number[], n = 12): string {
    const pts: string[] = [];
    for (let i = 0; i < n; i++) {
        const f = i / (n - 1);
        const wobble = Math.sin(f * Math.PI * 3) * 0.004;
        const lat = from[0] + (to[0] - from[0]) * f + wobble;
        const lon = from[1] + (to[1] - from[1]) * f - wobble;
        // WKT is longitude first.
        pts.push(`${lon.toFixed(5)} ${lat.toFixed(5)}`);
    }
    return `LINESTRING(${pts.join(", ")})`;
}

/**
 * Tracks, as a GPS logger leaves them. Several rather than one: a single track
 * proves nothing about how a layer of them behaves, and the map slice will have
 * to decide what to draw when their times overlap each other as well as a
 * memory's.
 */
export async function seedTracks(count: number, say: Say): Promise<void> {
    for (let i = 0; i < count; i++) {
        const base = TRACKS[i % TRACKS.length];
        // Beyond the hand-written four, shift by whole days and jitter the
        // corners so the extras are distinct rather than stacked.
        const lap = Math.floor(i / TRACKS.length);
        const shift = (s: string) => {
            const d = new Date(s);
            d.setDate(d.getDate() + lap);
            return iso(d);
        };
        const j = lap * 0.01;
        await writeDoc([
            `<$DOC> a gsp:Geometry`,
            `<$DOC> schema:name ${stringLiteral(lap ? `${base.name} (${lap + 1})` : base.name)}`,
            `<$DOC> schema:startDate ${dt(shift(base.start))}`,
            `<$DOC> schema:endDate ${dt(shift(base.end))}`,
            `<$DOC> gsp:asWKT "${wkt([base.from[0] + j, base.from[1] + j], base.to)}"^^gsp:wktLiteral`,
        ]);
    }
    say(`wrote ${count} tracks, overlapping each other and the August 2019 media`);
}

// ----------------------------------------------------------------- removal

/**
 * Remove exactly what this fixture wrote, and nothing else — by the marker,
 * never by shape, so a real contact or a real place is never at risk.
 *
 * One update over every affected graph, which is what spike 8 established: it
 * is rejected whole if any graph is bad, so the store cannot end up half
 * cleaned. Documents created for the fixture are emptied rather than destroyed,
 * the same as `deleteMemory` does — the framework has no other verb.
 */
export async function clearFixture(say: Say): Promise<void> {
    const rows = await select(
        `SELECT ?g ?s WHERE { GRAPH ?g { ?s ${MARK} } }`
    );
    if (!rows.length) return say("nothing marked — the store is already clean");

    const ops: string[] = [];
    for (const r of rows as any[]) {
        const g = r.g.value;
        const s = r.s.value;
        // Membership first: after the subject goes, its marker goes with it.
        ops.push(
            `DELETE WHERE { GRAPH <${g}> { ?m foaf:member <${s}> } }`,
            `DELETE WHERE { GRAPH <${g}> { <${s}> ?p ?o } }`
        );
    }
    await update(ops.join(" ;\n"), undefined);
    const graphs = new Set((rows as any[]).map((r) => r.g.value));
    say(
        `removed ${rows.length} marked subjects across ${graphs.size} documents`
    );
}
