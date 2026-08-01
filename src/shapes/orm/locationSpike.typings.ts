export type IRI = string;

/**
 * =============================================================================
 * Typescript Typings for locationSpike
 * =============================================================================
 */

/**
 * SpikeMemory Type
 */
export interface SpikeMemory {
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
   * Original IRI: https://schema.org/location
   */
  location?: Set<SpikeUnnamedPlace | SpikePlaceRef>;
  /**
   * Original IRI: https://schema.org/attendee
   */
  attendee?: Set<SpikeBareName | SpikePersonRef>;
}

/**
 * SpikeUnnamedPlace Type
 */
export interface SpikeUnnamedPlace {
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
 * SpikePlaceRef Type
 */
export interface SpikePlaceRef {
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
  name: string;
}

/**
 * SpikeBareName Type
 */
export interface SpikeBareName {
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

/**
 * SpikePersonRef Type
 */
export interface SpikePersonRef {
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
  /**
   * Original IRI: https://schema.org/image
   */
  image?: IRI;
}

/**
 * SpikeMemoryRefs Type
 */
export interface SpikeMemoryRefs {
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
   * Original IRI: https://schema.org/location
   */
  location?: Set<IRI>;
  /**
   * Original IRI: https://schema.org/attendee
   */
  attendee?: Set<IRI>;
}
