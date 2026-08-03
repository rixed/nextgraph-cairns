import type { Schema } from "@ng-org/shex-orm";

/**
 * =============================================================================
 * recommendationShapeSchema: Schema for recommendationShape
 * =============================================================================
 */
export const recommendationShapeSchema = {
  "did:ng:z:cairns/RecommendationShape": {
    iri: "did:ng:z:cairns/RecommendationShape",
    predicates: [
      {
        dataTypes: [
          {
            valType: "iri",
            literals: ["did:ng:z:cairns/Recommendation"],
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
        iri: "https://schema.org/item",
        readablePredicate: "item",
      },
      {
        dataTypes: [
          {
            valType: "iri",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "http://www.w3.org/ns/prov#wasAttributedTo",
        readablePredicate: "wasAttributedTo",
      },
      {
        dataTypes: [
          {
            valType: "string",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "http://purl.org/dc/terms/source",
        readablePredicate: "source",
      },
      {
        dataTypes: [
          {
            valType: "string",
          },
          {
            valType: "string",
          },
          {
            valType: "string",
          },
          {
            valType: "string",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "http://purl.org/dc/terms/date",
        readablePredicate: "date",
      },
      {
        dataTypes: [
          {
            valType: "string",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "https://schema.org/description",
        readablePredicate: "description",
      },
      {
        dataTypes: [
          {
            valType: "iri",
          },
        ],
        maxCardinality: -1,
        minCardinality: 0,
        iri: "http://purl.org/dc/terms/subject",
        readablePredicate: "subject",
      },
    ],
  },
} as const satisfies Schema;
