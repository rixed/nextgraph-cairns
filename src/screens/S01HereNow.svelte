<script lang="ts">
    // S-01 Here and Now — the app's front door, and per §6.2 "functionally
    // Browse with the filter pinned to here and now, which is why it needs no
    // machinery of its own". It became cheap the moment the S-22 shell existed,
    // so this screen borrows rather than builds: the same memories, the same
    // resolution of places, read through proximity and the calendar instead of
    // through a filter bar.
    //
    // §8 governs most of what is below. Nothing here, nothing now falls back to
    // on-this-day and then to a capture prompt, and is never blank. Location
    // unavailable means the proximity section is absent, not broken — the rest
    // of the screen works, because a memory app that stops working indoors
    // would be a poor one.
    import { useShape } from "@ng-org/orm/svelte";
    import { OrmSubscription, normalizeScope } from "@ng-org/orm";
    import { MemoryShapeType } from "../shapes/orm/memoryShape.shapeTypes";
    import type { Memory } from "../shapes/orm/memoryShape.typings";
    import { useAllPlaces, findPlace, placeLabel } from "../lib/places";
    import { parsePrecisionDate, formatPrecisionDate } from "../lib/dates";
    import { router } from "../lib/router.svelte";
    import {
        useReservations,
        imminent,
    } from "../lib/reservations.svelte";
    import ReservationCard from "../components/ReservationCard.svelte";
    import { useHere, km, formatKm } from "../lib/here.svelte";

    const memories = useShape(MemoryShapeType, "did:ng:i");
    const places = useAllPlaces();

    let ready = $state(false);
    OrmSubscription.getOrCreate(
        MemoryShapeType,
        normalizeScope("did:ng:i")
    ).readyPromise.then(() => (ready = true));

    // Asked once per session and shared with S-40, which needs the same answer
    // to rank what you were told about by how far away it is.
    const where = useHere();
    const here = $derived(where.position);

    const all = $derived([...memories] as unknown as Memory[]);

    /**
     * §6.2's second card, ahead of everything but a live recommendation:
     * logistics you are about to need. Conditional like every other data
     * section (§5) — absent when nothing is booked, never an empty state
     * advertising a shape the store does not contain.
     */
    const reservations = useReservations();
    const soon = $derived(imminent(reservations.all));

    interface Near {
        m: Memory;
        distance: number;
        label: string;
        start: ReturnType<typeof parsePrecisionDate>;
    }

    /** Memories whose claimed location is within a few kilometres of here. */
    const nearby = $derived.by((): Near[] => {
        if (!here) return [];
        const out: Near[] = [];
        for (const m of all) {
            let best: Near | undefined;
            for (const iri of m.location ?? []) {
                const p = findPlace(places.all, iri);
                if (p?.lat === undefined || p.lon === undefined) continue;
                const d = km(here, { lat: p.lat, lon: p.lon });
                if (d > 5) continue;
                if (!best || d < best.distance)
                    best = {
                        m,
                        distance: d,
                        label: placeLabel(p, iri),
                        start: parsePrecisionDate(m.startDate),
                    };
            }
            if (best) out.push(best);
        }
        return out.sort((a, b) => a.distance - b.distance).slice(0, 8);
    });

    /** On this day, in other years — the fallback §8 asks for. */
    const onThisDay = $derived.by(() => {
        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        return all
            .flatMap((m) => {
                const start = parsePrecisionDate(m.startDate);
                // Only a date precise enough to name a day can be on this day;
                // a memory dated to a year is not "today" in any useful sense
                // (§8, coarse date — never invent finer).
                if (!start || start.precision === "year") return [];
                const [y, mo, d] = start.lexical.split(/[-T]/);
                if (Number(mo) !== month) return [];
                if (start.precision !== "month" && Number(d) !== day) return [];
                if (Number(y) === now.getFullYear()) return [];
                return [{ m, start, year: Number(y) }];
            })
            .sort((a, b) => b.year - a.year)
            .slice(0, 8);
    });

    const open = (m: Memory) =>
        router.push({ name: "detail", params: { doc: m["@graph"] } });
</script>

<div class="p-4 max-w-2xl mx-auto flex flex-col gap-4">
    <h1 class="text-xl font-bold">Here & now</h1>

    {#if !ready}
        <div class="flex items-center gap-2 text-sm opacity-70">
            <span class="loading loading-bars loading-xs"></span>
            reading your memories…
        </div>
    {/if}

    {#if soon.length}
        <div>
            <h2 class="text-sm font-semibold opacity-70 mb-1">Coming up</h2>
            <ul class="bg-base-200 rounded-box w-full p-3 flex flex-col gap-2">
                {#each soon as r (r.id)}
                    <li><ReservationCard {r} /></li>
                {/each}
            </ul>
        </div>
    {/if}

    {#if where.locating}
        <p class="text-sm opacity-60">finding out where you are…</p>
    {:else if nearby.length}
        <div>
            <h2 class="text-sm font-semibold opacity-70 mb-1">
                You have been here before
            </h2>
            <ul class="menu bg-base-200 rounded-box w-full">
                {#each nearby as n (n.m["@graph"])}
                    <li>
                        <button onclick={() => open(n.m)}>
                            <span class="flex flex-col items-start">
                                <span class="font-medium">
                                    {n.m.name ??
                                        (n.start
                                            ? formatPrecisionDate(n.start)
                                            : "A memory")}
                                </span>
                                <span class="text-xs opacity-60">
                                    {n.label} ·
                                    {formatKm(n.distance)} away
                                </span>
                            </span>
                        </button>
                    </li>
                {/each}
            </ul>
        </div>
    {/if}

    {#if onThisDay.length}
        <div>
            <h2 class="text-sm font-semibold opacity-70 mb-1">On this day</h2>
            <ul class="menu bg-base-200 rounded-box w-full">
                {#each onThisDay as t (t.m["@graph"])}
                    <li>
                        <button onclick={() => open(t.m)}>
                            <span class="flex flex-col items-start">
                                <span class="font-medium">
                                    {t.m.name ?? formatPrecisionDate(t.start)}
                                </span>
                                <span class="text-xs opacity-60">
                                    {formatPrecisionDate(t.start)}
                                </span>
                            </span>
                        </button>
                    </li>
                {/each}
            </ul>
        </div>
    {/if}

    {#if ready && !nearby.length && !onThisDay.length && !soon.length && !where.locating}
        <!-- Nothing here, nothing now: never blank (§8). -->
        <div class="text-center py-10 flex flex-col items-center gap-3">
            <p class="opacity-70">
                Nothing from here, nothing from today. That is what an empty
                afternoon looks like.
            </p>
            <button
                class="btn btn-primary"
                onclick={() => router.push({ name: "editor" })}
            >
                Capture a memory
            </button>
        </div>
    {:else}
        <button
            class="btn btn-primary self-start"
            onclick={() => router.push({ name: "editor" })}
        >
            Capture a memory
        </button>
    {/if}

    {#if where.refused}
        <p class="text-xs opacity-60">
            Without your location this shows what happened on this day in other
            years. Everything else works as it does anywhere.
        </p>
    {/if}
</div>
