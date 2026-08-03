Once you have your app served (for instance via `vite preview`) in a docker
container, you can run it alongside a local NextGraph broker deployment such as
the one provided by that [helper
project](https://github.com/reconnexion/nextgraph-devstack).

Check first that it's not already running locally (docker compose project
`ng-dev`).  If so, you should already have at least an admin user (named
"user5") which password is "secret", with which you can reach your app using
the [Nextgraph auth
server](http://localhost:14400/auth/#/wallet/login?o=http%3A%2F%2Flocalhost%3A4567%2F)
(if your app runs on port 4567), which will redirect to http://localhost:4567
after login as instructed by the `?o=` parameter.

If it's not already running, `make up` in `../nextgraph-devstack` will bring it
up. If no users are present yet, also run `make provision` and upload the wallet
that will be generated as `../nextgraph-devstack/wallets/user5.ngw` and then log
in.


## Fixture media

Cairns has no camera and no write path to a media document (Specs §1.2.8,
§3.4): photographs only exist because another application wrote them. For
development there is no such application yet, so `src/spikes/mediaFixture.ts`
plays one — it is deliberately outside `src/lib/` so the app itself never gains
that capability.

    make seed-media COUNT=40   # images, spread over August 2019, a third
                               # of them deliberately without a thumbnail
    make seed-clips            # one video and one audio document

Both drive the logged-in app through headless Chrome, so the devstack must be
up and the app served (`make run`). The documents land in the user's store like
any other, and Cairns then discovers them by SPARQL — which is the whole point.



## The map

MapLibre GL JS, per the README's stack. Two things about the build are not
obvious and are easy to undo by accident (SpikeFindings, spike 9):

  - `src/lib/mapStyle.ts` calls `setWorkerUrl` with a `?worker&url` import.
    Without it MapLibre computes a worker URL that bundling invalidated, and
    then fails **silently** — no error, no worker, and every source, even a
    local GeoJSON one, stays unloaded forever.
  - `vite.config.ts` sets `worker.format: "es"`, because that worker is a
    module worker.

The style is always a local object; the basemap is a raster *source* added on
top of it. A remote style URL would take the whole map down with it when
unreachable, including the user's own points — which is why it is not one. The
tile provider is a constant in `mapStyle.ts` for now and belongs in settings.

## The rest of the foreign store

Media are not the only shape Cairns reads and never writes. Specs §5 lists
reservations, public events, geometry tracks, external places, foreign
vocabularies and person records — and until something puts them in the store,
those rows of the census read zero, S-01's reservation card can never appear,
and the place facet has nothing more than one level deep to be transitive
about. `src/spikes/foreignFixture.ts` plays all of those applications at once.

    make seed-foreign                       # the lot
    make seed-foreign CONTACTS=60 TRACKS=4  # the defaults, spelled out
    make seed-foreign-clean                 # remove exactly what it wrote

What it writes:

  - **contacts** — 60 by default, because a real address book is not three
    people and the screens have to survive one that is not. Most are appended
    to the shared people document (§5: user-owned, any app may append), a few
    live in documents of their own, and two are `vcard:Individual`, a shape
    §5 names and `personShape.shex` does not match — so the census counts them
    and People does not list them.
  - **tags** — a couple of dozen more concepts in the local scheme, plus a
    second scheme written by somebody else, so reading across schemes is
    exercised rather than assumed.
  - **places** — a gazetteer nested three deep (Alfama → Lisboa → Portugal),
    with `owl:sameAs` onto Wikidata and OSM. Two of them carry coordinates
    only as the nested `schema:geo` node and none as the flat pair, which is
    what a foreign application really writes: the app shows them without
    coordinates, and that is B-14 in the data rather than in a register.
  - **events, reservations** — five reservation shapes, two of them imminent
    so the Here-and-Now card has something to be about, the rest inside the
    August 2019 window `seed-media` uses so the date-overlap join has both
    sides.
  - **tracks** — four, not one: a single track proves nothing about how a
    layer of them behaves when their times overlap each other.

Every subject it writes carries `app:fixture "seed-foreign"`. The devstack is
shared with other people's testing, so the marker is what makes
`seed-foreign-clean` exact — it removes marked subjects and nothing else, in
one update across every document (spike 8), so the store cannot end up half
cleaned. The marker is the one inauthentic thing in these documents and nothing
in the app reads it.

## What you were told about

Recommendations (§4) are the only thing the app owns that does not get a
document each: they are subjects inside one `schema:ItemList` document,
addressed by fragment. The list is found by the recommendations it already
holds rather than by its type — another application's shopping list is a
`schema:ItemList` too — which is why the first item and the list are written in
the same statement, and why an empty list never exists. When S-00 and
Preferences arrive, the list's identity belongs there instead.

They are the one screen that needs a position to be interesting, so `make
e2e-m6` overrides geolocation to Lisbon before it starts. That is also the only
coverage S-01's proximity path has ever had: the other milestones run with
location refused, which exercises §8's fallback and nothing else.

Fulfilment is not stored on the recommendation. A memory points at what prompted it with
`prov:wasInfluencedBy`, and "you went" is derived by scanning memories (§4.1) — so S-40, S-31
and S-01 all subscribe to memories to answer it, and nothing has to be kept in step.

Referents come from `make seed-foreign` — its five public events include one
running in a couple of days and one from four months ago, which is what makes
"happening soonest" and "expired" visible rather than notional.

### The app cannot know where it is

`getCurrentPosition` fails inside the auth server's iframe — *"disabled in this document by
permissions policy"* — because the embedding page does not set `allow="geolocation"` on the
`<iframe>`. Nothing in Cairns can change that (Appendix A, B-15). Everything that needs a
position is conditional, so the screens read as they do indoors; `make e2e-m6` probes for a
position and prints `SKIP` rather than `OK` for the assertions that need one.

## Tags

The vocabulary belongs to whichever application manages it; Cairns may only append (§5), and
`lib/tags.ts` is where that licence is honoured — nothing renames, merges, deletes or
re-parents, including concepts this app wrote.

Hierarchy is `skos:broader`, written for the first time here. The user types a path,
`portugal/sintra`; what is stored is the *segment* as `skos:prefLabel` plus a `broader` link,
so another application reads ordinary SKOS rather than a string convention. The path is a user
interface, the tree is the data — and the separator lives in one file (`lib/tagPaths.ts`), at
the price of not being able to write a tag whose label contains a slash.

**Not a space**, which would be easier to type. Labels in published vocabularies are mostly
multi-word — 68% of AGROVOC's English `skos:prefLabel`s contain a space, 73% of Getty AAT's,
90% of the EU Publications Office's, all measured by SPARQL against their endpoints. Since the
app reads foreign schemes and never restructures them (§5), a space separator would make "cork
oak" untypeable and silently re-read it as a hierarchy nobody published.

Completion is scoped: `portugal/li` offers Portugal's children, never `food/lisboa`. That is
what makes two hundred tags navigable. `make tagpicker` drives it end to end and cleans up
after itself.

Two layout rules the widget learned the hard way, both worth keeping: **creating is a row
inside the list**, not a button beneath it, and **the selected chips go above the input** —
the listbox opens downward and covers anything below it, which made the original create button
impossible to click at the only moment it existed.

## Places with no name, and giving them one

§3.2's second shape is deliberately poor: coordinates with no identity, nested inside the
memory that recorded them, with **no URI** — not referenceable, not shareable, not searchable.
That is the right default, because most places one stands in are nobody's business. S-33 is
where the user says "this one is different", once, for the one that turns out to matter.

Two operations, both in `lib/places.ts`:

- `updateUnnamedLocation` — surgical, not the wholesale rewrite `updateMemory` does. The
  screen is reached from a memory that is *not* being edited, so the other locations of that
  memory and everything else in its document must come out untouched. The IRI is not rewritten
  either: it is derived from a position (`<doc>#place-N`), and the memory's reference keeps
  pointing at it.
- `promoteLocation` — mints the document, then writes the place and repoints the memory in
  **one `sparql_update` over both graphs** (Appendix A, B-06; spike 8). The alternative leaves
  either a place nobody references or a memory pointing at a place that does not exist.
  `doc_create` must come first — it is what produces the NURI the update names — so a failure
  after it leaves an empty document and nothing else, which is inert rather than wrong.

`owl:sameAs` is offered at promotion, which is the reconciliation §3.2 and B-04 ask for: when
the place already has an identity in Wikidata or OSM, say so rather than claiming this app's
URI is the first name it ever had. Minting is what you do when no external match exists.

`make s33` drives both operations and asserts what the store holds after each — including that
promotion leaves no orphan nested subject behind, the failure mode m3 already guards for the
editor. It also removes the document promotion mints, which is the one step in this repo where
a driver run creates a document that outlives the memory it came from.

### Editing an identified place: delete by value, never by predicate

S-31's "edit if locally owned" (§6.2) opens the same screen in its other mode. There is no way
to tell a place document this app minted from one another application wrote, and the answer is
not to refuse: the user knows what she is doing with her places. The answer is that an edit
**can only withdraw what it was shown**.

So `updatePlaceFields` takes the values that were read alongside the new ones, and every
deletion names an exact value — `DELETE DATA { <p> schema:name "the old one" }`, never
`DELETE WHERE { <p> schema:name ?v }`. A second name in another language, a `sameAs` the app's
shape does not surface, opening hours, categories, an address broken into parts: none of it
can be caught in a deletion that names values the app never saw. The structured coordinates
node is updated through a `WHERE` clause that binds whatever node `schema:geo` points at, so a
foreign place keeps its own node rather than growing a second one.

The consequence is worth knowing: an edit made against a stale value withdraws the *stale*
one, and the current one survives beside the new. That is a merge to resolve, not data
destroyed — the right trade for a store shared with applications this one has never heard of.

Places whose URI is not `did:ng:` get no Edit button at all: a gazetteer's entry is readable
and not ours to rewrite. `make s33` proves the rule by writing three properties Cairns cannot
show into a place document and asserting they are all still there after an edit.

## Search, without an index

S-02 is built on SPARQL alone (Appendix A, **B-08** stays open). The `search-probe`
measurements decided the shape of it: constraining the query to memories cost about **3×** the
unconstrained scan of every literal, because the planner does worse with the extra join — so
`lib/search.ts` asks one query for *every* literal that matches, with each subject's types
concatenated, and the classifying happens in the app. One round-trip, and §6.2's "results
grouped by type" falls out of it.

`LCASE` on both sides rather than `REGEX(…, "i")`: the probe measured them as equally fast,
and a needle is user input — a regex would let a stray `(` turn a search into an error.

**What is missing is ranking, not expressiveness**, so the screen says so at the bottom rather
than pretending otherwise: substring matching, no stemming, and time for an order because
there is no relevance to sort by. An archive is chronological; a made-up score would not be.

### The result set as a filter

§6.2: *"Any result set can be handed to S-22 as a filter, which is how a text search becomes a
bulk tagging operation."* That is a `docs` facet on the browse filter — a list of memory
documents. It is the one facet with no control in the filter bar, because the other five
describe a property of a memory and this one names memories; the shell shows a banner with the
count and a way out instead. It is a facet like any other underneath, so `blame` can name it
when a filter yields nothing, and `drop` removes it.

The hand-off also selects the memories (`browse.selectAll`), because the point of it is the
bulk action and selecting forty rows by hand is a poor way to get there. Nothing is written:
the bar still asks what to do with them. `Select all N` is now in the selection bar too, which
makes any filter — not just a search — one tap from a bulk action.

`make search` drives the whole path: a needle in a title, in a narrative and in a tag; the
groups; the hand-off; and the way back out. Self-cleaning.

## Sibling memories

S-20's last sections (§6.2): the other memories at the same place, with the same people,
sharing tags, or about the same public event. `lib/siblings.ts` derives them and stores
nothing (§1.3.16) — a sibling relation is an equality between two memories' references, so it
is recomputed from whatever has synced, and a place that has not arrived yet produces no group
rather than a wrong one. `make siblings` drives it end to end and cleans up after itself.

One group per shared *value*, not per facet, so the heading can say which thing is shared and
tapping it can hand the rest to the screen that already lists them — S-31 for a place, S-61
for a person, the archive filtered for a tag. A public event has nowhere to go until S-34
exists, so an event group shows all its members instead of an overflow link.

Two deliberate narrowings, both in `keysOf`: **unnamed locations are skipped**, because a
dropped pin lives in its own memory's document as `<doc>#place-N` and its IRI could never
equal another memory's — that is S-22b's business, where proximity is visible; and **tags
match exactly, not up the hierarchy**, because otherwise every memory in Portugal would be a
sibling of every other. People are the exception that must be broad: they match on `personKey`,
so a companion is one person whether or not their bare names have been promoted (§3.3).

## Grouping suggestions

S-22a offers runs of memories that look like one episode (§6.2). Specs §10.2 leaves the
clustering rule open — "gap threshold, distance from a frequent place, minimum member count" —
so `lib/grouping.ts` answers it with a first cut, and keeps the three numbers together at the
top of the file so that revisiting the question means changing them, not finding them:

| | | why |
|---|---|---|
| `GAP_HOURS` | 36 | at most one empty day inside an episode |
| `RADIUS_KM` | 50 | how far the next memory may be from the *previous* one, not the first — a trip down a coast is one episode though its ends are far apart |
| `MIN_MEMBERS` | 3 | two memories are a pair |
| `HOME_RADIUS_KM` | 25 | around the frequent place, a run of days is ordinary life |
| `HOME_MIN_MEMORIES` | 3 | below this the archive has no centre — and a nomadic archive, which this app is for, may have none at all |

A memory with no location joins on time alone: absence is not evidence of being somewhere
else (§1.3.15), and refusing it would make the suggestions depend on how much of the archive
happens to have coordinates.

**Dismissal (§3.9) is deliberately not built.** The workflow is not settled, and a rejection
is durable — writing one before the shape of the offer is agreed would leave permanent records
of a question we may end up asking differently. What stands in for it: a run whose members
already share a tag or a public event is never proposed, because the user has already said
what it is. Accepting a suggestion is also still only a proposal — it selects the run and
hands it to the bulk bar of §4.4, and nothing is written until the user finishes the action.

`make grouping` drives the whole path — the offer, both actions, and the offer disappearing
once the run is tagged — in an empty window of April 1998, and cleans up after itself.

### Two traps in the driver, worth knowing before writing the next step

**`location.hash = "#/new"` when the hash is already `#/new` fires no `hashchange`** — so the
router never resets and the screen is not remade. Saving pushes S-20, popping back leaves the
hash at `#/new`, and the next "new" memory was being written in the previous one's editor,
with its chips still in it. Capture through the archive's own button, as `m1`/`m3`/`m4` do.

**`vite preview` serves `dist/`, not the sources.** A step that asserts on a screen you have
just written will fail against a stale bundle in a way that looks exactly like a logic bug —
no error, no crash, just a section that renders nothing. `make build` first, or serve with
`make dev`.
