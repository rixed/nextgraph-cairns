// SPARQL literal helpers. Dates must be written with their XSD datatype
// (Specs §3.1); the ORM write path stores JS strings as xsd:string (see
// docs/SpikeFindings.md spike 2), so date-bearing writes go through SPARQL.

import { XSD_NAME, type PrecisionDate } from "./dates";

/** Escape a string for a double-quoted SPARQL literal. */
export function escapeLiteral(s: string): string {
    return s
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r");
}

/** `"2019-08"^^xsd:gYearMonth` — the typed literal for a PrecisionDate. */
export function dateLiteral(d: PrecisionDate): string {
    return `"${d.lexical}"^^xsd:${XSD_NAME[d.precision]}`;
}

export function stringLiteral(s: string): string {
    return `"${escapeLiteral(s)}"`;
}

/**
 * Coordinates, as `xsd:decimal` (§3.2). The datatype matters for the same
 * reason dates' does: the shape asks for a decimal, and a bare number would be
 * written as a string and then not match.
 */
export function decimalLiteral(n: number): string {
    if (!Number.isFinite(n)) throw new Error(`not a coordinate: ${n}`);
    // Exponent notation is not valid xsd:decimal lexical form.
    return `"${n.toFixed(7).replace(/0+$/, "").replace(/\.$/, ".0")}"^^xsd:decimal`;
}

export const SPARQL_PREFIXES = `PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX schema: <https://schema.org/>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX app: <did:ng:z:cairns/>`;
