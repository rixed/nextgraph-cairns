// Foreign media (Specs §3.4). Media documents belong to whichever application
// wrote them: this module reads descriptors and streams files, and writes only
// the memory's side of the association (`schema:subjectOf`, `schema:image`).
// There is no write path to a media document, and there never will be.

import { sessionPromise } from "./ngSession";
import { SPARQL_PREFIXES } from "./typedLiterals";
import { interval, parsePrecisionDate, type Interval } from "./dates";
import type { Image } from "../shapes/orm/mediaShape.typings";
import type { MediaNote, Memory } from "../shapes/orm/memoryShape.typings";

/** A media descriptor as the app cares about it, flattened from the shape. */
export interface Media {
    /** The media document's NURI — the value a memory's subjectOf holds. */
    doc: string;
    /** The descriptor's subject IRI (usually the document itself). */
    id: string;
    contentUrl: string;
    thumbnailUrl?: string;
    caption?: string;
    width?: number;
    height?: number;
    /** exif:dateTimeOriginal, the lexical form. */
    takenAt?: string;
    lat?: number;
    lon?: number;
}

export function toMedia(img: Image): Media {
    return {
        doc: img["@graph"],
        id: img["@id"],
        contentUrl: img.contentUrl,
        thumbnailUrl: img.thumbnailUrl,
        caption: img.caption,
        width: img.width,
        height: img.height,
        takenAt: img.dateTimeOriginal,
        lat: img.gpsLatitude,
        lon: img.gpsLongitude,
    };
}

/** When the photograph was taken, in epoch ms, if the descriptor says. */
export function takenAtMs(m: Media): number | undefined {
    if (!m.takenAt) return undefined;
    const t = Date.parse(m.takenAt);
    return Number.isNaN(t) ? undefined : t;
}

/**
 * Media whose capture time falls inside the memory's span (§3.4, "derived").
 * Never stored: this is recomputed every time, which is what makes capture
 * cheap — a memory written after the fact picks up the afternoon's photographs
 * without the user attaching anything.
 */
export function mediaInSpan(all: Media[], span: Interval): Media[] {
    return all
        .filter((m) => {
            const t = takenAtMs(m);
            return t !== undefined && t >= span.earliest && t <= span.latest;
        })
        .sort((a, b) => (takenAtMs(a) ?? 0) - (takenAtMs(b) ?? 0));
}

/** The span of a memory as stored, for the overlap above. */
export function spanOf(
    startDate: string | undefined,
    endDate?: string | null
): Interval | undefined {
    const start = parsePrecisionDate(startDate);
    if (!start) return undefined;
    const end = parsePrecisionDate(endDate ?? undefined);
    const s = interval(start);
    return end ? { earliest: s.earliest, latest: interval(end).latest } : s;
}

// ---------------------------------------------------------------------------
// Files
//
// `file_get` streams a whole file and there is no partial fetch (B-01): the
// grid must therefore ask for thumbnails only, keep a bounded number of
// fetches in flight, and let go of blobs it no longer shows. Spike 6 measured
// 1 ms per thumbnail with eight in flight against 52 ms sequentially, and
// 466 kB per full-size image against 10.7 kB per thumbnail.
// ---------------------------------------------------------------------------

const MAX_IN_FLIGHT = 8;
/** Resident blob URLs, oldest first. Roughly 1 MB at thumbnail sizes. */
const MAX_RESIDENT = 100;

const cache = new Map<string, Promise<string>>();
let inFlight = 0;
const queue: (() => void)[] = [];

function acquire(): Promise<void> {
    if (inFlight < MAX_IN_FLIGHT) {
        inFlight++;
        return Promise.resolve();
    }
    return new Promise((r) => queue.push(() => (inFlight++, r())));
}

function release() {
    inFlight--;
    queue.shift()?.();
}

function evictIfNeeded() {
    while (cache.size > MAX_RESIDENT) {
        const oldest = cache.keys().next().value as string;
        const entry = cache.get(oldest)!;
        cache.delete(oldest);
        entry.then(URL.revokeObjectURL).catch(() => {});
    }
}

/**
 * Stream a file out of its document and return a blob URL for it, fetching
 * each file at most once. Callers pass the *file* NURI (`did:ng:j:…:k:…`)
 * from a descriptor and the media document that holds it.
 */
