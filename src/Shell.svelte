<script lang="ts">
    import { router, type Route } from "./lib/router.svelte";
    import { sessionPromise } from "./lib/ngSession";
    import { bindRejections } from "./lib/rejections.svelte";
    import S22Browse from "./screens/S22Browse.svelte";
    import S20Detail from "./screens/S20Detail.svelte";
    import S21Editor from "./screens/S21Editor.svelte";
    import S22cMedia from "./screens/S22cMedia.svelte";
    import S32PlacePicker from "./screens/S32PlacePicker.svelte";
    import S01HereNow from "./screens/S01HereNow.svelte";
    import S60People from "./screens/S60People.svelte";
    import S31PlaceDetail from "./screens/S31PlaceDetail.svelte";
    import S61Person from "./screens/S61Person.svelte";
    import S51Media from "./screens/S51Media.svelte";
    import S70Me from "./screens/S70Me.svelte";
    import S76Visible from "./screens/S76Visible.svelte";
    import Dev from "./screens/Dev.svelte";
    import Stub from "./screens/Stub.svelte";

    // The rejections document is bound here, once: it outlives every screen,
    // and screens must never re-propose what the user rejected (§3.9).
    bindRejections();

    const screens = {
        browse: S22Browse,
        detail: S20Detail,
        editor: S21Editor,
        mediagrid: S22cMedia,
        place: S31PlaceDetail,
        placepicker: S32PlacePicker,
        here: S01HereNow,
        people: S60People,
        person: S61Person,
        media: S51Media,
        me: S70Me,
        visible: S76Visible,
        dev: Dev,
        stub: Stub,
    } as const;

    // Every entry of the stack stays mounted and only the last is shown. A
    // screen that pushed a picker is still there, with everything typed into
    // it, when the picker hands its answer back (S-32, and S-72 later).
    const stack = $derived(router.stack);

    // The five tabs of §6. Browse and Me are real; the rest are stubs.
    const tabs: { label: string; icon: string; route?: Route }[] = [
        { label: "Here & Now", icon: "📍", route: { name: "here" } },
        { label: "Browse", icon: "🗂️", route: { name: "browse" } },
        { label: "People", icon: "👥", route: { name: "people" } },
        { label: "Heard about", icon: "💡" },
        { label: "Me", icon: "🪪", route: { name: "me" } },
    ];

    const tabClick = (t: (typeof tabs)[number]) =>
        router.replaceRoot(
            t.route ?? { name: "stub", params: { label: t.label } }
        );

    const isActive = (t: (typeof tabs)[number]) =>
        t.route
            ? router.current.name === t.route.name ||
              router.current.name === "detail" ||
              router.current.name === "editor" ||
              // The projections and what they open into are all Browse.
              router.current.name === "mediagrid" ||
              router.current.name === "media" ||
              router.current.name === "placepicker" ||
              (t.route.name === "me" && router.current.name === "visible") ||
              // S-61 is opened from People, and from a memory's attendees.
              (t.route.name === "people" && router.current.name === "person")
            : router.current.name === "stub" &&
              router.current.params?.label === t.label;
</script>

<div class="min-h-dvh pb-24">
    {#await sessionPromise}
        <div class="p-10 text-center">
            <span class="loading loading-spinner loading-lg"></span>
            <p class="mt-4 opacity-70">Connecting to your NextGraph session…</p>
        </div>
    {:then}
        {#each stack as route, i (route.key)}
            {@const Screen = screens[route.name]}
            <div class:hidden={i !== stack.length - 1}>
                <Screen />
            </div>
        {/each}

        {#if router.current.name !== "editor" && router.current.name !== "placepicker"}
            <button
                class="btn btn-primary btn-circle btn-lg fixed bottom-20 right-4 z-20 shadow-lg"
                aria-label="Capture a memory"
                onclick={() => router.push({ name: "editor" })}
            >
                +
            </button>
        {/if}
    {:catch error}
        <div class="alert alert-error m-4">Session failed: {error}</div>
    {/await}

    <nav class="dock z-10">
        {#each tabs as t (t.label)}
            <button
                class:dock-active={isActive(t)}
                onclick={() => tabClick(t)}
            >
                <span class="text-lg">{t.icon}</span>
                <span class="dock-label">{t.label}</span>
            </button>
        {/each}
    </nav>
</div>
