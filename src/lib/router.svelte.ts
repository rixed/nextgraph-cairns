// Minimal hash-based stack router. Routes live on an in-memory stack (so a
// pushed screen can hand a value back to its caller — the picker-return seam
// S-32/S-72 need later); location.hash mirrors the top for back-button support.

export type RouteName = "browse" | "detail" | "editor" | "dev" | "stub";

export interface Route {
    name: RouteName;
    params?: Record<string, string>;
    /** Called with pop(value) when this route is popped — the picker seam. */
    onReturn?: (value?: unknown) => void;
}

function toHash(r: Route): string {
    switch (r.name) {
        case "browse":
            return "#/";
        case "detail":
            return `#/memory/${encodeURIComponent(r.params!.doc)}`;
        case "editor":
            return r.params?.doc
                ? `#/edit/${encodeURIComponent(r.params.doc)}`
                : "#/new";
        case "dev":
            return "#/dev";
        case "stub":
            return `#/stub/${encodeURIComponent(r.params!.label)}`;
    }
}

function fromHash(h: string): Route {
    const parts = h.replace(/^#\/?/, "").split("/");
    if (parts[0] === "memory" && parts[1])
        return { name: "detail", params: { doc: decodeURIComponent(parts[1]) } };
    if (parts[0] === "edit" && parts[1])
        return { name: "editor", params: { doc: decodeURIComponent(parts[1]) } };
    if (parts[0] === "new") return { name: "editor" };
    if (parts[0] === "dev") return { name: "dev" };
    if (parts[0] === "stub" && parts[1])
        return { name: "stub", params: { label: decodeURIComponent(parts[1]) } };
    return { name: "browse" };
}

let stack = $state<Route[]>([fromHash(location.hash)]);

function setHash(h: string) {
    if (location.hash !== h) location.hash = h;
}

window.addEventListener("hashchange", () => {
    const hash = location.hash || "#/";
    // Echo of a programmatic setHash (possibly one of several queued events):
    // the stack top already matches, nothing to do.
    if (toHash(stack[stack.length - 1]) === hash) return;
    const prev = stack[stack.length - 2];
    if (prev && toHash(prev) === hash) {
        // Browser back: same as an in-app pop without a return value.
        const r = stack.pop()!;
        r.onReturn?.(undefined);
    } else {
        stack = [fromHash(hash)];
    }
});

export const router = {
    get current(): Route {
        return stack[stack.length - 1];
    },
    get depth(): number {
        return stack.length;
    },
    push(r: Route) {
        stack.push(r);
        setHash(toHash(r));
    },
    pop(value?: unknown) {
        if (stack.length < 2) return;
        const r = stack.pop()!;
        setHash(toHash(stack[stack.length - 1]));
        r.onReturn?.(value);
    },
    /** Tab switch: reset the stack to a single root route. */
    replaceRoot(r: Route) {
        stack = [r];
        setHash(toHash(r));
    },
};
