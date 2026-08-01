export type IRI = string;

/**
 * =============================================================================
 * Typescript Typings for tagShape
 * =============================================================================
 */

/**
 * Concept Type
 */
export interface Concept {
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
  "@type": Set<"http://www.w3.org/2004/02/skos/core#Concept" | (IRI & {})>;
  /**
   * Original IRI: http://www.w3.org/2004/02/skos/core#prefLabel
   */
  prefLabel: string;
  /**
   * Original IRI: http://www.w3.org/2004/02/skos/core#inScheme
   */
  inScheme?: IRI;
  /**
   * Original IRI: http://www.w3.org/2004/02/skos/core#broader
   */
  broader?: Set<IRI>;
}
