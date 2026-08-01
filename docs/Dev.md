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
