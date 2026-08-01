# Spike findings

Answers to the four technical risks identified before planning milestone 1, measured
against a real NextGraph devstack (ngd + auth on `localhost:14400`, app served by Vite on
`localhost:4567`, wallet `user5`). Spike code lives in `src/spikes/`, driven headless via
Playwright (`tools/browse.mjs`; needs system Chrome, see Environment notes). SDK versions:
`@ng-org/web 0.1.2-alpha.13`, `@ng-org/orm 0.1.2-alpha.19`, `@ng-org/shex-orm 0.1.2-alpha.8`.

## Spike 1 — one document per memory vs. subscription scope

**Question.** Can the app browse "all memories" when every memory is its own document?

**Answer: yes, and more easily than feared.** The ORM scope `{ graphs: "did:ng:i" }` is a
documented wildcard meaning *the whole user dataset*. It works, it is fast, and it is
**live across document creation**: a memory document created while the subscription was
open appeared in the signal set without re-subscribing. The
enumerate-then-subscribe-then-refresh machinery we planned (`memoryIndex.ts`) is
unnecessary; explicit graph lists also work when a narrower scope is wanted.

Measurements (211 memory documents, each `a app:Memory` with `schema:name` +
`schema:startDate`):

| Operation | Time |
|---|---|
| `doc_create` + one `sparql_update`, per document | ~78 ms |
| SPARQL enumeration of all 211 docs (`GRAPH ?doc { ?s a app:Memory }`) | 14–20 ms |
| `useShape` wildcard subscription, empty → 211 objects | ~880 ms |
| Same at 11 documents | 22–45 ms |

**Caveat (real doc-per-memory cost).** After login, the engine syncs every repo before
answering queries: with ~220 documents, SPARQL queries and subscriptions were
unresponsive for roughly a minute after the session opened. At 10 documents this was
imperceptible. Session startup work appears to scale with repo count — for a memory
archive of thousands this needs watching, and it is the first genuine SDK/engine
limitation this project surfaces. The app must render its shell before data arrives
(which Specs §8 "partially loaded" already mandates).

## Spike 2 — variable-precision dates through shex-orm

**Question.** Specs §3.1 encodes precision in the literal datatype
(`xsd:dateTime|date|gYearMonth|gYear`). Does that survive the SHEX → ORM pipeline?

**Answer: reads yes, ORM writes no.**

- A SHEX union `schema:startDate xsd:dateTime OR xsd:date OR xsd:gYearMonth OR xsd:gYear`
  compiles and generates TS type `string`. The compiled schema, however, reduces every
  value constraint to its **JS-facing kind** — `string | number | boolean | iri | shape`
  (`shex-orm`'s `rdfDataTypeToBasic`) — dropping the XSD datatype IRI that the `.shex`
  source declares. The engine itself is fully datatype-aware (typed literals store,
  round-trip, and answer `DATATYPE()` correctly), and ORM writes of JS numbers produce
  proper typed literals (`38.7` → `xsd:decimal`, verified). The casualty is every XSD
  type whose JS representation is a string: the date/time family gets written as
  `xsd:string`.
- **Read path:** literals of all four datatypes (inserted via `sparql_update` with
  `"2019"^^xsd:gYear` etc.) all match the shape and appear in `useShape` results. The
  ORM returns the lexical form only (`"2019-08"`), but precision is recoverable from the
  lexical shape, so the collation rule (§3.1) can be implemented app-side.
- **Write path:** setting `memory.startDate = "2021-03"` through the ORM stores a literal
  with datatype **`xsd:string`** — wrong for interop and for SPARQL date comparisons.

**Design decision.** Dates are written via a small `sparql_update` helper that emits
properly-typed literals; everything else about a memory can go through the ORM. (SDK
improvement candidate: preserve `NodeConstraint.datatype` in the compiled schema and use
it when serializing writes.) SPARQL `FILTER` over mixed-precision dates works when the
compared values are properly typed.

## Spike 3 — discovering and displaying foreign media

**Question.** Media are foreign documents (§3.4). What do `schema:contentUrl` /
`schema:thumbnailUrl` hold in NextGraph terms, and can the app turn them into pixels?

**Answer: yes, end to end.** Playing the camera app, the spike created a media document,
attached a real PNG binary to it, wrote a `schema:ImageObject` descriptor, then — as
Cairns — discovered it by SPARQL, resolved the reference, and rendered the image.

- **A file reference is a NURI string** `did:ng:j:<id>:k:<key>` (each part 44 chars:
  serde_bare enum encoding — 1 discriminant byte + 32 bytes — byte-reversed, base64url).
  This is what a descriptor's `contentUrl`/`thumbnailUrl` should hold, plus the media
  document's NURI to use as the `branch_nuri` (the memory's `schema:subjectOf` points at
  the media document, so both parts are known).
