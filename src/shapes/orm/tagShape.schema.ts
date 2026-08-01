import type { Schema } from "@ng-org/shex-orm";

/**
 * =============================================================================
 * tagShapeSchema: Schema for tagShape
 * =============================================================================
 */
export const tagShapeSchema = {
  "did:ng:z:cairns/ConceptShape": {
    iri: "did:ng:z:cairns/ConceptShape",
    predicates: [
      {
        dataTypes: [
          {
            valType: "iri",
            literals: ["http://www.w3.org/2004/02/skos/core#Concept"],
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
        minCardinality: 1,
        iri: "http://www.w3.org/2004/02/skos/core#prefLabel",
        readablePredicate: "prefLabel",
      },
      {
        dataTypes: [
          {
            valType: "iri",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "http://www.w3.org/2004/02/skos/core#inScheme",
        readablePredicate: "inScheme",
      },
      {
        dataTypes: [
          {
            valType: "iri",
          },
        ],
        maxCardinality: -1,
        minCardinality: 0,
        iri: "http://www.w3.org/2004/02/skos/core#broader",
        readablePredicate: "broader",
      },
    ],
  },
} as const satisfies Schema;
