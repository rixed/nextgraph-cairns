export type IRI = string;

/**
 * =============================================================================
 * Typescript Typings for memoryShape
 * =============================================================================
 */

/**
 * Memory Type
 */
export interface Memory {
  /**
   * The graph NURI.
   */
  readonly "@graph": IRI;
  /**
   * The subject IRI.
   */
  readonly "@id": IRI;
  /**
   * Original IRI: http://www.w3.org/1999/02/22-rdf-syntax-ns#type
   */
  "@type": Set<"did:ng:z:cairns/Memory" | (IRI & {})>;
  /**
   * Original IRI: https://schema.org/name
   */
  name?: string;
  /**
   * Original IRI: https://schema.org/startDate
   */
  startDate: string | string | string | string;
  /**
   * Original IRI: https://schema.org/endDate
   */
  endDate?: string | string | string | string;
  /**
   * Original IRI: https://schema.org/text
   */
  text?: string;
  /**
   * Original IRI: https://schema.org/description
   */
  description?: string;
  /**
   * Original IRI: https://schema.org/location
   */
  location?: Set<UnnamedPlace>;
  /**
   * Original IRI: https://schema.org/attendee
   */
  attendee?: BareNamePerson | IRI;
  /**
   * Original IRI: http://purl.org/dc/terms/subject
   */
  subject?: Set<IRI>;
}

/**
 * UnnamedPlace Type
 */
export interface UnnamedPlace {
  /**
   * The graph NURI.
   */
  readonly "@graph": IRI;
  /**
   * The subject IRI.
   */
  readonly "@id": IRI;
  /**
   * Original IRI: http://www.w3.org/1999/02/22-rdf-syntax-ns#type
   */
  "@type": Set<"https://schema.org/Place" | (IRI & {})>;
  /**
   * Original IRI: https://schema.org/name
   */
  name?: string;
  /**
   * Original IRI: http://www.w3.org/2003/01/geo/wgs84_pos#lat
   */
  lat: number;
  /**
   * Original IRI: http://www.w3.org/2003/01/geo/wgs84_pos#long
   */
  long: number;
}

/**
 * BareNamePerson Type
 */
export interface BareNamePerson {
  /**
   * The graph NURI.
   */
  readonly "@graph": IRI;
  /**
   * The subject IRI.
   */
  readonly "@id": IRI;
  /**
   * Original IRI: http://www.w3.org/1999/02/22-rdf-syntax-ns#type
   */
  "@type": Set<"http://xmlns.com/foaf/0.1/Person" | (IRI & {})>;
  /**
   * Original IRI: http://xmlns.com/foaf/0.1/name
   */
  name: string;
}
