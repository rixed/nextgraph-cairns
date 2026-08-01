<script lang="ts">
    // The S-22 shell's projection switcher. Time, space and media are peer
    // ways into the same set (§1.1), so this is a switch between equals rather
    // than a menu of features. Space is not built yet and says so, since the
    // app states absence rather than hiding it (§8).
    import { router } from "../lib/router.svelte";

    let { current }: { current: "time" | "space" | "media" } = $props();
</script>

<div role="tablist" class="tabs tabs-box tabs-sm mb-3 self-start">
    <button
        role="tab"
        class="tab"
        class:tab-active={current === "time"}
        onclick={() => router.replaceRoot({ name: "browse" })}
    >
        Time
    </button>
    <button
        role="tab"
        class="tab"
        disabled
        title="The map is not built yet"
        class:tab-active={current === "space"}
    >
        Space
    </button>
    <button
        role="tab"
        class="tab"
        class:tab-active={current === "media"}
        onclick={() => router.replaceRoot({ name: "mediagrid" })}
    >
        Media
    </button>
</div>
