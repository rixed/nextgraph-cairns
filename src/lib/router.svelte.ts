// Minimal hash-based stack router. Routes live on an in-memory stack (so a
// pushed screen can hand a value back to its caller — the picker-return seam
// S-32/S-72 need later); location.hash mirrors the top for back-button support.

export type RouteName =
    | "browse" // S-22 shell, params: projection = time (default) | space | media
    | "detail"
    | "editor"
    | "media" // S-51, params: doc = media document, from = memory that led here
    | "mediagrid" // S-22c, params: memory = the memory scoping the filter
    | "placepicker" // S-32, params: start/end = the caller's span, for the
    //                 coordinates its photographs already carry
    | "here" // S-01
    | "people" // S-60
    | "person" // S-61, params: key = the person key (see lib/people.ts)
    | "me" // S-70
    | "visible" // S-76
    | "dev"
    | "stub";

export interface Route {
    name: RouteName;
    params?: Record<string, string>;
    /** Called with pop(value) when this route is popped — the picker seam. */
    onReturn?: (value?: unknown) => void;
    /** Identity of this entry, so the shell can keep it mounted. Set here. */
    key?: number;
}

let nextKey = 0;
const keyed = (r: Route): Route => ({ ...r, key: nextKey++ });

function toHash(r: Route): string {
    switch (r.name) {
        case "browse":
            return r.params?.projection && r.params.projection !== "time"
                ? `#/${r.params.projection}`
                : "#/";
        case "detail":
            return `#/memory/${encodeURIComponent(r.params!.doc)}`;
        case "editor":
            return r.params?.doc
                ? `#/edit/${encodeURIComponent(r.params.doc)}`
                : "#/new";
        case "media":
            return `#/media/${encodeURIComponent(r.params!.doc)}`;
        case "mediagrid":
            return r.params?.memory
                ? `#/media-of/${encodeURIComponent(r.params.memory)}`
                : "#/media";
        case "placepicker":
            return "#/place";
        case "here":
            return "#/here";
        case "people":
            return "#/people";
        case "person":
            return `#/person/${encodeURIComponent(r.params!.key)}`;
        case "me":
            return "#/me";
        case "visible":
            return "#/visible";
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
    if (parts[0] === "media" && parts[1])
        return { name: "media", params: { doc: decodeURIComponent(parts[1]) } };
    // The unscoped grid is a projection of the browse shell; only the version
    // scoped to one memory is a screen of its own.
    if (parts[0] === "media")
        return { name: "browse", params: { projection: "media" } };
    if (parts[0] === "space")
        return { name: "browse", params: { projection: "space" } };
    if (parts[0] === "media-of" && parts[1])
        return {
            name: "mediagrid",
            params: { memory: decodeURIComponent(parts[1]) },
        };
    // Reloading onto the picker loses the caller it would return to, so it
    // opens as an ordinary screen and its choices go nowhere. Nothing is lost:
    // the caller is a half-written memory that reloading discarded anyway.
    if (parts[0] === "place") return { name: "placepicker" };
    if (parts[0] === "here") return { name: "here" };
    if (parts[0] === "people") return { name: "people" };
    if (parts[0] === "person" && parts[1])
        return { name: "person", params: { key: decodeURIComponent(parts[1]) } };
    if (parts[0] === "me") return { name: "me" };
    if (parts[0] === "visible") return { name: "visible" };
    if (parts[0] === "dev") return { name: "dev" };
    if (parts[0] === "stub" && parts[1])
        return { name: "stub", params: { label: decodeURIComponent(parts[1]) } };
    return { name: "browse" };
}

let stack = $state<Route[]>([keyed(fromHash(location.hash))]);

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
        stack = [keyed(fromHash(hash))];
    }
});

export const router = {
    get current(): Route {
        return stack[stack.length - 1];
    },
    /**
     * The whole stack, oldest first. The shell mounts every entry and shows
     * only the last: a screen that pushed a picker must still be there — with
     * everything typed into it — when the picker hands its answer back.
     */
    get stack(): Route[] {
        return stack;
    },
    get depth(): number {
        return stack.length;
    },
    push(r: Route) {
        stack.push(keyed(r));
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
        stack = [keyed(r)];
        setHash(toHash(r));
    },
};
