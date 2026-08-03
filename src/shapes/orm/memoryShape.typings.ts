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
  location?: Set<IRI>;
  /**
   * Original IRI: https://schema.org/attendee
   */
  attendee?: Set<IRI>;
  /**
   * Original IRI: http://purl.org/dc/terms/subject
   */
  subject?: Set<IRI>;
  /**
   * Original IRI: https://schema.org/subjectOf
   */
  subjectOf?: Set<IRI>;
  /**
   * Original IRI: https://schema.org/image
   */
  image?: IRI;
  /**
   * Original IRI: https://schema.org/about
   */
  about?: Set<IRI>;
  /**
   * Original IRI: http://www.w3.org/ns/prov#wasInfluencedBy
   */
  wasInfluencedBy?: Set<IRI>;
  /**
   * Original IRI: https://schema.org/comment
   */
  comment?: Set<MediaNote>;
}

/**
 * MediaNote Type
 */
export interface MediaNote {
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
  "@type": Set<"https://schema.org/Comment" | (IRI & {})>;
  /**
   * Original IRI: https://schema.org/about
   */
  about: IRI;
  /**
   * Original IRI: https://schema.org/text
   */
  text: string;
}
