# Spike findings

Answers to the technical risks identified before planning each milestone — spikes 1–4 before
milestone 1, spikes 5–6 before milestone 2 (media and evidence), spike 7 before milestone 3
(space and places) — measured
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

## Spike 5 — the rejections JSON document

**Question.** Every rejection the user makes (§3.9) goes in one app-private JSON document,
keyed by the URIs it concerns. Nothing in the app touches a non-graph document yet: can such
a document be found again, do URI-shaped keys survive, does it round-trip?

**Answer: yes on every count, and it is the cheapest thing measured so far.**

- **A discrete document has a graph part too, and it accepts triples.** SPARQL sees only the
  RDF side, so an Automerge document would otherwise be unfindable after a reload. Tagging it
  `<doc> a did:ng:z:cairns/Rejections` in its own graph and finding it with the ordinary
  `SELECT ?doc WHERE { GRAPH ?doc { ?s a … } }` idiom works — same pattern as every graph
  document the app already creates.
- **URI-shaped object keys survive.** `suppressedMedia["did:ng:o:…:v:…"] = ["did:ng:j:…:k:…"]`
  round-trips unchanged, including a key containing `/` and `#`, so §3.9's "keyed by the URIs
  they concern" can be taken literally rather than encoded around.
- **Array items get an engine-assigned `@id`**, replacing the temporary `tmp-N` seen locally
  — the `{#each}` key, as `NextGraph.md` §7 says.
- **`DiscreteOrmSubscription.getOrCreate` pools per document**: two callers receive the *same*
  signal object, so two screens reading suppressions share state without any app-side cache.
- **Persistence verified in a fresh session**, not merely a re-subscription: after a full
  reload the document still held its 200 bulk keys, its suppression entry and its dismissal.

| Operation | Time |
|---|---|
| `doc_create` (Automerge / `data:json`) | 109 ms |
| Tagging its graph part, then finding it by SPARQL | 4 ms |
| `DiscreteOrmSubscription.getOrCreate` + `readyPromise` | 7 ms |
| Writing three rejection entries | 2 ms |
| 200 keyed entries in one transaction | 5 ms |
| Re-opening after `close()` | 3 ms |

**Untested:** concurrent writers on two devices. Suppressions append to a per-memory array, and
Automerge merges concurrent inserts, so the merge-safe shape is already the one in use; a
last-writer-wins scalar (`declinedDerivedLocation[memory] = true`) is idempotent anyway.

## Spike 6 — thumbnails at grid scale

**Question.** `file_get` streams a whole file: no server-side thumbnail, no partial fetch
(B-01). S-22c wants a screenful of tiles at once. What does that cost, does concurrency help,
and how much worse is it if the app ignores the "never fetch full-size to shrink" rule?

**Answer: time is not the binding constraint — memory is.** Everything is a local read, so
the rule the spec mandates buys about **43× in bytes**, not in latency.

Measured over a fixture corpus written by `src/spikes/mediaFixture.ts` (1024×768 JPEGs of
real entropy plus 160×120 thumbnails; a third of the descriptors deliberately carry no
`schema:thumbnailUrl`):

| Operation | 46 descriptors | 106 descriptors |
|---|---|---|
| SPARQL discovery of every image descriptor | 11 ms | 20 ms |
| Thumbnails, sequential (30 / 70 of them) | 1556 ms — 52 ms each | 1510 ms — 22 ms each |
| Same, 8 fetches in flight | 38 ms — 1 ms each | 71 ms — 1 ms each |
| **Full-size instead**, 8 in flight | 1297 ms, 21.4 MB, 40 MB heap | 1535 ms, 49.4 MB, 62 MB heap |
| Fixture write cost per media document | ~230 ms | ~300 ms |

- **Concurrency is what matters for latency**: 52 ms per thumbnail sequentially, 1 ms with
  eight in flight. The bridge pipelines rather than thrashing.
- **Full-size costs 466 kB per image against 10.7 kB per thumbnail.** At 106 photographs
  that is 49 MB of blobs and a 62 MB heap; a thousand-photograph archive would be about half
  a gigabyte of resident data for one screen. This is the number behind B-01, and it says the
  grid must fetch thumbnails only, bound its concurrency, and revoke blob URLs it scrolls past.
