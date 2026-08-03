# NextGraph for Dummies

*A practical introduction for web developers who want to build an app on
NextGraph with Svelte 5 and the ORM. You should know how to write a web app;
a vague memory of what RDF triples are is enough.*

---

## 1. The mental model

Forget the client/server model for a minute. In NextGraph:

- **Your app's data lives on the user's device**, in encrypted CRDT documents
  (local-first). The network is only used to *sync* encrypted change sets
  between the user's devices and with other users.
- **The "backend" is called the engine (or verifier)**. It runs in WASM
  right in the browser (or natively in the desktop/mobile app). It decrypts
  documents, materializes their current state, answers SPARQL queries, and
  applies your updates. There is no application server that sees your data.
- **Brokers** (the `ngd` daemon) relay *encrypted* messages between devices.
  They cannot read anything. Think "dumb encrypted mailbox", not "database
  server".
- **The wallet** is the user's keychain: their identities and keys, packed in
  an encrypted file, opened with a pazzle/mnemonic/password. Your app never
  touches it. You ask the NextGraph wallet app to log the user in, and you
  get back a *session*.

If you know ActivityPods: the "pod" idea is similar (the user owns their data,
apps ask for access), but there is no HTTP server holding clear-text RDF.
Everything is end-to-end encrypted and replicated CRDT-style, and SPARQL runs
locally in the engine.

### How your app runs

Your web app does not open wallets or hold keys. It is loaded **inside an
iframe** of the NextGraph app/wallet page (`nextgraph.net`, or a local dev
instance). Calling `init()` from `@ng-org/web`:

1. redirects the top-level window to the wallet page, where the user logs in;
2. reloads your app in an iframe, and hands it a **session** over
   `postMessage`;
3. from then on, every `ng.*` API call is an RPC forwarded to the engine.

You never see keys. You see a `session_id` and store IDs — that's your whole
world.

---

## 2. Vernacular: the words you will meet

| Term | What it actually is |
|---|---|
| **Wallet** | Encrypted container of the user's identities & keys. Handled by the official app, not by you. |
| **Session** | What you get after login: `{ session_id, private_store_id, protected_store_id, public_store_id, ng }`. The `session_id` is the first argument of almost every API call. |
| **Document / Repo** | The unit of data. A document *is* a repository of CRDT commits (a DAG, like git). Every document has both a graph (RDF) part and optionally a discrete (JSON/text) part. |
| **Store** | A special document that groups other documents. Every user has three personal ones: **private** (only their devices), **protected** (shareable with individual capabilities), **public** (their public profile). Apps typically create their documents inside the private store. |
| **Branch / Commit** | Like git: documents have branches; edits are commits synced between devices. You mostly ignore this, but the History API exposes it. |
| **CRDT** | Conflict-free Replicated Data Type: a data structure where concurrent edits from several devices merge automatically. NextGraph offers a **graph CRDT** (RDF triples) and **discrete CRDTs** (JSON via Automerge or Yjs). |
| **NURI** | "NextGraph URI" — a DID: `did:ng:o:<repoid>:v:<overlayid>`. `o:` = the document's repo ID, `v:` = the overlay ID (which sync network to find it on). Other segments exist: `:b:` branch, `:c:` commit, `:k:` decryption key, `:r:` readcap, `:a:` app path, `:l:` locator. |
| **Overlay** | The p2p sync "swarm" scoped to a store. Derived from the store's ID. You never compute it yourself; it just shows up inside NURIs. |
| **ReadCap** | Read capability: an ID + decryption key bundled into one token (`r:...`). Whoever holds it can read (not write) the target. |
| **Verifier / Engine** | The component that decrypts commits and materializes the current document state. Runs in WASM in your page's parent frame. |
| **Broker / ngd** | Server daemon that relays encrypted sync messages. Blind. |
| **Shape** | A SHEX schema describing what a "typed object" looks like in the graph. Shapes are *lenses over triples*, not table definitions: the same triples can be read through different shapes by different apps. That's the interoperability story. |
| **Shape type** | Generated artifact pairing a compiled SHEX schema (for the engine) with a TypeScript type (for you). What you pass to `useShape()`. |
| **Scope** | Which graphs (documents) and optionally which subjects a subscription covers: `{ graphs: [...], subjects: [...] }`. |
| **DeepSignal** | A proxied object returned by the ORM. Mutate it like a plain object; mutations are persisted and synced, remote changes re-render your components. |
| **ORM** | The `@ng-org/orm` package doing that two-way binding, with hooks for Svelte/React/Vue. |

