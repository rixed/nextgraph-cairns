<script lang="ts">
    // The S-22 shell's projection switcher. Time, space and media are peer
    // ways into the same set (§1.1), so this is a switch between equals rather
    // than a menu of features. The filter, the selection and each projection's
    // scroll position live in lib/browse.svelte.ts and survive the switch.
    //
    // Space is not built yet and says so, since the app states absence rather
    // than hiding it (§8).
    import { router } from "../lib/router.svelte";
    import type { Projection } from "../lib/browse.svelte";

    let { current }: { current: Projection } = $props();

    const go = (projection: Projection) =>
        router.replaceRoot({ name: "browse", params: { projection } });
</script>

<div role="tablist" class="tabs tabs-box tabs-sm mb-3 self-start">
    <button
        role="tab"
        class="tab"
        class:tab-active={current === "time"}
        onclick={() => go("time")}
    >
        Time
    </button>
    <button
        role="tab"
        class="tab"
        class:tab-active={current === "space"}
        onclick={() => go("space")}
    >
        Space
    </button>
    <button
        role="tab"
        class="tab"
        class:tab-active={current === "media"}
        onclick={() => go("media")}
    >
        Media
    </button>
</div>
