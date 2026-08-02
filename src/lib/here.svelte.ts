// Where the user is, shared by the screens that ask (S-01, S-40).
//
// One request per session, not one per screen: the position is module state, so
// a second screen mounting reuses the first answer rather than prompting again.
// Passive proximity only (§6.2) — asked when a screen opens, never watched.
//
// Refusal is a first-class outcome, not an error. §8's rule for S-01 is that
// the proximity section is absent rather than broken, and a memory app that
// stopped working indoors would be a poor one.

export interface Position {
    lat: number;
    lon: number;
}

let position = $state<Position | undefined>();
let locating = $state(false);
let refused = $state(false);
let asked = false;

function ask() {
    if (asked) return;
    asked = true;
    if (!navigator.geolocation) {
        refused = true;
        return;
    }
    locating = true;
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            position = { lat: pos.coords.latitude, lon: pos.coords.longitude };
            locating = false;
        },
        () => {
            locating = false;
            refused = true;
        },
        { timeout: 10_000 }
    );
}

export function useHere() {
    ask();
    return {
        get position() {
            return position;
        },
        get locating() {
            return locating;
        },
        get refused() {
            return refused;
        },
    };
}

/** Kilometres between two points, near enough for "was I here before?". */
export function km(a: Position, b: Position): number {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lon - a.lon) * Math.PI) / 180;
    const la = (a.lat * Math.PI) / 180;
    const lb = (b.lat * Math.PI) / 180;
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/** "800 m" / "2.4 km" — the same phrasing wherever a distance is shown. */
export function formatKm(d: number): string {
    return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
}

/** Test seam: the driver overrides geolocation, and the tests need a reset. */
export function resetHereForTests() {
    position = undefined;
    locating = false;
    refused = false;
    asked = false;
}
