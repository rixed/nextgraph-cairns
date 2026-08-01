<script lang="ts">
    // Spike 6 — what a media grid costs (Specs §3.4, boundary B-01).
    //
    // `file_get` streams a whole file; there is no server-side thumbnail and no
    // partial fetch. S-22c wants a screenful of tiles at once, so the questions
    // are: how long does filling a grid take from thumbnails, does concurrency
    // help or thrash the bridge, and how much worse would it be if the app
    // ignored the "never fetch full-size to shrink" rule.
    import { createMediaDoc, fetchFile, type MediaSpec } from "./mediaFixture";
    import { select, fmt } from "./spikeUtils";

    let count = $state(40);
    let concurrency = $state(6);
    let log = $state<string[]>([]);
    let tiles = $state<{ url: string; withThumb: boolean }[]>([]);

    // Descriptors found by SPARQL. Plain arrays, never $state proxies, because
    // these strings go back into ng.file_get.
    let discovered: {
        doc: string;
        thumb?: string;
        content: string;
    }[] = [];

    const say = (s: string) => {
        log = [...log, s];
        console.log("[spike6]", s);
    };

    const mb = (bytes: number) => `${(bytes / 1048576).toFixed(2)} MB`;

    function heap(): string {
        const m = (performance as any).memory;
        return m ? `heap ${mb(m.usedJSHeapSize)}` : "heap n/a";
    }

    /** Seed the store as another application would have, over one summer. */
    async function seed() {
        try {
            const t0 = performance.now();
            for (let i = 0; i < count; i++) {
                const day = 1 + (i % 28);
                const spec: MediaSpec = {
                    label: `fix${i}`,
                    // Spread over August 2019, a few per day, to give the
                    // overlap query something to bite on.
                    when: `2019-08-${String(day).padStart(2, "0")}T${String(9 + (i % 10)).padStart(2, "0")}:15:00`,
                    lat: 38.7 + (i % 7) * 0.01,
                    lon: -9.14 + (i % 5) * 0.01,
                    // A third of them have no thumbnail: the placeholder path
                    // must be exercised by real data, not by a mock.
                    withThumbnail: i % 3 !== 0,
                    caption: i % 4 === 0 ? `fixture photo ${i}` : undefined,
                };
                await createMediaDoc(spec);
                if ((i + 1) % 10 === 0)
                    say(`  seeded ${i + 1}/${count} (${fmt(performance.now() - t0)})`);
            }
            const total = performance.now() - t0;
            say(
                `seeded ${count} media documents in ${fmt(total)} — ${fmt(total / count)} each`
            );
        } catch (e) {
            say(`ERROR: ${e}`);
        }
    }

    /** What Cairns actually does: discover foreign descriptors by SPARQL. */
    async function discover() {
        try {
            const t0 = performance.now();
            const rows = await select(
                `PREFIX schema: <https://schema.org/>
                 SELECT ?doc ?content ?thumb WHERE { GRAPH ?doc {
                    ?img a schema:ImageObject ; schema:contentUrl ?content .
                    OPTIONAL { ?img schema:thumbnailUrl ?thumb }
                 } }`
            );
            discovered = rows.map((r: any) => ({
                doc: r.doc.value,
                content: r.content.value,
                thumb: r.thumb?.value,
            }));
            const withThumb = discovered.filter((d) => d.thumb).length;
            say(
                `discovered ${discovered.length} image descriptors in ${fmt(performance.now() - t0)}` +
                    ` — ${withThumb} with a thumbnail, ${discovered.length - withThumb} without`
            );
        } catch (e) {
            say(`ERROR: ${e}`);
        }
    }

    async function fetchAll(
        items: { doc: string; url: string; withThumb: boolean }[],
        limit: number
    ) {
        const urls: { url: string; withThumb: boolean }[] = [];
        let bytes = 0;
        const t0 = performance.now();
        let next = 0;
        const worker = async () => {
            while (next < items.length) {
                const it = items[next++];
                const f = await fetchFile(it.url, it.doc);
                bytes += f.bytes;
                urls.push({
                    url: URL.createObjectURL(f.blob),
                    withThumb: it.withThumb,
                });
            }
        };
        await Promise.all(
            Array.from({ length: Math.max(1, limit) }, () => worker())
        );
        return { ms: performance.now() - t0, bytes, urls };
    }

    /** Thumbnails only — the rule the spec mandates. */
    async function fetchThumbnails(limit: number) {
        const items = discovered
            .filter((d) => d.thumb)
            .map((d) => ({ doc: d.doc, url: d.thumb!, withThumb: true }));
        if (!items.length) return say("discover first (or nothing has thumbnails)");
        try {
            const r = await fetchAll(items, limit);
            tiles = r.urls;
            say(
                `${items.length} thumbnails, concurrency ${limit}: ${fmt(r.ms)} total, ` +
                    `${fmt(r.ms / items.length)} each, ${mb(r.bytes)} transferred, ${heap()}`
            );
        } catch (e) {
            say(`ERROR: ${e}`);
        }
    }

    /** The forbidden path, measured once so B-01 has a number behind it. */
    async function fetchFullSize(limit: number) {
        const items = discovered.map((d) => ({
            doc: d.doc,
            url: d.content,
            withThumb: false,
        }));
        if (!items.length) return say("discover first");
        try {
            const r = await fetchAll(items, limit);
            tiles = r.urls;
            say(
                `${items.length} FULL-SIZE images, concurrency ${limit}: ${fmt(r.ms)} total, ` +
                    `${fmt(r.ms / items.length)} each, ${mb(r.bytes)} transferred, ${heap()}`
            );
        } catch (e) {
            say(`ERROR: ${e}`);
        }
    }

    function release() {
        tiles.forEach((t) => URL.revokeObjectURL(t.url));
        tiles = [];
        say(`released blob URLs — ${heap()}`);
    }
</script>

<div>
    <h2 class="text-lg font-semibold">Spike 6 — thumbnails at grid scale</h2>

    <div class="flex flex-wrap items-end gap-2 my-2">
        <label class="text-xs">
            seed count
            <input
                class="input input-bordered input-xs w-20"
                type="number"
                bind:value={count}
            />
        </label>
        <button class="btn btn-sm" onclick={seed}>1 · seed media</button>
        <button class="btn btn-sm" onclick={discover}>2 · discover</button>
        <button class="btn btn-sm" onclick={() => fetchThumbnails(1)}>
            3 · thumbnails, sequential
        </button>
        <label class="text-xs">
            concurrency
            <input
                class="input input-bordered input-xs w-16"
                type="number"
                bind:value={concurrency}
            />
        </label>
        <button class="btn btn-sm" onclick={() => fetchThumbnails(concurrency)}>
            4 · thumbnails, concurrent
        </button>
        <button class="btn btn-sm" onclick={() => fetchFullSize(concurrency)}>
            5 · full-size instead
        </button>
        <button class="btn btn-sm" onclick={release}>6 · release</button>
    </div>

    {#if tiles.length}
        <div class="grid grid-cols-8 gap-1 my-2">
            {#each tiles as t, i (i)}
                <img
                    src={t.url}
                    alt=""
                    class="w-full aspect-square object-cover rounded"
                />
            {/each}
        </div>
    {/if}

    <pre class="text-xs bg-base-200 p-2 rounded max-h-72 overflow-y-auto">{log.join("\n")}</pre>
</div>
