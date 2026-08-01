import type { Schema } from "@ng-org/shex-orm";

/**
 * =============================================================================
 * locationSpikeSchema: Schema for locationSpike
 * =============================================================================
 */
export const locationSpikeSchema = {
  "did:ng:z:cairns/SpikeMemoryShape": {
    iri: "did:ng:z:cairns/SpikeMemoryShape",
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
            valType: "shape",
            shape: "did:ng:z:cairns/SpikeUnnamedPlaceShape",
          },
          {
            valType: "shape",
            shape: "did:ng:z:cairns/SpikePlaceRefShape",
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
            valType: "shape",
            shape: "did:ng:z:cairns/SpikeBareNameShape",
          },
          {
            valType: "shape",
            shape: "did:ng:z:cairns/SpikePersonRefShape",
          },
        ],
        maxCardinality: -1,
        minCardinality: 0,
        iri: "https://schema.org/attendee",
        readablePredicate: "attendee",
      },
    ],
  },
  "did:ng:z:cairns/SpikeUnnamedPlaceShape": {
    iri: "did:ng:z:cairns/SpikeUnnamedPlaceShape",
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
            valType: "number",
          },
        ],
        maxCardinality: 1,
        minCardinality: 1,
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
        minCardinality: 1,
        iri: "http://www.w3.org/2003/01/geo/wgs84_pos#long",
        readablePredicate: "long",
      },
    ],
  },
  "did:ng:z:cairns/SpikePlaceRefShape": {
    iri: "did:ng:z:cairns/SpikePlaceRefShape",
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
        minCardinality: 1,
        iri: "https://schema.org/name",
        readablePredicate: "name",
      },
    ],
  },
  "did:ng:z:cairns/SpikeBareNameShape": {
    iri: "did:ng:z:cairns/SpikeBareNameShape",
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
        minCardinality: 1,
        iri: "http://xmlns.com/foaf/0.1/name",
        readablePredicate: "name",
      },
    ],
  },
  "did:ng:z:cairns/SpikePersonRefShape": {
    iri: "did:ng:z:cairns/SpikePersonRefShape",
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
        minCardinality: 1,
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
  "did:ng:z:cairns/SpikeMemoryRefsShape": {
    iri: "did:ng:z:cairns/SpikeMemoryRefsShape",
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
    ],
  },
} as const satisfies Schema;
