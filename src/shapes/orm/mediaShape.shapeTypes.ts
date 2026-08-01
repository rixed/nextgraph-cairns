import type { ShapeType } from "@ng-org/shex-orm";
import { mediaShapeSchema } from "./mediaShape.schema.ts";
import type { Image, Video, Audio } from "./mediaShape.typings.ts";

// ShapeTypes for mediaShape
export const ImageShapeType = {
  schema: mediaShapeSchema,
  shape: "did:ng:z:cairns/ImageShape",
} as const satisfies ShapeType<Image>;

export const VideoShapeType = {
  schema: mediaShapeSchema,
  shape: "did:ng:z:cairns/VideoShape",
} as const satisfies ShapeType<Video>;

export const AudioShapeType = {
  schema: mediaShapeSchema,
  shape: "did:ng:z:cairns/AudioShape",
} as const satisfies ShapeType<Audio>;
