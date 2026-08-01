export type IRI = string;

/**
 * =============================================================================
 * Typescript Typings for mediaShape
 * =============================================================================
 */

/**
 * Image Type
 */
export interface Image {
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
  "@type": Set<"https://schema.org/ImageObject" | (IRI & {})>;
  /**
   * Original IRI: https://schema.org/contentUrl
   */
  contentUrl: IRI;
  /**
   * Original IRI: https://schema.org/thumbnailUrl
   */
  thumbnailUrl?: IRI;
  /**
   * Original IRI: https://schema.org/caption
   */
  caption?: string;
  /**
   * Original IRI: https://schema.org/width
   */
  width?: number;
  /**
   * Original IRI: https://schema.org/height
   */
  height?: number;
  /**
   * Original IRI: http://www.w3.org/2003/12/exif/ns#dateTimeOriginal
   */
  dateTimeOriginal?: string;
  /**
   * Original IRI: http://www.w3.org/2003/12/exif/ns#gpsLatitude
   */
  gpsLatitude?: number;
  /**
   * Original IRI: http://www.w3.org/2003/12/exif/ns#gpsLongitude
   */
  gpsLongitude?: number;
}
