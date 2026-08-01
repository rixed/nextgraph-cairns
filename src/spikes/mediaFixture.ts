// The media fixture: stands in for the applications Cairns does not have.
//
// Cairns never writes a binary and has no camera (Specs §1.2.8, §3.4, and the
// milestone-2 decision that there is no camera button at all). Media therefore
// only exist in the store because some *other* application put them there — so
// for development and for spike 6 this module plays that other application,
// writing image documents Cairns then discovers as foreign evidence.
//
// Everything here is deliberately outside src/lib: the app must never gain a
// write path to a media document.

import { sessionPromise } from "../lib/ngSession";

/**
 * Encode a 32-byte id/key as NextGraph does: serde_bare enum (1 discriminant
 * byte + 32 bytes), reversed, base64url — 44 chars (SpikeFindings, spike 3).
 */
function encodeNgRef(bytes: number[], variant = 0): string {
    const buf = new Uint8Array(33);
    buf[0] = variant;
    buf.set(bytes, 1);
    buf.reverse();
    return btoa(String.fromCharCode(...buf))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");
}

function refToNuri(ref: any): string {
    return `did:ng:j:${encodeNgRef(ref.id.Blake3Digest32)}:k:${encodeNgRef(ref.key.ChaCha20Key)}`;
}

const CHUNK = 1024 * 1024;

/** Upload a blob into a document as the owning app would; returns its NURI. */
export async function putFile(
    docNuri: string,
    blob: Blob,
    filename: string
): Promise<string> {
    const s = await sessionPromise;
    const start = await s.ng.app_request_with_nuri_command(
        docNuri,
        "FilePut",
        s.session_id,
        { RandomAccessFilePut: blob.type }
    );
    const uploadId = start.V0.FileUploading;

    const buf = new Uint8Array(await blob.arrayBuffer());
    for (let off = 0; off < buf.length; off += CHUNK)
        await s.ng.upload_chunk(
            s.session_id,
            uploadId,
            buf.subarray(off, Math.min(off + CHUNK, buf.length)),
            docNuri
        );
    const done = await s.ng.upload_chunk(s.session_id, uploadId, [], docNuri);
    // Deep-clone: RPC results are proxies and cannot cross the bridge again.
    const ref = JSON.parse(JSON.stringify(done.V0.FileUploaded));

    await s.ng.app_request_with_nuri_command(docNuri, "FilePut", s.session_id, {
        AddFile: { filename, object: ref },
    });
    return refToNuri(ref);
}

export interface FetchedFile {
    blob: Blob;
    bytes: number;
    ms: number;
}

/** Stream a file out of its document and assemble it (the app's read path). */
export async function fetchFile(
    fileNuri: string,
    docNuri: string
): Promise<FetchedFile> {
    const s = await sessionPromise;
    const t0 = performance.now();
    let contentType = "";
    const parts: BlobPart[] = [];
    let bytes = 0;
    await new Promise<void>((resolve, reject) => {
        s.ng
            .file_get(s.session_id, fileNuri, docNuri, async (msg: any) => {
                if (msg.V0?.FileMeta) contentType = msg.V0.FileMeta.content_type;
                else if (msg.V0?.FileBinary) {
                    parts.push(msg.V0.FileBinary);
                    bytes += msg.V0.FileBinary.length ?? 0;
                } else if (msg.V0 === "EndOfStream") resolve();
            })
            .catch(reject);
    });
    return {
        blob: new Blob(parts, { type: contentType }),
        bytes,
        ms: performance.now() - t0,
    };
}

/** A photograph-sized JPEG of plausible entropy, or a small PNG thumbnail. */
export async function makeImage(
    w: number,
    h: number,
    label: string,
    type: "image/jpeg" | "image/png" = "image/jpeg"
): Promise<Blob> {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    // Noise, so the encoder cannot compress this down to nothing: a fixture
    // that produces 2 kB "photographs" would measure the wrong thing.
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = Math.random() * 255;
        img.data[i + 1] = Math.random() * 255;
        img.data[i + 2] = Math.random() * 255;
        img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, Math.floor(h / 2) - 14, w, 28);
    ctx.fillStyle = "#fff";
    ctx.font = `${Math.max(10, Math.floor(h / 12))}px sans-serif`;
    ctx.fillText(label, 6, Math.floor(h / 2) + 6);
    return await new Promise((r) => c.toBlob((b) => r(b!), type, 0.8));
}

