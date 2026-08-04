<script lang="ts">
    import { router, type Route, type RouteName } from "./lib/router.svelte";
    import { sessionPromise } from "./lib/ngSession";
    import { bindRejections } from "./lib/rejections.svelte";
    import S22Browse from "./screens/S22Browse.svelte";
    import S20Detail from "./screens/S20Detail.svelte";
    import S21Editor from "./screens/S21Editor.svelte";
    import S22cMedia from "./screens/S22cMedia.svelte";
    import S32PlacePicker from "./screens/S32PlacePicker.svelte";
    import S33PlaceEditor from "./screens/S33PlaceEditor.svelte";
    import S01HereNow from "./screens/S01HereNow.svelte";
    import S02Search from "./screens/S02Search.svelte";
    import S60People from "./screens/S60People.svelte";
    import S31PlaceDetail from "./screens/S31PlaceDetail.svelte";
    import S61Person from "./screens/S61Person.svelte";
    import S40HeardAbout from "./screens/S40HeardAbout.svelte";
    import S41RecommendationEditor from "./screens/S41RecommendationEditor.svelte";
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
        placeeditor: S33PlaceEditor,
        here: S01HereNow,
        search: S02Search,
        people: S60People,
        heard: S40HeardAbout,
        recommendation: S41RecommendationEditor,
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

    // The five tabs of §6. All five are real screens now.
    const tabs: { label: string; icon: string; route?: Route }[] = [
        { label: "Here & Now", icon: "📍", route: { name: "here" } },
        { label: "Browse", icon: "🗂️", route: { name: "browse" } },
        { label: "People", icon: "👥", route: { name: "people" } },
        { label: "Heard about", icon: "💡", route: { name: "heard" } },
        { label: "Me", icon: "🪪", route: { name: "me" } },
    ];

    const tabClick = (t: (typeof tabs)[number]) =>
        router.replaceRoot(
            t.route ?? { name: "stub", params: { label: t.label } }
        );

    // Which tab a route sits under. Consulted for the root of the stack only:
    // a memory, a photograph or a half-written editor is pushed on top of the
    // tab the user came from, and that tab is the one "back" returns to, so it
    // stays lit while the transient screen is up. The root is a tab's own route
    // whenever the user got there by tapping a tab; a deep link (or a reload)
    // can make a pushed screen the root, and then the tab that owns it is the
    // honest answer.
    const owningTab: Record<RouteName, RouteName | undefined> = {
        here: "here",
        // Everything the archive opens into hangs off Browse.
        browse: "browse",
        detail: "browse",
        editor: "browse",
        mediagrid: "browse",
        media: "browse",
        place: "browse",
        placepicker: "browse",
        placeeditor: "browse",
        // S-02 is reached from Here & Now's search box.
        search: "here",
        people: "people",
        // S-61 is opened from People, and from a memory's attendees.
        person: "people",
        heard: "heard",
        // S-41 is only ever reached from Heard about, or from a place.
        recommendation: "heard",
        me: "me",
        visible: "me",
        dev: undefined,
        stub: undefined,
    };

    const root = $derived(router.stack[0]);

    const isActive = (t: (typeof tabs)[number]) =>
        t.route
            ? owningTab[root.name] === t.route.name
            : root.name === "stub" && root.params?.label === t.label;
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
