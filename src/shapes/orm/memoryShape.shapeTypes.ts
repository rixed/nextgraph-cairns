import type { ShapeType } from "@ng-org/shex-orm";
import { memoryShapeSchema } from "./memoryShape.schema.ts";
import type {
  Memory,
  MediaNote,
  UnnamedPlace,
  BareNamePerson,
} from "./memoryShape.typings.ts";

// ShapeTypes for memoryShape
export const MemoryShapeType = {
  schema: memoryShapeSchema,
  shape: "did:ng:z:cairns/MemoryShape",
} as const satisfies ShapeType<Memory>;

export const MediaNoteShapeType = {
  schema: memoryShapeSchema,
  shape: "did:ng:z:cairns/MediaNoteShape",
} as const satisfies ShapeType<MediaNote>;

export const UnnamedPlaceShapeType = {
  schema: memoryShapeSchema,
  shape: "did:ng:z:cairns/UnnamedPlaceShape",
} as const satisfies ShapeType<UnnamedPlace>;

export const BareNamePersonShapeType = {
  schema: memoryShapeSchema,
  shape: "did:ng:z:cairns/BareNamePersonShape",
} as const satisfies ShapeType<BareNamePerson>;
