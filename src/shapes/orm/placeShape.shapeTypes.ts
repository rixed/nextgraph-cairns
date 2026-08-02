import type { ShapeType } from "@ng-org/shex-orm";
import { placeShapeSchema } from "./placeShape.schema.ts";
import type { Place } from "./placeShape.typings.ts";

// ShapeTypes for placeShape
export const PlaceShapeType = {
  schema: placeShapeSchema,
  shape: "did:ng:z:cairns/PlaceShape",
} as const satisfies ShapeType<Place>;
