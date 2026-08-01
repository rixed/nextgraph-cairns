import type { ShapeType } from "@ng-org/shex-orm";
import { locationSpikeSchema } from "./locationSpike.schema.ts";
import type {
  SpikeMemory,
  SpikeUnnamedPlace,
  SpikePlaceRef,
  SpikeBareName,
  SpikePersonRef,
  SpikeMemoryRefs,
} from "./locationSpike.typings.ts";

// ShapeTypes for locationSpike
export const SpikeMemoryShapeType = {
  schema: locationSpikeSchema,
  shape: "did:ng:z:cairns/SpikeMemoryShape",
} as const satisfies ShapeType<SpikeMemory>;

export const SpikeUnnamedPlaceShapeType = {
  schema: locationSpikeSchema,
  shape: "did:ng:z:cairns/SpikeUnnamedPlaceShape",
} as const satisfies ShapeType<SpikeUnnamedPlace>;

export const SpikePlaceRefShapeType = {
  schema: locationSpikeSchema,
  shape: "did:ng:z:cairns/SpikePlaceRefShape",
} as const satisfies ShapeType<SpikePlaceRef>;

export const SpikeBareNameShapeType = {
  schema: locationSpikeSchema,
  shape: "did:ng:z:cairns/SpikeBareNameShape",
} as const satisfies ShapeType<SpikeBareName>;

export const SpikePersonRefShapeType = {
  schema: locationSpikeSchema,
  shape: "did:ng:z:cairns/SpikePersonRefShape",
} as const satisfies ShapeType<SpikePersonRef>;

export const SpikeMemoryRefsShapeType = {
  schema: locationSpikeSchema,
  shape: "did:ng:z:cairns/SpikeMemoryRefsShape",
} as const satisfies ShapeType<SpikeMemoryRefs>;
