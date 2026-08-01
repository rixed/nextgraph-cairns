// The developer view: the annotations that make the app's own gaps visible —
// which shapes it looks for and does not find, which responsibilities it is
// borrowing (Appendix A), and which media descriptors publish no thumbnail.
//
// `import.meta.env.DEV` decides this at build time, which is no use to someone
// running a preview build inside the wallet's iframe, where the URL cannot be
// edited. So the flag is a runtime one: it defaults to the build's own answer
// and can be turned on from S-76, which is a demo surface as much as a
// settings surface (§6.2).

const KEY = "cairns.devView";

function stored(): boolean | undefined {
    try {
        const v = localStorage.getItem(KEY);
        return v === null ? undefined : v === "on";
    } catch {
        // Storage can be unavailable in an embedded context; the flag then
        // lives for the session only, which is enough to look at a screen.
        return undefined;
    }
}

let on = $state(stored() ?? import.meta.env.DEV);

export const devView = {
    get on(): boolean {
        return on;
    },
    set(value: boolean) {
        on = value;
        try {
            localStorage.setItem(KEY, value ? "on" : "off");
        } catch {
            /* session-only, as above */
        }
    },
    toggle() {
        devView.set(!on);
    },
};
