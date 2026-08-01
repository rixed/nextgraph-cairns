import type { Schema } from "@ng-org/shex-orm";

/**
 * =============================================================================
 * mediaShapeSchema: Schema for mediaShape
 * =============================================================================
 */
export const mediaShapeSchema = {
  "did:ng:z:cairns/ImageShape": {
    iri: "did:ng:z:cairns/ImageShape",
    predicates: [
      {
        dataTypes: [
          {
            valType: "iri",
            literals: ["https://schema.org/ImageObject"],
          },
        ],
        maxCardinality: 1,
        minCardinality: 1,
        iri: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        readablePredicate: "@type",
        extra: true,
      },
      {
        dataTypes: [
          {
            valType: "iri",
          },
        ],
        maxCardinality: 1,
        minCardinality: 1,
        iri: "https://schema.org/contentUrl",
        readablePredicate: "contentUrl",
      },
      {
        dataTypes: [
          {
            valType: "iri",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "https://schema.org/thumbnailUrl",
        readablePredicate: "thumbnailUrl",
      },
      {
        dataTypes: [
          {
            valType: "string",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "https://schema.org/caption",
        readablePredicate: "caption",
      },
      {
        dataTypes: [
          {
            valType: "number",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "https://schema.org/width",
        readablePredicate: "width",
      },
      {
        dataTypes: [
          {
            valType: "number",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "https://schema.org/height",
        readablePredicate: "height",
      },
      {
        dataTypes: [
          {
            valType: "string",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "http://www.w3.org/2003/12/exif/ns#dateTimeOriginal",
        readablePredicate: "dateTimeOriginal",
      },
      {
        dataTypes: [
          {
            valType: "number",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "http://www.w3.org/2003/12/exif/ns#gpsLatitude",
        readablePredicate: "gpsLatitude",
      },
      {
        dataTypes: [
          {
            valType: "number",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "http://www.w3.org/2003/12/exif/ns#gpsLongitude",
        readablePredicate: "gpsLongitude",
      },
    ],
  },
} as const satisfies Schema;
