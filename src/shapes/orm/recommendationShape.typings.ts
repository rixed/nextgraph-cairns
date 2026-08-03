export type IRI = string;

/**
 * =============================================================================
 * Typescript Typings for recommendationShape
 * =============================================================================
 */

/**
 * Recommendation Type
 */
export interface Recommendation {
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
  "@type": Set<"did:ng:z:cairns/Recommendation" | (IRI & {})>;
  /**
   * Original IRI: https://schema.org/item
   */
  item: IRI;
  /**
   * Original IRI: http://www.w3.org/ns/prov#wasAttributedTo
   */
  wasAttributedTo?: IRI;
  /**
   * Original IRI: http://purl.org/dc/terms/source
   */
  source?: string;
  /**
   * Original IRI: http://purl.org/dc/terms/date
   */
  date?: string | string | string | string;
  /**
   * Original IRI: https://schema.org/description
   */
  description?: string;
  /**
   * Original IRI: http://purl.org/dc/terms/subject
   */
  subject?: Set<IRI>;
}
