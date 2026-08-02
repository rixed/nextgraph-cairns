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
