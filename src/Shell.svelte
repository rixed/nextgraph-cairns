<script lang="ts">
    import { router, type Route } from "./lib/router.svelte";
    import { sessionPromise } from "./lib/ngSession";
    import { bindRejections } from "./lib/rejections.svelte";
    import S22aTime from "./screens/S22aTime.svelte";
    import S20Detail from "./screens/S20Detail.svelte";
    import S21Editor from "./screens/S21Editor.svelte";
    import S22cMedia from "./screens/S22cMedia.svelte";
    import S51Media from "./screens/S51Media.svelte";
    import S70Me from "./screens/S70Me.svelte";
    import S76Sources from "./screens/S76Sources.svelte";
    import Dev from "./screens/Dev.svelte";
    import Stub from "./screens/Stub.svelte";

    // The rejections document is bound here, once: it outlives every screen,
    // and screens must never re-propose what the user rejected (§3.9).
    bindRejections();

    const screens = {
        browse: S22aTime,
        detail: S20Detail,
        editor: S21Editor,
        mediagrid: S22cMedia,
        media: S51Media,
        me: S70Me,
        sources: S76Sources,
        dev: Dev,
        stub: Stub,
    } as const;

    const Current = $derived(screens[router.current.name]);
    // Remount the screen when the route (not just a param mutation) changes.
    const routeKey = $derived(
        `${router.current.name}|${router.current.params?.doc ?? router.current.params?.memory ?? router.current.params?.label ?? ""}|${router.depth}`
    );

    // The five tabs of §6. Browse and Me are real; the rest are stubs.
    const tabs: { label: string; icon: string; route?: Route }[] = [
        { label: "Here & Now", icon: "📍" },
        { label: "Browse", icon: "🗂️", route: { name: "browse" } },
        { label: "People", icon: "👥" },
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
              (t.route.name === "me" && router.current.name === "sources")
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
        {#key routeKey}
            <Current />
        {/key}

        {#if router.current.name !== "editor"}
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
