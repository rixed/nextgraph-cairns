import type { Schema } from "@ng-org/shex-orm";

/**
 * =============================================================================
 * placeShapeSchema: Schema for placeShape
 * =============================================================================
 */
export const placeShapeSchema = {
  "did:ng:z:cairns/PlaceShape": {
    iri: "did:ng:z:cairns/PlaceShape",
    predicates: [
      {
        dataTypes: [
          {
            valType: "iri",
            literals: ["https://schema.org/Place"],
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
            valType: "string",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "https://schema.org/name",
        readablePredicate: "name",
      },
      {
        dataTypes: [
          {
            valType: "iri",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "https://schema.org/geo",
        readablePredicate: "geo",
      },
      {
        dataTypes: [
          {
            valType: "number",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "http://www.w3.org/2003/01/geo/wgs84_pos#lat",
        readablePredicate: "lat",
      },
      {
        dataTypes: [
          {
            valType: "number",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "http://www.w3.org/2003/01/geo/wgs84_pos#long",
        readablePredicate: "long",
      },
      {
        dataTypes: [
          {
            valType: "string",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "https://schema.org/address",
        readablePredicate: "address",
      },
      {
        dataTypes: [
          {
            valType: "iri",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "https://schema.org/containedInPlace",
        readablePredicate: "containedInPlace",
      },
      {
        dataTypes: [
          {
            valType: "iri",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "http://www.w3.org/2002/07/owl#sameAs",
        readablePredicate: "sameAs",
      },
    ],
  },
} as const satisfies Schema;
