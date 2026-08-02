import type { ShapeType } from "@ng-org/shex-orm";
import { recommendationShapeSchema } from "./recommendationShape.schema.ts";
import type { Recommendation } from "./recommendationShape.typings.ts";

// ShapeTypes for recommendationShape
export const RecommendationShapeType = {
  schema: recommendationShapeSchema,
  shape: "did:ng:z:cairns/RecommendationShape",
} as const satisfies ShapeType<Recommendation>;
