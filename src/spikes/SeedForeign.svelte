<script lang="ts">
    // The foreign-document fixture, driven by hand or by `make seed-foreign`.
    //
    // Not a spike: nothing here is measuring anything. It is the other half of
    // the store — the documents Cairns reads and never writes (Specs §5) — so
    // that the census, S-01's reservation card, the place facet and the map
    // slice meet data instead of an empty result set.
    import {
        clearFixture,
        existingPlaces,
        seedContacts,
        seedEvents,
        seedPlaces,
        seedReservations,
        seedTags,
        seedTracks,
    } from "./foreignFixture";

    let contacts = $state(60);
    let tracks = $state(4);
    let log = $state<string[]>([]);
    let busy = $state(false);
    let places: Record<string, string> = {};

    const say = (s: string) => {
        log = [...log, s];
        console.log("[seed-foreign]", s);
    };

    /** Every step reports through the same log, and never throws into the UI. */
    async function run(label: string, fn: () => Promise<void>) {
        busy = true;
        const t0 = performance.now();
        try {
            await fn();
            say(`${label} — done in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
        } catch (e) {
            say(`ERROR in ${label}: ${e}`);
        } finally {
            busy = false;
        }
    }

    /** Places first: events and reservations point at them. */
    async function withPlaces(): Promise<Record<string, string>> {
        if (!Object.keys(places).length) places = await existingPlaces();
        if (!Object.keys(places).length) places = await seedPlaces(say);
        return places;
    }

    const doContacts = () =>
        run("contacts", () => seedContacts(contacts, say));
    const doTags = () => run("tags", () => seedTags(say));
    const doPlaces = () =>
        run("places", async () => {
            places = await seedPlaces(say);
        });
    const doEvents = () =>
        run("events", async () => seedEvents(await withPlaces(), say));
    const doReservations = () =>
        run("reservations", async () => seedReservations(await withPlaces(), say));
    const doTracks = () => run("tracks", () => seedTracks(tracks, say));

    async function seedAll() {
        await doContacts();
        await doTags();
        await doPlaces();
        await doEvents();
        await doReservations();
        await doTracks();
        say("seeded the foreign store");
    }

    const doClear = () =>
        run("clean up", async () => {
            await clearFixture(say);
            places = {};
            say("cleared the fixture");
        });
</script>

<div>
    <h2 class="text-lg font-semibold">Seed the foreign store</h2>
    <p class="text-xs opacity-70 my-1">
        Documents Cairns reads but never writes (§5), plus contacts appended to
        the shared people document. Everything written here is marked, and
        “clean up” removes exactly that — the devstack is shared.
    </p>

    <div class="flex flex-wrap items-end gap-2 my-2">
        <label class="text-xs">
            contacts
            <input
                class="input input-bordered input-xs w-20"
                type="number"
                bind:value={contacts}
            />
        </label>
        <label class="text-xs">
            tracks
            <input
                class="input input-bordered input-xs w-16"
                type="number"
                bind:value={tracks}
            />
        </label>
        <button class="btn btn-sm btn-primary" disabled={busy} onclick={seedAll}>
            1 · seed everything
        </button>
        <button class="btn btn-sm" disabled={busy} onclick={doContacts}>
            contacts
        </button>
        <button class="btn btn-sm" disabled={busy} onclick={doTags}>tags</button>
        <button class="btn btn-sm" disabled={busy} onclick={doPlaces}>
            places
        </button>
        <button class="btn btn-sm" disabled={busy} onclick={doEvents}>
            events
        </button>
        <button class="btn btn-sm" disabled={busy} onclick={doReservations}>
            reservations
        </button>
        <button class="btn btn-sm" disabled={busy} onclick={doTracks}>
            tracks
        </button>
        <button class="btn btn-sm btn-outline btn-error" disabled={busy} onclick={doClear}>
            2 · clean up
        </button>
    </div>

    <pre class="text-xs bg-base-200 p-2 rounded max-h-96 overflow-y-auto">{log.join("\n")}</pre>
</div>
