// Every media document the app can discover, whatever its type.
//
// A media document is whatever its own application wrote, so the app reads
// images, videos and audio through three shapes and merges them into one list
// (§3.4). Screens deal in `Media`, not in shapes, and a type that cannot be
// pictured is a placeholder rather than an omission (§8).

import { useShape } from "@ng-org/orm/svelte";
import { OrmSubscription, normalizeScope } from "@ng-org/orm";
import {
    AudioShapeType,
    ImageShapeType,
    VideoShapeType,
} from "../shapes/orm/mediaShape.shapeTypes";
import type { Audio, Image, Video } from "../shapes/orm/mediaShape.typings";
import { toMedia, type Media } from "./media";

const SHAPES = [ImageShapeType, VideoShapeType, AudioShapeType] as const;

/** Call during component initialisation, like any other subscription hook. */
export function useAllMedia() {
    const images = useShape(ImageShapeType, "did:ng:i");
    const videos = useShape(VideoShapeType, "did:ng:i");
    const audios = useShape(AudioShapeType, "did:ng:i");
    return {
        get all(): Media[] {
            return [
                ...([...images] as unknown as Image[]).map((d) =>
                    toMedia(d, "image")
                ),
                ...([...videos] as unknown as Video[]).map((d) =>
                    toMedia(d, "video")
                ),
                ...([...audios] as unknown as Audio[]).map((d) =>
                    toMedia(d, "audio")
                ),
            ];
        },
    };
}

/** Resolves once every media subscription has delivered its first answer. */
export function mediaReady(): Promise<unknown> {
    return Promise.all(
        SHAPES.map(
            (s) =>
                OrmSubscription.getOrCreate(s as any, normalizeScope("did:ng:i"))
                    .readyPromise
        )
    );
}