- **Chunk reassembly is sound**: all 106 assembled blobs decoded at exactly 1024×768, none
  broken or truncated. Files above the 1 MiB chunk size were not exercised.
- **Placeholders are the common case, not the exception** — a third of this corpus has no
  thumbnail, which is roughly what an ecosystem with no thumbnail generator produces.

**Boundary register (B-13, new).** Every file measured here was written on the same device, so
`file_get` read blocks that were already local. What it does when a file's blocks have not yet
synced — block, fail, or stream slowly — is unmeasured, and it is exactly the case behind §8's
"media unreachable" state. Needs a second device or a reset profile to answer.

## Spike 7 — one predicate, a nested value or a reference

**Question.** `schema:location` holds either a place with no URI of its own or a reference to
a place document (§3.2), and `schema:attendee` does the same for people (§3.3). Spike 4 found
that `shex-orm` rejects a *plural mixed union* (object OR IRI) and suggested an all-object
union instead. Does that work — and what does the ORM do with a reference whose triples live
in another document?

**Answer: the all-object union compiles and then betrays you; model both as plain `IRI *`
and join by hand.**

- **Codegen accepts it.** `schema:location @app:UnnamedPlaceShape OR @app:PlaceRefShape *`
  generates `location?: Set<SpikeUnnamedPlace | SpikePlaceRef>`, where the mixed union failed.
- **But a union-typed property only reports what the ORM itself wrote.** A memory with two
  `schema:location` triples inserted by `sparql_update` — one to a nested place in its own
  graph, one to a place document — came back with **zero** locations. Adding a member through
  the ORM made it appear; the SPARQL-written ones stayed invisible for the object's whole
  lifetime. Since this app writes through SPARQL by necessity (spike 2: the ORM loses date
  datatypes), a union-typed property would leave it unable to read back what it just wrote.
- **A reference never resolves.** The member that did appear carried `name=undefined`,
  `lat=undefined`, and — worth knowing — reported the **parent's** `@graph`, so `@graph`
  cannot be used to tell a nested value from a reference.
- **Without the union, everything works.** Read through `schema:location IRI *`, the same
  memory reports both locations and its attendee, all written by SPARQL. A second
  subscription on a place shape over the wildcard scope then resolves each IRI by hand,
  identified places and nested ones alike:

  ```
  as plain IRIs: 2 location(s), 1 attendee(s)
    another document → "Praça do Comércio"
    in the memory's own document → "the beach below the road"
  ```

- **The nested/identified distinction survives** as a property of the IRI, not of the ORM: a
  place whose IRI begins with the memory's document NURI is that memory's own, and anything
  else is a reference to a place with shared identity. This matches spike 4's finding that
  "no URI" is really a skolem IRI inside the memory's document.

**Design decision.** `schema:location` and `schema:attendee` are `IRI *` — which also settles
the plurality debt, since `schema:attendee` had been narrowed to 0..1 by the codegen limit
against §3's 0..N. Places and people are read through their own shapes over the wildcard scope
and joined by IRI. Unnamed places are written into the memory's own document with a derived
IRI, exactly as §3.2 intends.

**SDK improvement candidates.** A union-typed property should reflect triples written outside
the ORM, and a referenced object whose graph is in scope could resolve rather than arriving
empty.

## Spike 8 — promotion across many documents (B-06)

**Question.** §3.3 promotes a bare name by minting a contact URI and rewriting **every**
memory that used the same string, "silently and without confirmation". Appendix A's B-06 —
atomic or best-effort writes across many documents — called the cost "unknown until
exercised", and the People slice rests on it. Is there a multi-document write at all? What
does it cost? What does a failure leave behind, and what does a reader see meanwhile?

**Answer: there is one, it is atomic on failure, and it is the only sane way to promote.**

- **One `sparql_update` reaches many graphs.** A single `INSERT DATA` naming two `GRAPH`s
  landed in both — with `nuri` set to the first document *and* with `nuri` undefined. The
  per-document loop everyone assumes is necessary is not.
- **It is all-or-nothing on failure.** An update naming three graphs, the middle one a
  document that does not exist, was rejected with `OtherError("InvalidNuri")` and **neither
  real document was written**. At 20 graphs and at 200.
