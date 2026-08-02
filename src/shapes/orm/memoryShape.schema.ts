import type { Schema } from "@ng-org/shex-orm";

/**
 * =============================================================================
 * memoryShapeSchema: Schema for memoryShape
 * =============================================================================
 */
export const memoryShapeSchema = {
  "did:ng:z:cairns/MemoryShape": {
    iri: "did:ng:z:cairns/MemoryShape",
    predicates: [
      {
        dataTypes: [
          {
            valType: "iri",
            literals: ["did:ng:z:cairns/Memory"],
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
        minCardinality: 1,
        iri: "https://schema.org/startDate",
        readablePredicate: "startDate",
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
        iri: "https://schema.org/endDate",
        readablePredicate: "endDate",
      },
      {
        dataTypes: [
          {
            valType: "string",
          },
        ],
        maxCardinality: 1,
        minCardinality: 0,
        iri: "https://schema.org/text",
        readablePredicate: "text",
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
        iri: "https://schema.org/location",
        readablePredicate: "location",
      },
      {
        dataTypes: [
          {
            valType: "iri",
          },
        ],
        maxCardinality: -1,
        minCardinality: 0,
        iri: "https://schema.org/attendee",
        readablePredicate: "attendee",
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
      {
        dataTypes: [
          {
            valType: "iri",
          },
        ],
        maxCardinality: -1,
        minCardinality: 0,
        iri: "https://schema.org/subjectOf",
        readablePredicate: "subjectOf",
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
      {
        dataTypes: [
          {
            valType: "shape",
            shape: "did:ng:z:cairns/MediaNoteShape",
          },
        ],
        maxCardinality: -1,
        minCardinality: 0,
        iri: "https://schema.org/comment",
        readablePredicate: "comment",
      },
    ],
  },
  "did:ng:z:cairns/MediaNoteShape": {
    iri: "did:ng:z:cairns/MediaNoteShape",
    predicates: [
      {
        dataTypes: [
          {
            valType: "iri",
            literals: ["https://schema.org/Comment"],
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
        iri: "https://schema.org/about",
        readablePredicate: "about",
      },
      {
        dataTypes: [
          {
            valType: "string",
          },
        ],
        maxCardinality: 1,
        minCardinality: 1,
        iri: "https://schema.org/text",
        readablePredicate: "text",
      },
    ],
  },
} as const satisfies Schema;