export function fileUrl(fileNuri: string, mediaDoc: string): Promise<string> {
    const hit = cache.get(fileNuri);
    if (hit) return hit;

    const p = (async () => {
        await acquire();
        try {
            const s = await sessionPromise;
            let contentType = "";
            const parts: BlobPart[] = [];
            await new Promise<void>((resolve, reject) => {
                s.ng
                    .file_get(
                        s.session_id,
                        fileNuri,
                        mediaDoc,
                        async (msg: any) => {
                            if (msg.V0?.FileMeta)
                                contentType = msg.V0.FileMeta.content_type;
                            else if (msg.V0?.FileBinary)
                                parts.push(msg.V0.FileBinary);
                            else if (msg.V0 === "EndOfStream") resolve();
                        }
                    )
                    .catch(reject);
            });
            return URL.createObjectURL(
                new Blob(parts, { type: contentType })
            );
        } finally {
            release();
        }
    })();

    cache.set(fileNuri, p);
    // A failed fetch must not be cached as a permanent absence: the file may
    // simply not have synced yet (B-13).
    p.catch(() => cache.delete(fileNuri));
    evictIfNeeded();
    return p;
}

/** Forget every blob URL — for a hard navigation away from a media surface. */
export function releaseFiles() {
    for (const p of cache.values()) p.then(URL.revokeObjectURL).catch(() => {});
    cache.clear();
}

// ---------------------------------------------------------------------------
// The memory's side of an association
// ---------------------------------------------------------------------------

/** Attach a media document to a memory explicitly (§3.4). */
export async function attachMedia(
    memoryDoc: string,
    mediaDoc: string
): Promise<void> {
    const s = await sessionPromise;
    await s.ng.sparql_update(
        s.session_id,
        `${SPARQL_PREFIXES}
         INSERT DATA { GRAPH <${memoryDoc}> {
            <${memoryDoc}> schema:subjectOf <${mediaDoc}> } }`,
        memoryDoc
    );
}

/** Remove an explicit attachment. The media document itself is untouched. */
export async function detachMedia(
    memoryDoc: string,
    mediaDoc: string
): Promise<void> {
    const s = await sessionPromise;
    await s.ng.sparql_update(
        s.session_id,
        `${SPARQL_PREFIXES}
         DELETE DATA { GRAPH <${memoryDoc}> {
            <${memoryDoc}> schema:subjectOf <${mediaDoc}> } } ;
         DELETE WHERE { GRAPH <${memoryDoc}> {
            <${memoryDoc}> schema:image <${mediaDoc}> } }`,
        memoryDoc
    );
}

/**
 * The user's own note about one photograph. The app cannot write to a foreign
 * media document (§3.4), so the note lives on the memory as a nested
 * `schema:Comment` — which also means it is never confused with the foreign
 * caption it overrides for display.
 *
 * Nested objects go through the ORM (spike 4), so these take the live shape
 * object rather than a NURI.
 */
export function noteFor(
    memory: Memory,
    mediaDoc: string
): MediaNote | undefined {
    return [...(memory.comment ?? [])].find((c) => c.about === mediaDoc);
}

export function setMediaNote(memory: Memory, mediaDoc: string, text: string) {
    const trimmed = text.trim();
    const existing = noteFor(memory, mediaDoc);
    if (!trimmed) {
        if (existing) removeMediaNote(memory, existing);
        return;
    }
    if (existing) {
        existing.text = trimmed;
        return;
    }
    memory.comment ??= new Set();
    memory.comment.add({
        "@id": "",
        "@type": new Set(["https://schema.org/Comment"]),
        about: mediaDoc,
        text: trimmed,
    } as MediaNote);
}

/**
 * Removing a nested object unlinks it but leaves its own triples behind
 * (spike 4), so the orphan is cleaned up explicitly — otherwise it would still
 * match a shape subscription that scans for notes.
 */
export async function removeMediaNote(memory: Memory, note: MediaNote) {
    const doc = memory["@graph"];
    const subject = note["@id"];
    memory.comment?.delete(note);
    if (!subject) return;
    const s = await sessionPromise;
    await s.ng.sparql_update(
        s.session_id,
        `DELETE WHERE { GRAPH <${doc}> { <${subject}> ?p ?o } }`,
        doc
    );
}

/** Designate one of a memory's media as its cover, replacing any previous. */
export async function setCover(
    memoryDoc: string,
    mediaDoc: string | undefined
): Promise<void> {
    const s = await sessionPromise;
    const ops = [
        `DELETE WHERE { GRAPH <${memoryDoc}> { <${memoryDoc}> schema:image ?v } }`,
    ];
    if (mediaDoc)
        ops.push(
            `INSERT DATA { GRAPH <${memoryDoc}> {
                <${memoryDoc}> schema:image <${mediaDoc}> } }`
        );
    await s.ng.sparql_update(
        s.session_id,
        `${SPARQL_PREFIXES}\n` + ops.join(" ;\n"),
        memoryDoc
    );
}