- **The per-document loop, by contrast, has no rollback.** Failing deliberately on the third
  of five left 17 of 20 memories pointing at the contact and the rest still naming the bare
  person — a split archive, and no way to tell afterwards that it happened.
- **It is also faster**, though that was never the deciding factor:

  | Promotion of | One update, N graphs | N updates in sequence | N updates concurrently |
  |---|---|---|---|
  | 20 memories | 85 ms | 165 ms | 181 ms |
  | 200 memories | 1 869 ms | 2 630 ms | 1 876 ms |

- **Failure atomicity is not read isolation, and the difference shows up with size.** A
  subscription open across the rewrite was sampled every 5 ms. At 20 graphs it never saw an
  intermediate state; at 200 graphs it saw 1, 2, 3, then 181 promoted before the update
  returned. The write never *ends* half-applied, but a reader can watch it happen.
- Seeding cost `doc_create` + one update at 104–152 ms per document, consistent with spike 1
  and rising with the number of documents in the store.

**Design decision.** Promotion — of a bare name (§3.3) and of an unnamed place (S-33) alike —
is **one update over every affected graph**, never a loop. There is no repair path to build
and no progress state to design, because there is no half-promoted end state to repair. What
screens must tolerate is a second of flicker on a large promotion, which §8's "partially
loaded" already requires of them.

**Still unknown.** Only local documents in one session were measured: whether atomicity
survives a write whose graphs live on a remote broker, or are not yet synced to this device,
is untested — the same shape of gap as B-13. No upper bound on the number of graphs in one
update was found at 200.

## Spike 9 — MapLibre in this app

**Question.** The README fixed the stack: MapLibre GL JS for the map. What was never
checked is whether it runs *here* — a WASM engine in the same tab, the app inside the auth
server's iframe, and every scenario driven through headless Chrome, where WebGL is not a
given. And §8 asks for "Offline — no degradation in P0", which for a map means knowing how
MapLibre fails when the tiles do not come.

**Answer: it works, it needs one build fix, and offline is a configuration choice.**

- **WebGL is available headless.** `webgl2` via ANGLE/SwiftShader in the same headless
  Chrome the milestones use, with no extra flags. The map slice can be regression-tested
  like every other screen. Chrome logs a deprecation warning about the software fallback;
  it renders regardless.
- **The worker must be pointed at explicitly, or nothing works and nothing says so.**
  MapLibre v6 derives its worker URL from `import.meta.url`, expecting to be loaded as
  `dist/maplibre-gl.mjs` with `maplibre-gl-worker.mjs` beside it. Bundled by Vite, that
  resolves to `/assets/maplibre-gl-worker.mjs`, which does not exist. The failure is
  **completely silent**: no error, no worker, `load` never fires, and every source —
  including a local GeoJSON one with nothing to fetch — stays `isSourceLoaded() === false`
  forever. The fix is two lines:

  ```ts
  import { setWorkerUrl } from "maplibre-gl";
  import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
  setWorkerUrl(workerUrl);
  ```

  `?worker&url`, not `?url`: the worker imports `maplibre-gl-shared.mjs`, so copying the
  single file leaves it importing something that was never emitted — the same silent
  failure one step further along. `vite.config.ts` also needs `worker.format: "es"`,
  since MapLibre creates a module worker.
