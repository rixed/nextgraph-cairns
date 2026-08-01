import type { ShapeType } from "@ng-org/shex-orm";
import { mediaShapeSchema } from "./mediaShape.schema.ts";
import type { Image } from "./mediaShape.typings.ts";

// ShapeTypes for mediaShape
export const ImageShapeType = {
  schema: mediaShapeSchema,
  shape: "did:ng:z:cairns/ImageShape",
} as const satisfies ShapeType<Image>;
