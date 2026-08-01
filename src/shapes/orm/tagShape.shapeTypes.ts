import type { ShapeType } from "@ng-org/shex-orm";
import { tagShapeSchema } from "./tagShape.schema.ts";
import type { Concept } from "./tagShape.typings.ts";

// ShapeTypes for tagShape
export const ConceptShapeType = {
  schema: tagShapeSchema,
  shape: "did:ng:z:cairns/ConceptShape",
} as const satisfies ShapeType<Concept>;
