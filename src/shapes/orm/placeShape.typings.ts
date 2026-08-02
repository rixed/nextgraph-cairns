export type IRI = string;

/**
 * =============================================================================
 * Typescript Typings for placeShape
 * =============================================================================
 */

/**
 * Place Type
 */
export interface Place {
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
   * Original IRI: https://schema.org/geo
   */
  geo?: IRI;
  /**
   * Original IRI: http://www.w3.org/2003/01/geo/wgs84_pos#lat
   */
  lat?: number;
  /**
   * Original IRI: http://www.w3.org/2003/01/geo/wgs84_pos#long
   */
  long?: number;
  /**
   * Original IRI: https://schema.org/address
   */
  address?: string;
  /**
   * Original IRI: https://schema.org/containedInPlace
   */
  containedInPlace?: IRI;
  /**
   * Original IRI: http://www.w3.org/2002/07/owl#sameAs
   */
  sameAs?: IRI;
}
