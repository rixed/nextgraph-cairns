import { ng, init as initNgWeb } from "@ng-org/web";
import { initNg as initNgSignals } from "@ng-org/orm";
import type { Session as NextGraphSession } from "@ng-org/web";

/** The session with the NextGraph engine, or undefined while not loaded. */
export let session: NextGraphSession | undefined;

let resolveSessionPromise: (
    value: NextGraphSession | PromiseLike<NextGraphSession>
) => void;
let rejectSessionPromise: (reason?: unknown) => void;

/** Resolves to the current NextGraph session. */
export const sessionPromise: Promise<NextGraphSession> = new Promise(
    (resolve, reject) => {
        resolveSessionPromise = resolve;
        rejectSessionPromise = reject;
    }
);

/** Call as early as possible: on first visit it redirects to the wallet login. */
export async function init() {
    await initNgWeb(
        async (event: any) => {
            session = event.session;
            session!.ng ??= ng;
            resolveSessionPromise(session!);
            initNgSignals(ng, session!);
        },
        true, // singleton session
        [] // access requests (capability delegation; none yet)
    ).catch((error) => {
        rejectSessionPromise(error);
    });
}

/** The NURI of the user's private store (needs the did:ng: prefix added). */
export async function privateStoreNuri(): Promise<string> {
    const s = await sessionPromise;
    return `did:ng:${s.private_store_id}`;
}