- **With the worker wired up, the real store renders.** 106 media points (clustered by
  MapLibre's own clustering), 8 places and 4 tracks: style loaded in 369 ms, sources and
  layers added in 4 ms, features on screen. The GeoJSON comes straight from three SPARQL
  queries answered in 12 ms.
- **A remote style URL is a single point of failure.** With the tile host blocked, the map
  never finishes loading and the app cannot even add its own layers — `addSource` throws
  "Style is not done loading". Nothing of the user's own data can be shown.
- **An inline style has no such problem.** The same data on a style object with
  `sources: {}` and one background layer loads in **37 ms with no network at all**, and
  renders every point, pin and track identically. Offline is therefore not a fallback path
  to write: it is the same code with a different style object.
- **`svelte-maplibre-gl` works on Svelte 5** and mounts the same map declaratively.

**Design decision.** The style is **local and bundled**; a network basemap source is added
on top of it, not depended upon. §8's "no degradation" then holds by construction: without a
network the user loses geographic context and keeps every one of their own points. Offline
basemaps themselves stay the map library's business, not this app's — there is no tile cache
to build here.

**Cost.** MapLibre takes the bundle from 425 kB to 1 939 kB (90 kB → 380 kB gzipped), plus a
468 kB worker chunk. That is 4× for one screen, and it argues for loading the map projection
by dynamic import so the other four tabs never pay for it. Not measured yet.

**Still unknown.** Which tile provider ships in P0; how clustering behaves at 10 000 points
rather than 106; and whether the WASM engine and MapLibre contend for the main thread during
a large sync.

## Spike 10 — one document, many mutable subjects

**Question.** Recommendations (§4.1) are the first thing this app owns that does not get a
document each: they are subjects inside a single `schema:ItemList` document (§3.7), and that
document is mutated in place for the rest of its life — appended to today, edited next month,
one item deleted the month after. Every owned write so far created a *fresh* document
instead, so four things had never been asked of the engine:

1. does a live wildcard subscription notice a **new sibling subject** appearing in a document
   it is already holding, or must the screen reload?
2. does deleting one item leave its siblings, and the list itself, intact?
3. does a precision-aware date (§3.1) round-trip on a subject that is not a memory?
4. does the referent read back as a plain IRI?

**Answer: yes to all four, and the pattern is cheaper than the alternative.**

- **A sibling appended to a watched document is delivered reactively.** The subscription went
  1 → 2 with no reload and no re-subscription. This is what lets S-40 subscribe and S-41
  simply write, with no refresh seam between the two screens — the same relationship S-21 and
  S-22 already have, achieved without a document each.
- **Deleting one item is surgical.** `DELETE WHERE` on the membership triple and then on the
  item's own triples left the sibling and the `schema:ItemList` subject untouched, and the
  subscription dropped to 1. Two statements, because a single conjunctive pattern would match
  nothing for an item that was never linked — the same lesson as `dropNestedPlaces`.
- **Datatypes survive on any subject.** `xsd:gYearMonth` and `xsd:date` came back from SPARQL
  intact; the ORM hands over the lexical form, from which `parsePrecisionDate` recovers the
  precision, exactly as it does for a memory's `schema:startDate`. Nothing about spike 2's
  answer was specific to memories.
- **`schema:item` reads back as a plain IRI**, as spike 7 predicted. The referent join to a
  place or an event is the same by-IRI join `lib/places.ts` already does.

**An incidental number.** Appending a sibling took **12 ms**; creating the document took
**115 ms**. Many-subjects-per-document is an order of magnitude cheaper per item than
doc-per-object, which is worth remembering the next time the doc grain is chosen — and quietly
justifies §3.7 giving recommendations one list rather than a document each.

**Still unknown.** Whether one list document stays comfortable at a few thousand items, and
what concurrent edits from two devices to two different items in the same document do — the
CRDT should merge them, and nothing here tested it.

## Found while driving milestone 6 — the app cannot know where it is

Not a spike; a measurement that fell out of giving S-40 a position to sort by.

```
[geolocation] denied (code 1):
    Geolocation has been disabled in this document by permissions policy.
```

This is **not** the user refusing. Cairns runs inside an iframe served by the auth server,
and an iframe receives geolocation only if the embedding page grants it — `allow="geolocation"`
on the `<iframe>`. It does not, so `getCurrentPosition` fails before any permission prompt
could happen, and no amount of granting at the browser level changes it (the driver grants it
to both origins and sets a position; the call still fails).

What that silently disables, all of it specified and all of it built:

- §6.2 S-01 card 1 — the recommendation happening now, nearby. The app's best moment (§4.2).
- §6.2 S-01 card 3 — a recommended place nearby.
- S-01's "You have been here before", which has therefore never once run.
- S-40's distance ordering and its "800 m away" lines.
- S-32's "use my location" button in the place picker.

The app already degrades honestly — §8's rule made every one of these conditional, so the
screens read as they do indoors rather than breaking — which is why this went unnoticed for
four milestones. The e2e run now probes for a position and prints `SKIP` rather than `OK` for
the assertions that need one, because a green line for a code path that cannot execute is
worse than a missing one.

The fix is one attribute in the embedding page, and it belongs to whoever owns that page
(Appendix A, B-15).

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

## What this means for milestone 2

1. `lib/rejections.ts` is thin: one Automerge document, tagged in its graph part so SPARQL
   finds it, `DiscreteOrmSubscription` for reads and writes, URI keys as §3.9 describes.
   Pooling means screens need no shared cache of their own.
2. The media grid fetches **thumbnails only**, with about eight fetches in flight, and revokes
   blob URLs as tiles leave the viewport. Full-size resolution belongs to S-51, one image at a
   time.
3. Placeholder tiles are a main path, not an edge case: a third of realistic data has no
   thumbnail.
4. `src/spikes/mediaFixture.ts` plays the applications Cairns does not have — there is no
   camera button and never will be, so media reach the store only through other apps. Seed a
   corpus with `node tools/browse.mjs spike6 <count> <concurrency>`; `<count> 0` re-measures
   the existing corpus without writing more documents into the shared devstack store.
5. Appendix A: **B-01** now has a number behind it (43× the bytes, and half a gigabyte of
   resident blobs for a thousand-photograph archive), and **B-13** is new — the behaviour of
   `file_get` on a file whose blocks have not synced, which §8's "media unreachable" state
   cannot be written truthfully without.

## What this means for milestone 3

1. Model `schema:location` and `schema:attendee` as `IRI *`, and read places and people
   through their own shapes over the wildcard scope, joining by IRI. No unions anywhere.
2. An unnamed place is written into the memory's own document with an IRI derived from it,
   which is what makes it unshareable in practice and recognisable in code.
3. `schema:attendee` becomes 0..N as §3 always said; the 0..1 in the shape was a codegen
   limit, not a decision.
4. Whatever the app writes, it must be able to read back through the same subscription — the
   trap spike 7 fell into is invisible until something written by SPARQL fails to appear.
5. **Coordinates are written twice, on purpose.** §3.2 puts them in a `schema:geo`
   node, which is one level of nesting below the place — and a nested object written by
   SPARQL is exactly what the ORM cannot read (finding 2 above). So a place carries both
   the `schema:geo` node, which is the durable form and what another application reads,
   and a flat `geo:lat`/`geo:long` pair, which is the only one this app can read back.
   The flat pair is a **workaround with an expiry date**: when the ORM resolves nested
   objects it did not itself write, `toPlace` stops reading it and nothing else changes,
   because both forms have been written all along. Being unable to read one's own nested
   data is a NextGraph-side problem, not a modelling one, and this is what it costs
   downstream.

   The reading gap is real in the other direction too: a place published by another
   application with `schema:geo` alone shows as having no coordinates here (Appendix A,
   B-14).

## What this means for milestone 4

1. People mirror places exactly: `foaf:Person` read through its own shape over the wildcard
   scope, `schema:attendee` holding IRIs, a bare name written into the memory's own document
   as `<memory>#person-N`. `lib/people.ts` is `lib/places.ts` with different predicates.
2. **Promotion is one update, not a loop** (spike 8). This applies to S-33's place promotion
   too, and it is why §3.3 can promote silently: there is no half-promoted end state.
3. The contact document itself follows B-02's shape, the way `tags.ts` already does for the
   concept scheme — find or create a user-owned document, append, never restructure. B-03 is
   the second application of that answer, and the first test of whether it generalises.
4. A large promotion is visible while it runs. Screens should not assume the archive changes
   in one step, which is the same discipline §8 already asks for.

## What this means for milestone 6

1. Recommendations get **one list document, many fragment subjects** — `<list>#rec-<n>` — read
   through `app:RecommendationShape` over the wildcard scope like every other shape. No
   reload after a save; S-40 sees what S-41 wrote.
2. The referent (`schema:item`) is a **reference to a place or an event, never nested**. The
   thing recommended has identity of its own, or it is not recommendable.
3. "Who told you" is one property per kind, not a union: `prov:wasAttributedTo` for a contact,
   `dcterms:source` as a string for a URL or free text. Spike 7's rule — never a union the ORM
   cannot read back — applies here without needing to be rediscovered.
4. Events are read by SPARQL rather than through a shape, because a `schema:Event` shape would
   also match every memory (`app:Memory` ⊑ `schema:Event`, §3). `FILTER NOT EXISTS { ?s a
   app:Memory }` is the whole difference, and it belongs in a query, not in a shape fighting
   the codegen.
