import type { ShapeType } from "@ng-org/shex-orm";
import { personShapeSchema } from "./personShape.schema.ts";
import type { Person, PeopleDoc } from "./personShape.typings.ts";

// ShapeTypes for personShape
export const PersonShapeType = {
  schema: personShapeSchema,
  shape: "did:ng:z:cairns/PersonShape",
} as const satisfies ShapeType<Person>;

export const PeopleDocShapeType = {
  schema: personShapeSchema,
  shape: "did:ng:z:cairns/PeopleDocShape",
} as const satisfies ShapeType<PeopleDoc>;