/**
 * A short clip, recorded the way a phone would produce one. MediaRecorder
 * gives real webm rather than bytes pretending to be a video, which is the
 * point: Cairns should meet media it did not fabricate.
 */
export async function makeClip(
    kind: "video" | "audio",
    ms = 1200
): Promise<Blob> {
    const mimeType = kind === "video" ? "video/webm" : "audio/webm";
    let stream: MediaStream;
    let stop = () => {};

    if (kind === "video") {
        const c = document.createElement("canvas");
        c.width = 320;
        c.height = 240;
        const ctx = c.getContext("2d")!;
        let f = 0;
        const timer = setInterval(() => {
            ctx.fillStyle = `hsl(${(f * 7) % 360} 70% 50%)`;
            ctx.fillRect(0, 0, 320, 240);
            ctx.fillStyle = "#fff";
            ctx.font = "24px sans-serif";
            ctx.fillText(`frame ${f++}`, 20, 120);
        }, 100);
        stream = (c as any).captureStream(10);
        stop = () => clearInterval(timer);
    } else {
        const ac = new AudioContext();
        const osc = ac.createOscillator();
        const dest = ac.createMediaStreamDestination();
        osc.frequency.value = 440;
        osc.connect(dest);
        osc.start();
        stream = dest.stream;
        stop = () => {
            osc.stop();
            ac.close();
        };
    }

    const chunks: BlobPart[] = [];
    const rec = new MediaRecorder(stream, { mimeType });
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start();
    await new Promise((r) => setTimeout(r, ms));
    rec.stop();
    await done;
    stop();
    return new Blob(chunks, { type: mimeType });
}

export interface MediaSpec {
    /** What the other application wrote. Images are the common case. */
    kind?: "image" | "video" | "audio";
    /** xsd:dateTime lexical form for exif:dateTimeOriginal. */
    when: string;
    lat?: number;
    lon?: number;
    /** Without one, Cairns must show a placeholder and never shrink the full size. */
    withThumbnail: boolean;
    caption?: string;
    label: string;
}

/** Write one media document — descriptor plus binaries — as a camera would. */
export async function createMediaDoc(spec: MediaSpec): Promise<string> {
    const s = await sessionPromise;
    const kind = spec.kind ?? "image";
    const doc: string = await s.ng.doc_create(
        s.session_id,
        "Graph",
        "data:graph",
        "store",
        undefined
    );

    const content =
        kind === "image"
            ? await makeImage(1024, 768, spec.label, "image/jpeg")
            : await makeClip(kind);
    const ext = kind === "image" ? "jpg" : "webm";
    const contentUrl = await putFile(doc, content, `${spec.label}.${ext}`);

    // Audio has no thumbnail to publish, ever: that is a fact about the medium
    // rather than a gap in the source (§3.4).
    const thumbUrl =
        spec.withThumbnail && kind !== "audio"
            ? await putFile(
                  doc,
                  await makeImage(160, 120, spec.label, "image/jpeg"),
                  `${spec.label}-thumb.jpg`
              )
            : undefined;

    const type = {
        image: "schema:ImageObject",
        video: "schema:VideoObject",
        audio: "schema:AudioObject",
    }[kind];

    const triples = [
        `<${doc}> a ${type}`,
        `<${doc}> schema:contentUrl <${contentUrl}>`,
        `<${doc}> exif:dateTimeOriginal "${spec.when}"^^xsd:dateTime`,
    ];
    if (kind !== "audio")
        triples.push(
            `<${doc}> schema:width "${kind === "image" ? 1024 : 320}"^^xsd:integer`,
            `<${doc}> schema:height "${kind === "image" ? 768 : 240}"^^xsd:integer`
        );
    if (kind !== "image") triples.push(`<${doc}> schema:duration "PT1S"`);
    if (thumbUrl) triples.push(`<${doc}> schema:thumbnailUrl <${thumbUrl}>`);
    if (spec.caption)
        triples.push(`<${doc}> schema:caption "${spec.caption}"`);
    if (spec.lat !== undefined)
        triples.push(
            `<${doc}> exif:gpsLatitude "${spec.lat}"^^xsd:decimal`,
            `<${doc}> exif:gpsLongitude "${spec.lon}"^^xsd:decimal`
        );

    await s.ng.sparql_update(
        s.session_id,
        `PREFIX schema: <https://schema.org/>
         PREFIX exif: <http://www.w3.org/2003/12/exif/ns#>
         PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
         INSERT DATA { GRAPH <${doc}> {\n${triples.join(" .\n")} .\n} }`,
        doc
    );
    return doc;
}