One thing worth internalizing: **a document ID is an RDF named graph**. The
graph part of a document with NURI `did:ng:o:xxx:v:yyy` is the named graph
`<did:ng:o:xxx:v:yyy>` in the engine's SPARQL store. "Creating a document"
and "having a new named graph to put triples in" are the same act.

---

## 3. Project setup

```bash
pnpm add @ng-org/web @ng-org/orm
pnpm add -D @ng-org/shex-orm        # only if you use the graph (RDF) ORM
```

- `@ng-org/web` — the bridge to the engine (the `ng` object + `init()`).
- `@ng-org/orm` — the reactive ORM. Svelte 5 hooks live in `@ng-org/orm/svelte`.
- `@ng-org/shex-orm` — dev tool: compiles `.shex` schemas into shape types.

### Initialization (once, at app startup)

Create a small session module — this is the idiomatic pattern used by all the
example apps (see
[sdk/js/examples/expense-tracker-rdf/src/utils/ngSession.ts](https://git.nextgraph.org/NextGraph/nextgraph-rs/src/branch/main/sdk/js/examples/expense-tracker-rdf/src/utils/ngSession.ts)):

```ts
// src/lib/ngSession.ts
import { ng, init as initNgWeb, type Session } from "@ng-org/web";
import { initNg } from "@ng-org/orm";

export let session: Session | undefined;

let resolveSession: (s: Session) => void;
export const sessionPromise = new Promise<Session>((r) => (resolveSession = r));

/** Call this as early as possible: it redirects to the wallet login page. */
export async function init() {
    await initNgWeb(
        async (event: any) => {
            session = event.session;
            session!.ng ??= ng;
            resolveSession(session!);
            initNg(ng, session!);   // wire the ORM to the engine
        },
        true,   // singleton session
        []      // access requests (capability delegation; leave empty for now)
    );
}
```

And in your Svelte entry point:

```ts
// src/main.ts
import { mount } from "svelte";
import App from "./App.svelte";
import { init } from "./lib/ngSession";

await init();   // first visit: redirects to wallet login, then reloads in iframe
mount(App, { target: document.getElementById("app")! });
```

On the very first call, the page navigates away to the wallet. That's normal:
don't treat "init never resolved" as a bug. When the user is logged in, your
app comes back inside the iframe and the callback fires with the session.

The session's three store IDs come **without** the `did:ng:` prefix, so the
idiom you'll see everywhere is:

```ts
const privateStoreNuri = `did:ng:${session.private_store_id}`;
```

---

## 4. Two kinds of data: pick your CRDT

Every NextGraph document has an RDF graph part; it can *also* carry a discrete
(JSON) part. The ORM supports both, with the same reactive experience:

| | Graph ORM | Discrete ORM |
|---|---|---|
| Data model | RDF triples, viewed as typed objects | Plain JSON (objects/arrays) |
| Schema | SHEX shape (compile-time types) | None — you validate yourself |
| Collections | `Set`s only | Arrays only |
| Queryable via SPARQL | Yes | No (only the RDF part is) |
| Interop with other apps | Strong (shapes are just views) | Weak (it's your JSON) |
| Hook | `useShape()` | `useDiscrete()` |

Rule of thumb: **graph** for your domain model (things other apps could
meaningfully reuse: contacts, posts, expenses…), **discrete** for app-private
state or deeply nested JSON that doesn't map nicely onto triples.

---

## 5. Creating and finding documents

There is no "open file" dialog: your app creates its documents inside the
user's store, then finds them again by querying. The standard trick is to tag
your document with an app-specific RDF class so a SPARQL query can find it on
next launch
([sdk/js/examples/expense-tracker-discrete/src/utils/loadStore.ts](https://git.nextgraph.org/NextGraph/nextgraph-rs/src/branch/main/sdk/js/examples/expense-tracker-discrete/src/utils/loadStore.ts)):

```ts
import { sessionPromise } from "./ngSession";

const APP_CLASS = "did:ng:z:MyCoolApp";   // any IRI you invent for your app

export async function findOrCreateAppDoc(): Promise<string> {
    const { ng, session_id } = await sessionPromise;

    // Find: did we already create our document?
    const ret = await ng.sparql_query(
        session_id,
        `SELECT ?doc WHERE { GRAPH ?doc { ?s a <${APP_CLASS}> } }`,
        undefined,
        undefined
    );
    let docNuri = ret?.results.bindings?.[0]?.doc?.value;
    if (docNuri) return docNuri;

    // Create: a Graph document in the user's (private) store.
    docNuri = await ng.doc_create(
        session_id,
        "Graph",        // CRDT: "Graph" | "Automerge" | "YMap" | "YArray"
        "data:graph",   // class: "data:graph" | "data:json" (Automerge) | "data:map" (Yjs)
        "store",        // destination: the default (private) store
        undefined
    );

    // Tag it so we can find it next time.
    await ng.sparql_update(
        session_id,
        `INSERT DATA { GRAPH <${docNuri}> { <${docNuri}> a <${APP_CLASS}> } }`,
        docNuri
    );
    return docNuri;
}
```

Notes:

- `doc_create` returns the document's NURI (`did:ng:o:...:v:...`). Store it
  in memory; *finding it again is what the SPARQL query is for*.
- You don't strictly need a dedicated document — the RDF example app actually
  writes its objects straight into the private store's own graph
  (`did:ng:${session.private_store_id}`). A dedicated document gives you a
  clean unit to share later, though.
- `sparql_query` / `sparql_update` are always there when the ORM is too
  high-level: SELECT returns standard
  [SPARQL JSON results](https://www.w3.org/TR/sparql11-results-json/).
- **There is no `doc_delete`.** Emptying a document is a SPARQL update:
  `DELETE WHERE { GRAPH <doc> { ?s ?p ?o } }`. The document itself remains as
  an empty graph; nothing in the app-facing API removes it.

---

## 6. Choosing your document grain

The first design decision you will make, and the one the API is quietest
about. A document is four things at once: **a named graph**, **the unit of
sync**, **the unit of sharing**, and **the unit of deletion**. Pick the grain
by the last two — what you might one day share, or delete, on its own — and
then check the cost.

The cost is not what you would guess. Writing is cheap either way, but the two
are an order of magnitude apart:

| Operation | Time |
|---|---|
| `doc_create` + one `sparql_update` (a new document per object) | 78–115 ms |
| Appending one more subject to a document you already have | ~12 ms |

The real cost of many documents shows up at **login**, not at write time: the
engine syncs every repo before it answers anything. With ~220 documents,
queries and subscriptions were unresponsive for roughly a minute after the
session opened; at ~10 documents it is imperceptible. Budget for it, and
render your shell before the data arrives.

Two facts make either grain workable:

- **A wildcard scope subscribes across every document at once** — see §7.3.
  Doc-per-object stays browsable without you building an index.
- **A subject appended to a document a subscription is already watching is
  delivered reactively**, with no reload and no re-subscription. Many subjects
  in one document is not a second-class citizen: a list, a log or a feed can
  live in one document and still drive a live UI.

Rules of thumb: **one document per thing that could travel on its own** (a
post, a contact, a photo album), **one document with many subjects for things
that only ever travel together** (the items of a list, the entries of a log).
What is still unmeasured: how one document behaves at a few thousand subjects,
and what two devices editing two different subjects of the same document do
(the CRDT should merge them cleanly — nobody has checked).

---

## 7. The graph ORM, end to end

### 7.1 Write a shape

Shapes live in `.shex` files. RDF refresher: each object is a *subject* with
predicate/value pairs; `a` means `rdf:type`.

```shex
# src/shapes/shex/todoShape.shex
PREFIX ex: <did:ng:z:>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

ex:TodoShape {
  a [ex:Todo] ;
  ex:title xsd:string ;
  ex:done xsd:boolean ;
  ex:dueDate xsd:date ? ;         # '?' = optional
  ex:tags xsd:string * ;          # '*' = a set of values
  ex:assignee IRI ? ;             # link to another object, by IRI
}
```

(`did:ng:z:` is the conventional prefix for app-defined vocabulary. You could
use any IRI vocabulary — `schema.org`, ActivityStreams… — and that's exactly
how you'd interoperate with other apps' data.)

### 7.2 Generate the shape types

Add to `package.json` and run it whenever the `.shex` changes:

```json
"scripts": {
    "build:orm": "rdf-orm build --input ./src/shapes/shex --output ./src/shapes/orm"
}
```

This generates three files per schema:

- `todoShape.typings.ts` — the TypeScript interface `Todo` (with `@id`,
  `@graph`, `@type` bookkeeping fields);
- `todoShape.schema.ts` — the compiled schema the engine consumes;
- `todoShape.shapeTypes.ts` — the **shape type**, pairing both:

```ts
export const TodoShapeType = {
    schema: todoShapesSchema,
    shape: "did:ng:z:TodoShape",
} as const satisfies ShapeType<Todo>;
```

That little object is what you pass around: runtime schema for the engine,
compile-time type for you.

### 7.3 Use it in a Svelte 5 component

```svelte
<script lang="ts">
    import { useShape } from "@ng-org/orm/svelte";
    import { TodoShapeType } from "../shapes/orm/todoShape.shapeTypes";
    import type { Todo } from "../shapes/orm/todoShape.typings";
    import { session, sessionPromise } from "../lib/ngSession";

    // Subscribe to all Todo-shaped objects in the private store.
    const privateNuri = session && `did:ng:${session.private_store_id}`;
    const todos = useShape(TodoShapeType, privateNuri);
    // todos is a live Set<Todo>: it fills up as data arrives,
    // and your component re-renders on every change (local or remote!).

    async function addTodo() {
        const session = await sessionPromise;
        todos.add({
            "@graph": `did:ng:${session.private_store_id}`, // which document
            "@type": "did:ng:z:Todo",                       // rdf:type
            "@id": "",                                      // "" = auto-generate
            title: "New todo",
            done: false,
            tags: new Set(),
        });
    }

    const sorted = $derived([...todos].sort((a, b) => a.title.localeCompare(b.title)));
    const key = (t: Todo) => `${t["@graph"]}|${t["@id"]}`;
</script>

<button onclick={addTodo}>+ Add</button>
{#each sorted as todo (key(todo))}
    <label>
        <input type="checkbox" bind:checked={todo.done} />
        <input bind:value={todo.title} />
    </label>
{/each}
```

Read that again, because it's the whole point: **`bind:value={todo.title}` is
persistence**. No save button, no store dispatch, no API call. Mutating the
object writes a CRDT commit, encrypts it, syncs it to the user's other
devices; edits arriving from elsewhere update the set and re-render.

Idioms to know:

- `useShape(shape, scope)` — scope can be a graph NURI string, a
  `{ graphs: [...], subjects: [...] }` object, or `undefined` (renders an
  empty read-only set — handy while the session loads).
- **`"did:ng:i"` is the wildcard scope: every document in the user's
  dataset.** This is the one to reach for when your objects are spread over
  many documents, and it deserves more attention than its size suggests:

  ```ts
  const todos = useShape(TodoShapeType, "did:ng:i");
  ```

  It is live across document *creation* — a document made while the
  subscription is open shows up in the set on its own, with no
  re-subscription. Combined with §6, that is what makes one-document-per-object
  practical: you never build an index of your own documents, you subscribe to
  the shape and let the engine find them. Narrower scopes still work when you
  want them; reach for a graph list when a screen genuinely concerns one
  document.
- `OrmSubscription.getOrCreate(shape, normalizeScope(scope)).readyPromise`
  resolves when the first pass has been delivered — the difference between
  "no todos" and "not loaded yet", which you will need for empty states.
- The returned set is a `DeepSignal<Set<Todo>>`, with extras: `.first()`,
  `.getBy(graphNuri, subjectIri)`, and iterator helpers (`.map`, `.filter`…).
- Deleting: `todos.delete(todo)` removes the object's triples (for nested
  objects, only the linkage from the parent is removed).
- Relationships are IRIs: `todo.assignee = person["@id"]`, resolve with
  `people.find(p => p["@id"] === todo.assignee)`. To link a nested object you
  don't have in memory: `parent.children.add({ "@id": "<iri>" })`.
- The subscription closes automatically when the component unmounts.

### 7.4 Outside components

Hooks only work inside components. Elsewhere use the same machinery directly:

```ts
import { OrmSubscription, getObjects, insertObject } from "@ng-org/orm";

// Live subscription (shared/pooled: same shape+scope = same object)
const sub = OrmSubscription.getOrCreate(TodoShapeType, { graphs: [docNuri] });
await sub.readyPromise;
sub.signalObject.add({ ... });        // same live Set as in the hook
sub.close();                          // when done

// One-shot, non-reactive:
const todos = await getObjects(TodoShapeType, { graphs: [docNuri] });
await insertObject(TodoShapeType, { ... });
```

For many small edits at once, wrap them in a transaction so they land in one
commit: `sub.beginTransaction(); ...mutations...; sub.commitTransaction();`.
(Without it, changes are still auto-batched per microtask — `await
Promise.resolve()` flushes.)

---

## 8. Data that doesn't show up, and data that shows up late

The ORM is comfortable enough that it is easy to forget there are triples
underneath. You are reminded when an object you *know* you wrote refuses to
appear. Five causes, in rough order of how long each takes to find.

**1. A missing required predicate.** `useShape` only returns subjects that
match the shape. Insert an object without a predicate the shape declares
mandatory and it simply is not there — no error, no warning.

**2. A datatype the ORM could not preserve.** The write path reduces every
value to its JS-facing kind, so anything JavaScript represents as a *string*
loses its XSD datatype: setting `todo.dueDate = "2021-03-04"` stores an
`xsd:string`, and a shape asking for `xsd:date` no longer matches the data it
just wrote. Numbers survive (`38.7` → `xsd:decimal`); the date/time family does
not. The read path is fine — literals inserted with a proper datatype match the
shape and arrive as their lexical form.

The workaround is to write those fields through SPARQL with an explicit
datatype, and keep the ORM for everything else:

```ts
await ng.sparql_update(
    session_id,
    `PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
     PREFIX ex: <did:ng:z:>
     DELETE WHERE { GRAPH <${doc}> { <${todoIri}> ex:dueDate ?v } } ;
     INSERT DATA { GRAPH <${doc}> {
        <${todoIri}> ex:dueDate "2021-03-04"^^xsd:date } }`,
    doc
);
```

**3. Too much shows up: a shape matches subclasses.** Shapes match on the type
triple, so if your `a ex:Memory` objects also assert `a schema:Event` — which
is exactly what you should do to be legible to other apps — then a shape keyed
on `schema:Event` matches every one of them. There is no "…and not a Memory" in
a shape. That question belongs in SPARQL:

```sparql
?s a schema:Event .
FILTER NOT EXISTS { ?s a ex:Memory }
```

**4. A nested object written by SPARQL is invisible to the ORM.** Write
`schema:geo` as a nested node through `sparql_update` and the ORM hands you a
bare IRI where the shape promised an object. If you need to read a structure
back that you did not insert through the ORM, either read it with SPARQL or
store a flat duplicate of the fields you need — and leave a comment saying
which one is the workaround, so it can be deleted when this is fixed upstream.

**5. Deleted things that come back.** `set.delete(obj)` removes the parent's
*link* to a nested object, not the nested object's own triples. Those stay in
the graph, orphaned — and an orphan still matches a shape, so it reappears the
day you add a wildcard-scope subscription for that shape. Every nested write
needs a cleanup companion:

```sparql
DELETE WHERE { GRAPH <doc> { <doc> ex:child ?c } } ;
DELETE WHERE { GRAPH <doc> { ?c a ex:Child ; ?p ?o } }
```

Two statements, not one conjunctive pattern: a single pattern matching both the
link and the child's triples deletes *nothing* when one of them is absent.

**The debugging move, for all five:** go back to the triples and compare with
the shape.

```ts
await ng.sparql_query(session_id,
    `SELECT * WHERE { GRAPH <${doc}> { ?s ?p ?o } }`, undefined, undefined);
```

### 8.1 Partially loaded is the normal state, not an edge case

A subscription does not arrive all at once. An object is delivered **as soon as
it matches the shape**, and its remaining triples follow; a document that has
not synced yet contributes nothing at all, and then appears. So this crashes,
sooner or later, in production and not on your machine:

```ts
// `tags` is optional in the shape, or simply has not arrived yet
if (todo.tags.has(someIri)) { ... }   // TypeError: undefined
```

Treat every optional field as genuinely optional (`todo.tags?.has(…)`), render
your shell before the data, and give "not loaded yet" a different rendering
from "nothing here" — `readyPromise` is what tells them apart. The same applies
to references *between* objects: a subject can hold an IRI whose target has not
arrived, so resolve defensively and show the unresolved reference rather than
dropping it.

---

## 9. SPARQL, beyond the ORM

### 9.1 Writing across several documents at once

Sooner or later one user action changes several documents: promoting a nested
object into one of its own, renaming something referenced from twenty places,
a migration. The important fact is not in the ORM at all:

**One `sparql_update` may name several graphs, and it is applied whole or not
at all.** A loop of per-document updates is not equivalent — it leaves the
store half-migrated when the fifth one fails.

```ts
await ng.sparql_update(
    session_id,
    `PREFIX schema: <https://schema.org/>
     DELETE WHERE { GRAPH <${memoryDoc}> { <${memoryDoc}> schema:location <${old}> } } ;
     INSERT DATA {
        GRAPH <${placeDoc}> { <${placeDoc}> a schema:Place ; schema:name "…" . }
        GRAPH <${memoryDoc}> { <${memoryDoc}> schema:location <${placeDoc}> . }
     }`,
    // Third argument: the document this update belongs to. `undefined` is
    // correct — and necessary — when it belongs to no single one.
    undefined
);
```

Two riders. **`doc_create` cannot be part of it**: it is what mints the NURI
the update names, so it happens first, and a failure afterwards leaves an empty
document — inert, but yours to notice. And **there is no read isolation**: a
live subscription watches a multi-document rewrite happen, object by object.
Nothing you can do about that today except avoid rendering a count that is
briefly wrong.

### 9.2 What the query engine will do for you

More than you would expect for something running in WASM in a browser tab.
`CONTAINS`, `REGEX`, `LCASE`, `STRSTARTS`, `GROUP BY`, `GROUP_CONCAT`,
`SAMPLE`, `COUNT`, sub-`SELECT`s, `FILTER NOT EXISTS` and `OPTIONAL` all work,
including inside `GRAPH ?g { … }` over the whole dataset. A single query can
return each hit *with its types* — enough to build a free-text search across
everything the user owns, with no index of your own.

One counter-intuitive measurement, from a small store (~2 000 triples):
**narrowing the query was three times slower than not narrowing it.**
Constraining to one type with a join cost ~180 ms where scanning every literal
in the dataset cost ~60 ms. The planner does worse with the extra join, so
"query everything, then classify in the app" is both simpler and faster. Do
re-measure at your own scale — those numbers describe a store small enough that
a full scan is free, and they say *works*, not *scales*.

---

## 10. The discrete (JSON) ORM

No schema, no codegen — just a document holding JSON:

```ts
const docNuri = await ng.doc_create(
    session_id,
    "Automerge",     // or "YMap" / "YArray"
    "data:json",     // "data:map" / "data:array" for Yjs
    "store",
    undefined
);
```

```svelte
<script lang="ts">
    import { useDiscrete } from "@ng-org/orm/svelte";
    import { appDocPromise } from "../lib/appDoc"; // your findOrCreate promise

    const { doc } = useDiscrete(appDocPromise);   // doc: reactive JSON root

    $effect(() => {
        if (doc && !doc.todos) doc.todos = [];    // initialize an empty doc
    });

    const addTodo = () => doc!.todos.push({ title: "New todo", done: false });
</script>

{#if !doc}
    Loading…
{:else}
    {#each doc.todos as todo (todo["@id"])}
        <input bind:value={todo.title} />
    {/each}
{/if}
```

Objects pushed into CRDT arrays get a stable, engine-assigned `"@id"` — use it
as your `{#each}` key (a temporary mock id appears first, then is replaced).
Remember: discrete = arrays, graph = sets.

---

## 11. Testing an app you cannot log into

Your app lives in an iframe of a page you do not control, behind a login your
test cannot type. That sounds fatal for automation and is not — but the recipe
is not obvious, and it is the same one every NextGraph app will need.

- **Drive a real browser with a persistent profile.** Log in by hand once; the
  wallet stays imported in that profile, and every subsequent headless run
  starts logged in. Playwright's `launchPersistentContext` is enough. Enter
  through the wallet's URL, not your app's, and pick up the iframe once it is
  there.
- **Headless Chrome (v143+) blocks the wallet → app iframe** with
  `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` against a `localhost` dev
  stack. Launch with `--disable-features=LocalNetworkAccessChecks`.
- **Wallets pin the broker's peer key.** Re-key or re-provision your dev stack
  and every existing `.ngw` file fails with `NoiseHandshakeFailed`. That is
  expected, not corruption — re-provision the wallets too. (And if the stack is
  shared with other people, remember that re-provisioning breaks *their*
  wallets.)
- **Wait for the engine before asserting anything.** After login it syncs every
  repo before answering (§6); poll a cheap `SELECT` until it returns instead of
  sleeping a fixed time. Ours takes about two minutes on a store of a few
  thousand triples.
- **Expose SPARQL to the harness in dev builds.** The single most useful thing
  we did:

  ```ts
  (window as any).probeSelect = select;   // wraps ng.sparql_query
  (window as any).probeUpdate = update;   // wraps ng.sparql_update
  ```

  Now a test can assert on what is actually *in the store* rather than on what
  the DOM says — the difference between "the row disappeared" and "the triples
  are gone" — and can clean up after itself through a surface the app
  deliberately does not offer. Counting DOM rows on a screen that crashed will
  happily tell you the cleanup worked.
- **Leave the store as you found it.** Local-first means your test data syncs
  and persists like everything else; there is no scratch database to drop. Have
  each scenario delete what it wrote, and pre-clean at the start too, because
  the run that crashes half-way is the one whose residue makes the *next* run
  fail somewhere else entirely.

---

## 12. Gotchas & good habits

- **`init()` navigates away on first load.** Design the entry point so the
  app renders only after the session callback runs.
- **Prefix the store IDs**: `did:ng:` + `session.private_store_id`.
- **`@id: ""` on insert** lets the engine mint the subject IRI. Keys in
  `{#each}` should be `@graph|@id` if several graphs are in scope.
- **When an object doesn't show up, it's the triples.** See §8 for the five
  usual causes and the query that tells them apart.
- **Don't keep references to `__raw__`** (the unproxied object) unless you
  deliberately want untracked reads/writes.
- **Everything is async and can throw** — wallet not connected, engine not
  ready. `try/catch` around `ng.*` calls; the promise-based session module
  above keeps ordering sane.
- **You never handle keys, readcaps, or the wallet API.** If you find
  yourself calling `wallet_*` functions, you've left app-land (that API is
  for the official app/CLI and will be replaced by capability delegation).
- **Sharing/permissions**: sharing a document = handing someone a capability
  to it (e.g. a readcap). The app-facing API for this is still evolving; for
  a first app, keep data in the private store.
- **There is no undo API (yet).** Documents are commit DAGs, so the substrate
  supports it — `ng.branch_history(session_id, nuri)` already gives you the
  full commit history — but no engine operation or ORM helper exposes
  "revert" today. If your app needs undo, keep your own stack of inverse
  edits and apply them through the ORM. This writes a *new* commit restoring
  the old state, git-revert style; synced history is never rewritten.

## 13. Where to look next

From `https://git.nextgraph.org/NextGraph/nextgraph-rs/src/branch/main/`:

- `sdk/js/orm/README.md` — the full ORM walkthrough (transactions,
  DeepSignal details, all frameworks).
- `sdk/js/examples/expense-tracker-rdf/` — complete graph-ORM app, with a
  Svelte 5 frontend in `src/frontends/svelte/` and the SHEX → generated
  types pipeline in `src/shapes/`.
- `sdk/js/examples/expense-tracker-discrete/` — the same app on JSON CRDTs.
- `sdk/js/shex-orm/README.md` — schema/codegen reference.
- https://docs.nextgraph.org — concepts (wallet, stores, NURIs) and the
  ORM reference.
