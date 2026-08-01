<script lang="ts">
    import { sessionPromise } from "../lib/ngSession";
    import { createGraphDoc, select, update } from "./spikeUtils";

    let log = $state<string[]>([]);
    let imgUrl = $state<string | undefined>();
    let mediaDoc = $state<string | undefined>();
    // Plain variable, NOT $state: the reactive proxy cannot cross the
    // postMessage bridge (DataCloneError).
    let fileRef: any;

    const say = (s: string) => {
        log = [...log, s];
        console.log("[spike3]", s);
    };

    /**
     * Encode a 32-byte id/key as NextGraph does: serde_bare enum
     * (1 discriminant byte + 32 bytes), reversed, base64url. 44 chars.
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

    function fileNuri(): string {
        return `did:ng:j:${encodeNgRef(fileRef.id.Blake3Digest32)}:k:${encodeNgRef(fileRef.key.ChaCha20Key)}`;
    }

    /** A small PNG generated locally (the "camera"). */
    async function makePng(): Promise<Blob> {
        const c = document.createElement("canvas");
        c.width = c.height = 96;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#4a7";
        ctx.fillRect(0, 0, 96, 96);
        ctx.fillStyle = "#fff";
        ctx.font = "16px sans-serif";
        ctx.fillText("cairn", 24, 52);
        return await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
    }

    async function uploadAsCameraApp() {
        try {
            const s = await sessionPromise;
            mediaDoc = await createGraphDoc();
            say(`media doc: ${mediaDoc}`);
            const blob = await makePng();
            const buf = await blob.arrayBuffer();

            const start = await s.ng.app_request_with_nuri_command(
                mediaDoc,
                "FilePut",
                s.session_id,
                { RandomAccessFilePut: "image/png" }
            );
            say(`FilePut start → ${JSON.stringify(start)}`);
            const uploadId = start.V0.FileUploading;

            // Single chunk (file is tiny), then empty chunk to finish.
            await s.ng.upload_chunk(s.session_id, uploadId, new Uint8Array(buf), mediaDoc);
            const done = await s.ng.upload_chunk(s.session_id, uploadId, [], mediaDoc);
            say(`upload done → ${JSON.stringify(done)}`);
            fileRef = JSON.parse(JSON.stringify(done.V0.FileUploaded));

            await s.ng.app_request_with_nuri_command(
                mediaDoc,
                "FilePut",
                s.session_id,
                { AddFile: { filename: "spike.png", object: fileRef } }
            );
            say(`AddFile ok; file reference = ${JSON.stringify(fileRef)}`);
        } catch (e) {
            say(`ERROR: ${e}`);
        }
    }

    async function writeDescriptor() {
        if (!mediaDoc || !fileRef) return say("upload first");
        await update(
            `PREFIX schema: <https://schema.org/>
             PREFIX exif: <http://www.w3.org/2003/12/exif/ns#>
             PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
             INSERT DATA { GRAPH <${mediaDoc}> {
                <${mediaDoc}> a schema:ImageObject ;
                    schema:contentUrl <${fileNuri()}> ;
                    schema:caption "spike photo" ;
                    exif:dateTimeOriginal "2020-05-01T15:00:00"^^xsd:dateTime ;
                    exif:gpsLatitude "38.7"^^xsd:decimal ;
                    exif:gpsLongitude "-9.4"^^xsd:decimal .
             } }`,
            mediaDoc
        );
        say("descriptor written");
    }

    async function display() {
        if (!mediaDoc || !fileRef) return say("upload first");
        try {
            const s = await sessionPromise;
            let contentType = "";
            let parts: BlobPart[] = [];
            say(`file_get with nuri ${fileNuri()}`);
            await s.ng.file_get(
                s.session_id,
                fileNuri(),
                mediaDoc,
                async (blob: any) => {
                    if (blob.V0?.FileMeta) {
                        contentType = blob.V0.FileMeta.content_type;
                        say(`FileMeta: ${JSON.stringify(blob.V0.FileMeta)}`);
                    } else if (blob.V0?.FileBinary) {
                        parts.push(blob.V0.FileBinary);
                    } else if (blob.V0 === "EndOfStream") {
                        imgUrl = URL.createObjectURL(
                            new Blob(parts, { type: contentType })
                        );
                        say(`blob URL created (${parts.length} chunks)`);
                    }
                }
            );
        } catch (e) {
            say(`ERROR: ${e}`);
        }
    }

    async function derivedAssociationQuery() {
        const rows = await select(
            `PREFIX exif: <http://www.w3.org/2003/12/exif/ns#>
             PREFIX schema: <https://schema.org/>
             SELECT ?img ?t WHERE { GRAPH ?g {
                ?img a schema:ImageObject ; exif:dateTimeOriginal ?t .
                FILTER (?t >= "2020-05-01T00:00:00"^^<http://www.w3.org/2001/XMLSchema#dateTime>
                     && ?t <  "2020-05-02T00:00:00"^^<http://www.w3.org/2001/XMLSchema#dateTime>)
             } }`
        );
        say(`media within 2020-05-01 span: ${rows.length}`);
        rows.forEach((r) => say(`  ${r.img?.value} @ ${r.t?.value}`));
    }
</script>

<div>
    <h2 class="text-lg font-semibold">Spike 3 — foreign media</h2>
    <div class="flex flex-wrap gap-2 my-2">
        <button class="btn btn-sm" onclick={uploadAsCameraApp}>1 · upload as "camera app"</button>
        <button class="btn btn-sm" onclick={writeDescriptor}>2 · write RDF descriptor</button>
        <button class="btn btn-sm" onclick={display}>3 · file_get → display</button>
        <button class="btn btn-sm" onclick={derivedAssociationQuery}>4 · time-overlap query</button>
    </div>

    {#if imgUrl}
        <img src={imgUrl} alt="spike" class="border rounded w-24 h-24" />
    {/if}

    <pre class="text-xs bg-base-200 p-2 rounded max-h-72 overflow-y-auto">{log.join("\n")}</pre>
</div>