- **Write API** (used by the fixture/"camera", not by Cairns):
  `app_request_with_nuri_command(docNuri, "FilePut", session_id, {RandomAccessFilePut: mimetype})`
  → upload id; `upload_chunk(session_id, upload_id, chunk, docNuri)` per ~1 MiB chunk;
  empty chunk finishes → `{FileUploaded: {id, key}}`; then
  `{AddFile: {filename, object}}` via the same command.
- **Read API:** `file_get(session_id, fileNuri, mediaDocNuri, callback)` streams
  `FileMeta {content_type, size}`, then `FileBinary` chunks, then `"EndOfStream"` →
  assemble a `Blob`, `URL.createObjectURL`, done. Verified: `<img>` renders (96×96).
- **Derived association by time overlap** is a plain SPARQL `FILTER` over
  `exif:dateTimeOriginal` against the memory's span. Works.

**Boundary register (B-01).** `file_get` streams the *whole* file; there is no
server-side thumbnail or partial fetch. The spec's "no thumbnail → placeholder, never
fetch-and-shrink" rule is therefore load-bearing: until someone in the ecosystem
publishes derived representations, sources without `thumbnailUrl` yield placeholder
tiles.

**Bridge gotchas** (cost an hour; worth remembering):

- Values returned by `ng.*` RPC calls and Svelte 5 `$state` objects are **proxies**;
  passing either back into an `ng.*` call throws `DataCloneError` at the `postMessage`
  bridge. Deep-clone RPC results you intend to resend; keep such handles out of
  `$state`.
- `file_get` over the web bridge takes the NURI **string**, not the `{id, key}` object
  the official (Tauri) app passes.

## Spike 4 — nested no-URI objects

**Question.** Do unnamed locations (§3.2) and bare-name people (§3.3) work as nested
shape objects?

**Answer: yes, with two nuances.**

- Insert through the ORM works, including the **singular mixed union**
  `schema:attendee @app:BareNamePersonShape OR IRI ?`. Nested objects read back as full
  objects and render reactively.
- **"No URI" is actually a skolem IRI**: the engine mints
  `did:ng:o:<doc>:q:<random>` subjects for nested objects (not blank nodes). They live
  inside the memory's graph, so the spec's intent holds (not indexed, not shared,
  promotion = rewriting the link to a real place URI), but they *are* addressable
  strings — promotion (S-33) can literally reuse the subject rewrite.
- **`set.delete(nested)` removes only the parent linkage**; the nested object's own
  triples (`a schema:Place`, `geo:lat`…) remain orphaned in the graph. The app must
  clean up with a `DELETE WHERE` on the orphan subject — otherwise orphans would match
  wildcard-scope shape subscriptions (e.g. a future `UnnamedPlaceShape` scan). SDK
  improvement candidate.

**Codegen limitation found on the way:** `shex-orm` rejects **plural** mixed unions —
`schema:location @app:UnnamedPlaceShape OR IRI *` fails codegen with "Mixed plural union
(object + primitive) not supported". Locations (0..N, nested or reference) are exactly
that shape. Options for milestone 1: model `schema:location` as an all-object union
(`@app:UnnamedPlaceShape OR @app:PlaceRefShape *`), or read locations through a second
shape/SPARQL. To be decided during milestone-1 planning; the ORM's
`parent.children.add({"@id": iri})` linkage idiom suggests the all-object route.

## Environment notes

- Wallets pin the broker's peer key: after `make reset`/re-key of the devstack, old
  `.ngw` files fail with `NoiseHandshakeFailed` — re-run `make provision`.
- Headless Chrome (v143+) blocks the wallet→app iframe with
  `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`; launch with
  `--disable-features=LocalNetworkAccessChecks` for automated testing.
- Vite needs `build.target: "esnext"` plus `vite-plugin-wasm` and
  `vite-plugin-top-level-await` for the `@ng-org/web` bridge.

## What this means for milestone 1

1. Doc-per-memory stands, with the wildcard scope as the default browse subscription;
   no index layer needed. Watch session-start sync time as archives grow.
2. Write dates (and only dates) via a typed-literal `sparql_update` helper; read
   precision from lexical form.
3. Media pipeline is proven: descriptor discovery by SPARQL, `did:ng:j:` refs,
   `file_get` → blob URL. A fixture script stands in for the missing camera app.
4. Nested objects work; add explicit orphan cleanup on removal, and pick the location
   union workaround during planning.
