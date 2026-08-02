import type { Schema } from "@ng-org/shex-orm";

/**
 * =============================================================================
 * personShapeSchema: Schema for personShape
 * =============================================================================
 */
export const personShapeSchema = {
  "did:ng:z:cairns/PersonShape": {
    iri: "did:ng:z:cairns/PersonShape",
    predicates: [
      {
        dataTypes: [
          {
            valType: "iri",
            literals: ["http://xmlns.com/foaf/0.1/Person"],
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
        iri: "http://xmlns.com/foaf/0.1/name",
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
        iri: "https://schema.org/image",
        readablePredicate: "image",
      },
    ],
  },
  "did:ng:z:cairns/PeopleDocShape": {
    iri: "did:ng:z:cairns/PeopleDocShape",
    predicates: [
      {
        dataTypes: [
          {
            valType: "iri",
            literals: ["http://xmlns.com/foaf/0.1/Group"],
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
        maxCardinality: -1,
        minCardinality: 0,
        iri: "http://xmlns.com/foaf/0.1/member",
        readablePredicate: "member",
      },
    ],
  },
} as const satisfies Schema;
