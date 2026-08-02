export type IRI = string;

/**
 * =============================================================================
 * Typescript Typings for personShape
 * =============================================================================
 */

/**
 * Person Type
 */
export interface Person {
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
  name?: string;
  /**
   * Original IRI: https://schema.org/image
   */
  image?: IRI;
}

/**
 * PeopleDoc Type
 */
export interface PeopleDoc {
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
  "@type": Set<"http://xmlns.com/foaf/0.1/Group" | (IRI & {})>;
  /**
   * Original IRI: https://schema.org/name
   */
  name?: string;
  /**
   * Original IRI: http://xmlns.com/foaf/0.1/member
   */
  member?: Set<IRI>;
}
