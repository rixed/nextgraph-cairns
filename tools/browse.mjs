// Headless-Chrome driver for the Cairns spikes.
// Usage: node browse.mjs <step> [args...]
// Keeps a persistent profile so the NextGraph wallet stays imported.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const PROFILE = path.join(HERE, "profile");
const SHOTS = path.join(HERE, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

const AUTH_URL =
    "http://localhost:14400/auth/#/wallet/login?o=http%3A%2F%2Flocalhost%3A4567%2F";
const WALLET_FILE =
    "/home/rixed/src/reconnexion/src/nextgraph-devstack/wallets/user5.ngw";

export async function launch() {
    const ctx = await chromium.launchPersistentContext(PROFILE, {
        headless: true,
        executablePath: "/usr/bin/google-chrome",
        viewport: { width: 1200, height: 900 },
        args: ["--disable-features=LocalNetworkAccessChecks"],
    });
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    if (process.env.PW_CONSOLE) {
        page.on("console", (msg) =>
            console.log(`[console:${msg.type()}]`, msg.text().slice(0, 300))
        );
    }
    page.on("pageerror", (err) => console.log("[pageerror]", err.message));
    page.on("requestfailed", (req) =>
        console.log("[requestfailed]", req.url(), req.failure()?.errorText)
    );
    return { ctx, page };
}

export async function shot(page, name) {
    const p = path.join(SHOTS, `${name}.png`);
    await page.screenshot({ path: p });
    console.log(`[shot] ${p}`);
}

export async function dump(page) {
    console.log("[url]", page.url());
    const text = await page.evaluate(() => document.body.innerText.slice(0, 3000));
    console.log("[text]", text);
    const inputs = await page.evaluate(() =>
        [...document.querySelectorAll("input, button, a")].map((e) => ({
            tag: e.tagName,
            type: e.type,
            text: (e.innerText || e.value || "").slice(0, 60),
            id: e.id,
            name: e.name,
        }))
    );
    console.log("[controls]", JSON.stringify(inputs, null, 1));
}

async function loginAndGetFrame(page) {
    // Enter through the local auth server rather than the app: importing the
    // wallet there is also what registers the local broker's bootstrap, which
    // a virgin profile lacks (the app alone would redirect to nextgraph.net
    // and be told no wallet exists).
    await page.goto(AUTH_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    const known = page.getByRole("button", { name: "user5", exact: true });
    if (await known.count()) {
        await known.click();
        await page.waitForTimeout(1500);
    } else if (await page.$("#import_wallet_file")) {
        await page.setInputFiles("#import_wallet_file", WALLET_FILE);
        await page.waitForTimeout(2500);
    }
    const pw = await page.$("#password-input");
    if (pw) {
        await pw.fill("secret");
        await page.getByRole("button", { name: "Confirm" }).click();
    }
    // Wait for the app iframe to appear and render its shell (the dock).
    for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(1000);
        const f = page
            .frames()
            .find((f) => f.url().startsWith("http://localhost:4567"));
        if (f) {
            const txt = await f
                .evaluate(() => document.body.innerText)
                .catch(() => "");
            if (txt.includes("Heard about") || txt.includes("session #"))
                return f;
        }
    }
    throw new Error("app iframe never became ready");
}

/** Wait until the app's session is connected and the memory sync finished. */
async function waitSynced(frame, timeoutMs = 240000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        const txt = await frame
            .evaluate(() => document.body.innerText)
            .catch(() => "");
        if (
            !txt.includes("Connecting to your NextGraph session") &&
            !txt.includes("syncing your memories")
        )
            return;
        await frame.page().waitForTimeout(2000);
    }
    throw new Error("app never finished syncing");
}

/** Click a button in the app frame by its (partial) label. */
async function click(frame, label) {
    await frame.getByRole("button", { name: label }).click();
}

/**
 * Pick an existing tag through the combobox (§3.5). `which` disambiguates the
 * several on one screen — the filter bar's is first, the editor's or the bulk
 * bar's is last.
 */
async function pickTag(frame, label, which = "last") {
    // `:visible` because the shell keeps earlier screens of the stack mounted
    // and hidden, each with its own picker — and everything below is scoped to
    // the widget actually typed into. A global item locator matched an option
    // in a different combobox, whose list was closed, and waited for it to
    // become visible until it timed out.
    const boxes = frame.locator(
        'input[placeholder="tag, or portugal/sintra"]:visible'
    );
    const box = which === "first" ? boxes.first() : boxes.last();
    const root = box.locator(
        'xpath=ancestor::*[@data-part="root"][@data-scope="combobox"][1]'
    );
    await box.click();
    await box.fill("");
    // Typed, not filled: the list opens on keystrokes, and `fill` sets the
    // value without any.
    await box.pressSequentially(label, { delay: 30 });
    await frame.page().waitForTimeout(800);
    // The option carries the full path; an exact match on a top-level tag is
    // its label.
    await root
        .locator('[data-scope="combobox"][data-part="item"]')
        .filter({ hasText: new RegExp(`^${label}$`) })
        .first()
        .click();
    await frame.page().waitForTimeout(500);
}

/** Read the spike log <pre> content. */
async function readLog(frame) {
    return await frame.evaluate(
        () => document.querySelector("pre")?.innerText ?? ""
    );
}

async function waitForLog(frame, needle, timeoutMs = 120000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        const log = await readLog(frame);
        if (log.includes(needle)) return log;
        await frame.page().waitForTimeout(500);
    }
    throw new Error(`timeout waiting for log to contain: ${needle}`);
}

/**
 * Wait until the engine answers queries. After login it syncs every repo before
 * responding, which with a few hundred documents takes about a minute
 * (SpikeFindings, spike 1) — polling beats guessing a sleep.
 */
async function settle(frame, timeoutMs = 300000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        const ok = await frame
            .evaluate(() =>
                Promise.race([
                    window
                        .spikeSelect("SELECT ?s WHERE { GRAPH ?g { ?s ?p ?o } } LIMIT 1")
                        .then(() => true),
                    new Promise((r) => setTimeout(() => r(false), 15000)),
                ])
            )
            .catch(() => false);
        if (ok) {
            console.log(`[settle] engine responsive after ${Math.round((Date.now() - t0) / 1000)}s`);
            return;
        }
        await frame.page().waitForTimeout(3000);
    }
    throw new Error("engine never became responsive");
}

/** How many browse rows carry exactly this title. */
async function titleCount(frame, title) {
    return await frame.evaluate(
        (t) =>
            [...document.querySelectorAll("li button .font-medium")].filter(
                (e) => e.textContent.trim() === t
            ).length,
        title
    );
}

/**
 * Delete memories with this title through the app's own delete affordance,
 * until only `keep` remain. Scenarios call this on the way out, so a headless
 * run does not leave a row behind every time it passes.
 */
async function deleteDownTo(page, frame, title, keep) {
    for (let guard = 0; guard < 25; guard++) {
        await frame.evaluate(() => (location.hash = "#/"));
        await page.waitForTimeout(2500);
        const n = await titleCount(frame, title);
        if (n <= keep) return n;
        await frame.evaluate(
            ([t, k]) => {
                const rows = [...document.querySelectorAll("li button")].filter(
                    (b) =>
                        b.querySelector(".font-medium")?.textContent.trim() === t
                );
                rows[k].click();
            },
            [title, keep]
        );
        await frame
            .getByRole("button", { name: "Delete" })
            .click({ timeout: 60000 });
        await frame.getByRole("button", { name: "Really delete" }).click();
        await page.waitForTimeout(3000);
    }
    throw new Error(`could not reduce "${title}" to ${keep}`);
}

/**
 * Concepts a scenario minted for itself, by convention labelled `probe-…`.
 * Counted and removed by SPARQL rather than through the app, because the app
 * may only append to a vocabulary (§5) and deliberately offers no way back.
 */
function countProbeConcepts(frame) {
    return frame.evaluate(() =>
        window
            .spikeSelect(
                `PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
                 SELECT ?c WHERE { GRAPH ?g {
                    ?c a skos:Concept ; skos:prefLabel ?l .
                    FILTER(STRSTARTS(?l, "probe-")) } }`
            )
            .then((r) => r.length)
    );
}

function wipeProbeConcepts(frame) {
    return frame.evaluate(() =>
        window.spikeUpdate(
            `PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
             DELETE { GRAPH ?g { ?c ?p ?o } } WHERE { GRAPH ?g {
                ?c a skos:Concept ; skos:prefLabel ?l ; ?p ?o .
                FILTER(STRSTARTS(?l, "probe-")) } }`,
            undefined
        )
    );
}

/** KEEP=1 leaves what a run created, for looking at it by hand afterwards. */
async function cleanUp(page, frame, title, keep) {
    if (process.env.KEEP) {
        console.log(`(KEEP set: leaving "${title}" behind)`);
        return;
    }
    const left = await deleteDownTo(page, frame, title, keep);
    console.log(`[cleanup] "${title}" back to ${left}`);
}

const step = process.argv[2] ?? "inspect";

const { ctx, page } = await launch();
try {
    if (step === "query") {
        // Ad-hoc SPARQL SELECT inside the logged-in app: node browse.mjs query '<SELECT…>'
        const f = await loginAndGetFrame(page);
        const q = process.argv[3];
        // Retry until the engine has finished its post-login sync.
        for (let i = 0; i < 24; i++) {
            try {
                const rows = await f.evaluate(
                    (query) =>
                        Promise.race([
                            window.spikeSelect(query),
                            new Promise((_, rej) =>
                                setTimeout(() => rej(new Error("slow")), 15000)
                            ),
                        ]),
                    q
                );
                console.log(JSON.stringify(rows, null, 1));
                break;
            } catch (e) {
                console.log(`(retry ${i}: ${e.message})`);
                await page.waitForTimeout(10000);
            }
        }
    } else if (step === "m1") {
        // Milestone 1 end-to-end: seed tags, capture at gYear + day precision,
        // assert collation, edit, verify datatype, delete.
        const f = await loginAndGetFrame(page);

        console.log("=== seed concepts via #/dev ===");
        await f.evaluate(() => (location.hash = "#/dev"));
        await page.waitForTimeout(1000);
        for (const label of ["van-year", "portugal"]) {
            await f.getByPlaceholder("e.g. van-year").fill(label);
            await f.getByRole("button", { name: "append" }).click();
            await page.waitForTimeout(1500);
        }
        console.log("seeded; back to app");
        await f.evaluate(() => (location.hash = "#/"));
        await waitSynced(f);
        // Counted after the archive has rendered: a floor read too early
        // would have this run delete memories it did not create.
        await page.waitForTimeout(2000);
        const vanYearsBefore = await titleCount(f, "The Van Year");

        console.log("=== capture The Van Year (gYear 2019) ===");
        await f.getByLabel("Capture a memory").click();
        await f.getByRole("button", { name: "Year", exact: true }).click();
        await f.locator('input[type="number"]').fill("2019");
        await f.getByPlaceholder("Optional").fill("The Van Year");
        await f.getByPlaceholder("One line, shown in lists").fill(
            "Living in the van"
        );
        await pickTag(f, "van-year");
        await f.getByRole("button", { name: "Save", exact: true }).click();
        await page.waitForTimeout(3000);
        let txt = await f.evaluate(() => document.body.innerText);
        console.log(
            txt.includes("The Van Year") && txt.includes("2019")
                ? "OK: detail shows The Van Year (2019)"
                : `FAIL: detail after save:\n${txt.slice(0, 500)}`
        );

        console.log("=== back to browse; check collation ===");
        await f.getByRole("button", { name: "← back" }).click();
        await waitSynced(f);
        try {
            await f
                .locator("h2", { hasText: "2019" })
                .first()
                .waitFor({ timeout: 60000 });
        } catch {
            await shot(page, "m1-back-fail");
            console.log(
                "[browse state]",
                await f.evaluate(() => document.body.innerText.slice(0, 800))
            );
        }
        const g2019 = await f.evaluate(() => {
            const h = [...document.querySelectorAll("h2")].find(
                (h) => h.textContent.trim() === "2019"
            );
            if (!h) return { error: "no 2019 header" };
            const items = [
                ...h.nextElementSibling.querySelectorAll("li button"),
            ].map((b) =>
                // .font-medium is the title: a row may lead with a cover tile.
                b.querySelector(".font-medium").textContent.trim()
            );
            return { first3: items.slice(0, 3), count: items.length };
        });
        console.log("[2019 group]", JSON.stringify(g2019));
        const headsGroup =
            g2019.first3 &&
            g2019.first3
                .slice(0, 2)
                .some((t) => t === "The Van Year" || t === "sparql-gYear");
        console.log(
            headsGroup
                ? "OK: year-precision memories head the 2019 group (umbrella)"
                : "FAIL: umbrella not at head of 2019 group"
        );

        console.log("=== datatype round-trip ===");
        const dt = await f.evaluate(() =>
            window.spikeSelect(
                `PREFIX schema: <https://schema.org/>
                 SELECT (DATATYPE(?d) AS ?dt) WHERE { GRAPH ?g {
                    ?s schema:name "The Van Year" ; schema:startDate ?d } }`
            )
        );
        const dtVal = dt?.[0]?.dt?.value;
        console.log(
            dtVal === "http://www.w3.org/2001/XMLSchema#gYear"
                ? "OK: startDate stored as xsd:gYear"
                : `FAIL: datatype is ${dtVal}`
        );

        console.log("=== capture + delete a day-precision memory ===");
        await f.getByLabel("Capture a memory").click();
        await f.getByPlaceholder("Optional").fill("M1 day test");
        await f.getByRole("button", { name: "Save", exact: true }).click();
        await page.waitForTimeout(3000);
        await f.getByRole("button", { name: "Delete" }).click();
        await f.getByRole("button", { name: "Really delete" }).click();
        await page.waitForTimeout(3000);
        txt = await f.evaluate(() => document.body.innerText);
        console.log(
            !txt.includes("M1 day test")
                ? "OK: deleted memory gone from browse"
                : "FAIL: deleted memory still visible"
        );
        await shot(page, "m1-browse");
        await cleanUp(page, f, "The Van Year", vanYearsBefore);
    } else if (step === "m2") {
        // Milestone 2 end-to-end: a memory dated inside the fixture corpus
        // picks up photographs by overlap, opens one, attaches it, and
        // suppresses another — the §3.9 "no" that must never be re-proposed.
        const f = await loginAndGetFrame(page);
        await settle(f);

        await waitSynced(f);
        await page.waitForTimeout(2000);
        const testsBefore = await titleCount(f, "M2 media test");

        console.log("=== capture a memory on 2019-08-14 ===");
        await f.getByLabel("Capture a memory").click();
        await f.locator('input[type="date"]').fill("2019-08-14");
        await f.getByPlaceholder("Optional").fill("M2 media test");
        await f.getByRole("button", { name: "Save", exact: true }).click();
        await f
            .locator("h2", { hasText: "Photographs" })
            .waitFor({ timeout: 120000 });

        const counts = async () => {
            const t = await f.evaluate(() => document.body.innerText);
            const m = t.match(/(\d+) attached · (\d+) by overlap/);
            return m ? { attached: +m[1], overlap: +m[2] } : undefined;
        };
        let c = await counts();
        console.log("[strip]", JSON.stringify(c));
        console.log(
            c && c.attached === 0 && c.overlap > 0
                ? "OK: photographs associated by time overlap alone"
                : "FAIL: no derived association"
        );

        console.log("=== the grid, scoped to this memory ===");
        await f.getByRole("button", { name: "see all" }).click();
        await f
            .getByText("Photographs of this memory")
            .waitFor({ timeout: 60000 });
        const gridCount = await f.evaluate(
            () => document.querySelectorAll(".grid button").length
        );
        console.log(`[grid] ${gridCount} tiles`);
        await shot(page, "m2-grid");
        await f.getByRole("button", { name: "← back" }).click();

        console.log("=== open one, attach it ===");
        await f.locator("section .w-24 button").first().click();
        // Exact: the paragraph below the metadata says "document" too.
        await f
            .getByText("Document", { exact: true })
            .waitFor({ timeout: 60000 });
        const detail = await f.evaluate(() => document.body.innerText);
        console.log(
            detail.includes("Taken") && detail.includes("did:ng:o:")
                ? "OK: foreign metadata shown read-only"
                : "FAIL: media detail missing metadata"
        );
        await shot(page, "m2-media-detail");
        await f.getByRole("button", { name: "Attach to this memory" }).click();
        await page.waitForTimeout(2000);
        await f.getByRole("button", { name: "← back" }).click();
        await page.waitForTimeout(2000);
        c = await counts();
        console.log("[strip after attach]", JSON.stringify(c));
        console.log(
            c && c.attached === 1
                ? "OK: explicit attachment recorded on the memory"
                : "FAIL: attachment not reflected"
        );

        console.log("=== suppress a derived association ===");
        const before = c.overlap;
        await f.locator("section .w-24 button").nth(1).click();
        await f
            .getByRole("button", { name: "Not from this memory" })
            .click({ timeout: 60000 });
        await page.waitForTimeout(2000);
        c = await counts();
        console.log("[strip after suppression]", JSON.stringify(c));
        console.log(
            c && c.overlap === before - 1
                ? "OK: rejection removed it from the derived set"
                : `FAIL: overlap went ${before} → ${c?.overlap}`
        );

        console.log("=== does the rejection survive a reload? ===");
        await f.evaluate(() => location.reload());
        await page.waitForTimeout(8000);
        const f2 = page
            .frames()
            .find((fr) => fr.url().startsWith("http://localhost:4567"));
        await waitSynced(f2);
        await f2.locator("h2", { hasText: "Photographs" }).waitFor({
            timeout: 120000,
        });
        const t = await f2.evaluate(() => document.body.innerText);
        const m = t.match(/(\d+) attached · (\d+) by overlap/);
        console.log("[strip after reload]", m?.[0]);
        console.log(
            m && +m[2] === c.overlap && +m[1] === 1
                ? "OK: attachment and rejection both persisted"
                : "FAIL: state did not survive the reload"
        );
        console.log("=== attach an exception through the editor picker ===");
        await f2.getByRole("button", { name: "Edit" }).click();
        await f2
            .getByRole("button", { name: "Attach another photograph…" })
            .click({ timeout: 60000 });
        await f2.locator(".border.rounded button").first().click();
        await f2.getByRole("button", { name: "Save", exact: true }).click();
        await page.waitForTimeout(4000);
        const after = (await f2.evaluate(() => document.body.innerText)).match(
            /(\d+) attached · (\d+) by overlap/
        );
        console.log("[strip after picker]", after?.[0]);
        console.log(
            after && +after[1] === 2
                ? "OK: a photograph outside the span attached from the editor"
                : "FAIL: picker attachment not recorded"
        );
        await shot(page, "m2-strip");
        await cleanUp(page, f2, "M2 media test", testsBefore);
    } else if (step === "m3") {
        // Milestone 3 end-to-end: claim a location through the picker, read it
        // back on the memory, filter the archive by it, and bulk-tag a
        // selection. Everything this run creates, it deletes on the way out.
        const f = await loginAndGetFrame(page);
        await waitSynced(f);
        await page.waitForTimeout(2000);
        const TITLE = "M3 place test";
        // Idempotent: a run that crashes before its cleanup leaves a memory
        // behind, and the orphan check below then counts two places and calls
        // it a regression. Start from nothing, as m6 does.
        if (await titleCount(f, TITLE)) {
            const left = await deleteDownTo(page, f, TITLE, 0);
            console.log(`[pre-clean] "${TITLE}" left over from before, now ${left}`);
        }
        const before = await titleCount(f, TITLE);

        console.log("=== capture a memory with a dropped pin ===");
        await f.getByLabel("Capture a memory").click();
        await f.getByPlaceholder("Optional").fill(TITLE);
        await f.getByRole("button", { name: "+ add a location" }).click();
        await f
            .getByPlaceholder("What you call it (optional)")
            .fill("the beach below the road", { timeout: 60000 });
        await f.getByPlaceholder("Latitude").fill("38.68");
        await f.getByPlaceholder("Longitude").fill("-9.33");
        await f.getByRole("button", { name: "Use these coordinates" }).click();
        // Back in the editor, with everything typed into it still there: the
        // shell keeps the stack mounted so a picker can hand a value back.
        const inEditor = await f.evaluate(
            () =>
                document.querySelector('input[placeholder="Optional"]')?.value
        );
        console.log(
            inEditor === TITLE
                ? "OK: the editor survived the picker"
                : `FAIL: the editor lost its state (title now ${JSON.stringify(inEditor)})`
        );
        const chip = await f.evaluate(() =>
            document.body.innerText.includes("the beach below the road")
        );
        console.log(
            chip
                ? "OK: the dropped pin came back as a location"
                : "FAIL: no location in the editor"
        );
        await f.getByRole("button", { name: "Save", exact: true }).click();
        await page.waitForTimeout(4000);

        console.log("=== the memory shows what it claims ===");
        let txt = await f.evaluate(() => document.body.innerText);
        console.log(
            txt.includes("the beach below the road")
                ? "OK: S-20 resolves the location by joining on the IRI"
                : `FAIL: no location on the detail screen:\n${txt.slice(0, 400)}`
        );

        console.log("=== both forms of coordinates were written ===");
        const coords = await f.evaluate(() =>
            window.spikeSelect(
                `PREFIX schema: <https://schema.org/>
                 PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
                 SELECT ?lat ?glat WHERE { GRAPH ?g {
                    ?p schema:name "the beach below the road" ;
                       geo:lat ?lat ;
                       schema:geo ?geo .
                    ?geo schema:latitude ?glat } }`
            )
        );
        const row = coords?.[0];
        console.log(
            row?.lat?.value === "38.68" && row?.glat?.value === "38.68"
                ? "OK: flat pair and schema:geo agree"
                : `FAIL: coordinates written as ${JSON.stringify(coords)}`
        );
        console.log(
            row?.lat?.datatype?.endsWith("#decimal")
                ? "OK: coordinates kept their xsd:decimal datatype"
                : `FAIL: datatype is ${row?.lat?.datatype}`
        );

        console.log("=== edit the memory: the location must survive ===");
        // Rewriting a memory drops and re-mints its unnamed places, so this is
        // the path where a location silently becomes 0,0 if the editor
        // initialises before the place subscription has answered (§8).
        await f.getByRole("button", { name: "Edit" }).click();
        await f
            .getByPlaceholder("One line, shown in lists")
            .fill("edited once", { timeout: 60000 });
        await f.getByRole("button", { name: "Save", exact: true }).click();
        await page.waitForTimeout(4000);
        txt = await f.evaluate(() => document.body.innerText);
        console.log(
            txt.includes("the beach below the road") && txt.includes("edited once")
                ? "OK: the location survived an edit"
                : `FAIL: after editing:\n${txt.slice(0, 400)}`
        );
        const afterEdit = await f.evaluate(() =>
            window.spikeSelect(
                `PREFIX schema: <https://schema.org/>
                 PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
                 SELECT ?p ?lat WHERE { GRAPH ?g {
                    ?p schema:name "the beach below the road" ; geo:lat ?lat } }`
            )
        );
        console.log(
            afterEdit?.length === 1 && afterEdit[0].lat.value === "38.68"
                ? "OK: one place, coordinates intact, no orphan left behind"
                : `FAIL: after the rewrite ${JSON.stringify(afterEdit)}`
        );

        console.log("=== filter the archive down to nothing, and be told why ===");
        await f.getByRole("button", { name: "← back" }).click();
        await waitSynced(f);
        await f.getByRole("button", { name: /^Filter/ }).click();
        await f.getByLabel("has photographs").check();
        // The filter bar's picker is the first on the screen.
        await pickTag(f, "van-year", "first");
        await page.waitForTimeout(1500);
        txt = await f.evaluate(() => document.body.innerText);
        const narrowed = txt.match(/(\d+) of (\d+) memories/);
        console.log(
            "[counts]",
            narrowed?.[0],
            narrowed && +narrowed[1] < +narrowed[2]
                ? "OK: the filter narrowed the archive"
                : "FAIL: the filter bar changed nothing"
        );

        // A date range with nothing in it: the empty state must name the facet
        // most likely responsible and offer to drop it (§8).
        await f.getByRole("button", { name: "any date", exact: true })
            .first()
            .click();
        await f.getByRole("button", { name: "any date", exact: true })
            .first()
            .click();
        for (const i of [0, 1])
            await f.locator('input[type="number"]').nth(i).fill("2000");
        await page.waitForTimeout(2000);
        txt = await f.evaluate(() => document.body.innerText);
        console.log(
            /is the narrowest part of this filter/.test(txt)
                ? "OK: an empty result names the facet to blame (§8)"
                : `FAIL: no blame line:\n${txt.slice(0, 400)}`
        );
        await f.getByRole("button", { name: "Drop it" }).click();
        await page.waitForTimeout(2000);
        txt = await f.evaluate(() => document.body.innerText);
        console.log(
            !/is the narrowest part of this filter/.test(txt)
                ? "OK: dropping the facet brought the memories back"
                : "FAIL: dropping the facet changed nothing"
        );
        await f.getByRole("button", { name: "Clear the filter" }).click();
        await page.waitForTimeout(1500);

        console.log("=== select and bulk-tag ===");
        await f.getByRole("button", { name: "Select", exact: true }).click();
        await f.evaluate((t) => {
            const rows = [...document.querySelectorAll("li button")].filter(
                (b) => b.querySelector(".font-medium")?.textContent.trim() === t
            );
            rows[0].click();
        }, TITLE);
        await page.waitForTimeout(500);
        await f.getByRole("button", { name: "Tag these" }).click();
        await pickTag(f, "portugal");
        console.log(
            "[selection]",
            await f.evaluate(
                () =>
                    document
                        .querySelector(".sticky.top-0.z-10")
                        ?.innerText.split("\n")[0] ?? "(no selection bar)"
            )
        );
        await f.getByRole("button", { name: /^Add to 1$/ }).click();
        await page.waitForTimeout(4000);
        const tagged = await f.evaluate(
            (t) =>
                window.spikeSelect(
                    `PREFIX schema: <https://schema.org/>
                     PREFIX dcterms: <http://purl.org/dc/terms/>
                     PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
                     SELECT ?label WHERE {
                        GRAPH ?g { ?m schema:name "${t}" ; dcterms:subject ?c }
                        GRAPH ?h { ?c skos:prefLabel ?label } }`
                ),
            TITLE
        );
        console.log(
            tagged?.some((r) => r.label?.value === "portugal")
                ? "OK: the bulk action tagged the selection"
                : `FAIL: tags now ${JSON.stringify(tagged)}`
        );
        await shot(page, "m3-browse");
        await cleanUp(page, f, TITLE, before);
    } else if (step === "headers") {
        const f = await loginAndGetFrame(page);
        await waitSynced(f);
        await page.waitForTimeout(2000);
        const headers = await f.evaluate(() =>
            [...document.querySelectorAll("h2")].map((h) =>
                h.textContent.trim()
            )
        );
        console.log("[headers]", JSON.stringify(headers));
    } else if (step === "inspect") {
        await page.goto(AUTH_URL, { waitUntil: "networkidle" });
        await page.waitForTimeout(2000);
        await shot(page, "01-auth");
        await dump(page);
    } else if (step === "login") {
        // Start from the app: init() redirects top-level to the wallet page.
        await page.goto("http://localhost:4567/", { waitUntil: "networkidle" });
        await page.waitForTimeout(3000);

        // Known-wallet fast path: a button named user5.
        const known = page.getByRole("button", { name: "user5", exact: true });
        if (await known.count()) {
            await known.click();
            await page.waitForTimeout(1500);
        } else if (await page.$("#import_wallet_file")) {
            await page.setInputFiles("#import_wallet_file", WALLET_FILE);
            await page.waitForTimeout(2500);
        }
        const pw = await page.$("#password-input");
        if (pw) {
            await pw.fill("secret");
            await page.getByRole("button", { name: "Confirm" }).click();
        }
        await page.waitForTimeout(10000);
        await shot(page, "03-after-login");
        console.log(
            "[frames]",
            page.frames().map((f) => f.url())
        );
        const appFrame = page
            .frames()
            .find((f) => f.url().startsWith("http://localhost:4567"));
        if (appFrame) {
            console.log(
                "[app iframe text]",
                await appFrame.evaluate(() =>
                    document.body.innerText.slice(0, 2000)
                )
            );
        } else {
            console.log("[app iframe] NOT FOUND");
            const iframes = await page.evaluate(() =>
                [...document.querySelectorAll("iframe")].map((f) => ({
                    src: f.src,
                    sandbox: f.getAttribute("sandbox"),
                    allow: f.getAttribute("allow"),
                }))
            );
            console.log("[iframe elements]", JSON.stringify(iframes, null, 1));
            await dump(page);
        }
    } else if (step === "spike1") {
        const f = await loginAndGetFrame(page);
        console.log("=== creating 10 docs ===");
        await click(f, "create 10 docs");
        await waitForLog(f, "created 10 memory docs");
        console.log("=== enumerate ===");
        await click(f, "enumerate");
        await waitForLog(f, "enumerated");
        console.log("=== subscribe wildcard did:ng:i ===");
        await click(f, "subscribe did:ng:i");
        await waitForLog(f, "subscription ready", 30000).catch((e) =>
            console.log("(no ready signal)", e.message)
        );
        await page.waitForTimeout(3000);
        console.log("[after wildcard]", await f.evaluate(() => document.body.innerText.slice(0, 1200)));
        console.log("=== +1 doc while subscribed ===");
        await click(f, "+1 doc while subscribed");
        await page.waitForTimeout(4000);
        console.log("[after +1]", await f.evaluate(() => document.body.innerText.slice(0, 1500)));
        console.log("=== subscribe explicit list ===");
        await click(f, "unsubscribe");
        await page.waitForTimeout(500);
        await click(f, "enumerate");
        await waitForLog(f, "enumerated 1");
        await click(f, "subscribe explicit list");
        await page.waitForTimeout(4000);
        console.log("[after explicit]", await f.evaluate(() => document.body.innerText.slice(0, 1500)));
        await shot(page, "spike1");
    } else if (step === "spike1big") {
        const f = await loginAndGetFrame(page);
        for (let i = 0; i < 4; i++) {
            console.log(`=== creating 50 docs (batch ${i + 1}/4) ===`);
            await click(f, "create 50 docs");
            await waitForLog(f, `created 50 memory docs`, 300000);
            // log accumulates; wait for the i+1-th occurrence
            const log = await readLog(f);
            const n = (log.match(/created 50 memory docs/g) || []).length;
            if (n <= i) await page.waitForTimeout(2000);
        }
        await click(f, "enumerate");
        await waitForLog(f, "enumerated 2");
        console.log("=== subscribe wildcard over ~200 docs ===");
        await click(f, "subscribe did:ng:i");
        await page.waitForTimeout(8000);
        console.log("[result]", await readLog(f));
        console.log(
            "[count]",
            await f.evaluate(() => document.querySelector(".font-mono")?.innerText)
        );
        await shot(page, "spike1big");
    } else if (step === "spike2") {
        const f = await loginAndGetFrame(page);
        await f.getByRole("tab", { name: "2 · dates" }).click();
        await page.waitForTimeout(2000);
        await click(f, "insert 4 typed via SPARQL");
        await waitForLog(f, "check the live list");
        await page.waitForTimeout(3000);
        await click(f, "insert via ORM + inspect");
        await waitForLog(f, "stored:", 30000);
        await page.waitForTimeout(2000);
        console.log("[log]", await readLog(f));
        console.log("[body]", await f.evaluate(() => document.body.innerText.slice(0, 2500)));
        await shot(page, "spike2");
    } else if (step === "spike2check") {
        const f = await loginAndGetFrame(page);
        await f.getByRole("tab", { name: "2 · dates" }).click();
        await page.waitForTimeout(90000);
        const body = await f.evaluate(() => document.body.innerText);
        for (const n of [
            "sparql-dateTime",
            "sparql-date",
            "sparql-gYearMonth",
            "sparql-gYear",
            "orm-written",
        ]) {
            const m = body.match(new RegExp(`${n}[^\\n]*`));
            console.log(m ? `IN LIVE LIST: ${m[0]}` : `MISSING: ${n}`);
        }
        console.log(
            "[count line]",
            body.match(/live memories: \d+/)?.[0]
        );
    } else if (step === "spike4") {
        const f = await loginAndGetFrame(page);
        await f.getByRole("tab", { name: "4 · nested" }).click();
        await page.waitForTimeout(90000);
        await click(f, "insert memory w/ nested loc+person");
        await waitForLog(f, "inserted memory", 120000);
        await page.waitForTimeout(3000);
        console.log("[log]", await readLog(f));
        console.log("[body]", await f.evaluate(() => document.body.innerText.slice(0, 2500)));
        await shot(page, "spike4");
    } else if (step === "spike4del") {
        const f = await loginAndGetFrame(page);
        await f.getByRole("tab", { name: "4 · nested" }).click();
        await f
            .getByRole("button", { name: "del loc" })
            .waitFor({ timeout: 180000 });
        console.log(
            "[nested-test row]",
            await f.evaluate(
                () =>
                    [...document.querySelectorAll("li")]
                        .map((li) => li.innerText)
                        .find((t) => t.includes("nested-test")) ?? "(not found)"
            )
        );
        await click(f, "del loc");
        await page.waitForTimeout(2000);
        await click(f, "triples");
        await page.waitForTimeout(2000);
        console.log("[log]", await readLog(f));
        await shot(page, "spike4del");
    } else if (step === "spike3") {
        const f = await loginAndGetFrame(page);
        await f.getByRole("tab", { name: "3 · media" }).click();
        await page.waitForTimeout(2000);
        await click(f, '1 · upload as "camera app"');
        await waitForLog(f, "AddFile ok", 60000).catch(async (e) => {
            console.log("(upload issue)", e.message);
        });
        console.log("[log after upload]", await readLog(f));
        await click(f, "2 · write RDF descriptor");
        await page.waitForTimeout(2000);
        await click(f, "3 · file_get → display");
        await waitForLog(f, "blob URL created", 30000).catch((e) =>
            console.log("(display issue)", e.message)
        );
        await click(f, "4 · time-overlap query");
        await page.waitForTimeout(2000);
        console.log("[log]", await readLog(f));
        const imgOk = await f.evaluate(() => {
            const img = document.querySelector("img");
            return img ? { w: img.naturalWidth, h: img.naturalHeight } : null;
        });
        console.log("[img naturalSize]", JSON.stringify(imgOk));
        await shot(page, "spike3");
    } else if (step === "spike5") {
        // The rejections JSON document (§3.9): findability, key encoding,
        // round trip, two subscriptions, bulk cost.
        const f = await loginAndGetFrame(page);
        await f.evaluate(() => (location.hash = "#/dev"));
        await page.waitForTimeout(1000);
        await f.getByRole("tab", { name: "5 · json doc" }).click();
        await settle(f);
        const steps = [
            ["1 · create + tag", "doc_create(Automerge"],
            ["2 · find by SPARQL", "SPARQL found"],
            ["3 · subscribe", "subscribed;"],
            ["4 · write rejections", "wrote rejections"],
            ["5 · append to a key", "after append:"],
            ["6 · reopen", "reopened in"],
            ["7 · two subscriptions", "pooled to the same object"],
            ["8 · 200 entries", "one transaction:"],
        ];
        for (const [label, needle] of steps) {
            await click(f, label);
            await waitForLog(f, needle, 120000).catch((e) =>
                console.log(`(${label}: ${e.message})`)
            );
            await page.waitForTimeout(500);
        }
        console.log("[log]\n" + (await readLog(f)));
        await shot(page, "spike5");
    } else if (step === "spike5verify") {
        // Re-read the existing rejections document in a fresh session: does the
        // bulk write survive a reload, not just a re-subscription?
        const f = await loginAndGetFrame(page);
        await f.evaluate(() => (location.hash = "#/dev"));
        await page.waitForTimeout(1000);
        await f.getByRole("tab", { name: "5 · json doc" }).click();
        await settle(f);
        await click(f, "2 · find by SPARQL");
        await waitForLog(f, "SPARQL found", 60000);
        await click(f, "3 · subscribe");
        await waitForLog(f, "subscribed;", 60000);
        const state = await f.evaluate(() =>
            document.querySelector("pre").innerText
        );
        const m = state.match(/subscribed; signalObject = (\{.*)/);
        if (m) {
            const doc = JSON.parse(m[1].replace(/ in \d+ ms$/, ""));
            console.log(
                "[persisted] bulk keys:",
                Object.keys(doc.bulk ?? {}).length,
                "| suppressedMedia keys:",
                Object.keys(doc.suppressedMedia ?? {}).length,
                "| dismissedGroupings:",
                (doc.dismissedGroupings ?? []).length
            );
        } else {
            console.log("[persisted] could not parse:\n" + state);
        }
    } else if (step === "screen") {
        // node browse.mjs screen '#/' name — look at one screen.
        const f = await loginAndGetFrame(page);
        await settle(f);
        const hash = process.argv[3] ?? "#/";
        await f.evaluate((h) => (location.hash = h), hash);
        await page.waitForTimeout(6000);
        await shot(page, process.argv[4] ?? "screen");
        // Long screens: the interesting part is often below the fold.
        await f.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
        await shot(page, `${process.argv[4] ?? "screen"}-bottom`);
        console.log(
            "[text]",
            await f.evaluate(() => document.body.innerText.slice(0, 4000))
        );
    } else if (step === "spike7") {
        // One predicate, two kinds of value: does a cross-document reference
        // survive the ORM, and can the two branches be told apart?
        const f = await loginAndGetFrame(page);
        await f.evaluate(() => (location.hash = "#/dev"));
        await page.waitForTimeout(1000);
        await f.getByRole("tab", { name: "7 · locations" }).click();
        await settle(f);
        await click(f, "1 · place + person docs");
        await waitForLog(f, "place + person documents", 120000);
        await click(f, "2 · memory with both");
        await waitForLog(f, "memory with both kinds", 120000);
        await page.waitForTimeout(6000);
        await click(f, "3 · what the ORM returns");
        await page.waitForTimeout(2000);
        await click(f, "3b · read as plain IRIs");
        await page.waitForTimeout(2000);
        await click(f, "4 · add a reference via ORM");
        await page.waitForTimeout(4000);
        await click(f, "3 · what the ORM returns");
        await page.waitForTimeout(2000);
        await click(f, "4b · nested via ORM");
        await page.waitForTimeout(5000);
        await click(f, "3 · what the ORM returns");
        await page.waitForTimeout(2000);
        await click(f, "4c · join by hand");
        await page.waitForTimeout(2000);
        console.log("[log]\n" + (await readLog(f)));
        if (!process.env.KEEP) {
            await click(f, "5 · clean up");
            await page.waitForTimeout(3000);
            console.log("[cleanup] spike documents emptied");
        }
    } else if (step === "m4") {
        // Milestone 4 end-to-end: name people in memories, see them gathered,
        // promote a bare name in one update, and filter by who was there.
        const f = await loginAndGetFrame(page);
        await waitSynced(f);
        await page.waitForTimeout(2000);
        const TITLES = ["M4 people test A", "M4 people test B"];
        const before = [
            await titleCount(f, TITLES[0]),
            await titleCount(f, TITLES[1]),
        ];

        console.log("=== two memories naming the same person ===");
        for (const title of TITLES) {
            await f.getByLabel("Capture a memory").click();
            await f
                .getByPlaceholder("Optional")
                .fill(title, { timeout: 60000 });
            await f
                .getByPlaceholder("A name, or someone you know")
                .fill("Ana Spike");
            await f.getByRole("button", { name: "add", exact: true }).click();
            await f.getByRole("button", { name: "Save", exact: true }).click();
            await page.waitForTimeout(3500);
            const txt = await f.evaluate(() => document.body.innerText);
            console.log(
                txt.includes("Ana Spike")
                    ? `OK: ${title} names her`
                    : `FAIL: no attendee on ${title}`
            );
            await f.getByRole("button", { name: "← back" }).click();
            await page.waitForTimeout(1500);
        }

        console.log("=== the People tab gathers the name ===");
        await f.evaluate(() => (location.hash = "#/people"));
        await page.waitForTimeout(3000);
        let txt = await f.evaluate(() => document.body.innerText);
        console.log(
            /Names in your memories[\s\S]*Ana Spike[\s\S]*2 memories/.test(txt)
                ? "OK: one person, two memories, listed as a bare name"
                : `FAIL: people screen shows:\n${txt.slice(0, 500)}`
        );

        console.log("=== promote in one update (§3.3, spike 8) ===");
        await f.getByRole("button", { name: "someone I know" }).first().click();
        await page.waitForTimeout(5000);
        const promoted = await f.evaluate(() =>
            window.spikeSelect(
                `PREFIX schema: <https://schema.org/>
                 PREFIX foaf: <http://xmlns.com/foaf/0.1/>
                 SELECT ?mem ?contact ?g WHERE {
                    GRAPH ?mem { ?m schema:name ?n ; schema:attendee ?contact .
                                 FILTER(STRSTARTS(?n, "M4 people test")) }
                    GRAPH ?g { ?contact foaf:name "Ana Spike" } }`
            )
        );
        const contacts = new Set(
            (promoted ?? []).map((r) => r.contact.value)
        );
        console.log(
            promoted?.length === 2 && contacts.size === 1
                ? "OK: both memories point at one contact record"
                : `FAIL: promotion left ${JSON.stringify(promoted)}`
        );
        const contactIri = [...contacts][0];
        const stragglers = await f.evaluate(
            (iri) =>
                window.spikeSelect(
                    `PREFIX schema: <https://schema.org/>
                     PREFIX foaf: <http://xmlns.com/foaf/0.1/>
                     SELECT ?p WHERE { GRAPH ?mem {
                        ?m schema:name ?n ; schema:attendee ?p .
                        ?p a foaf:Person .
                        FILTER(STRSTARTS(?n, "M4 people test")) } }`
                ),
            contactIri
        );
        console.log(
            (stragglers ?? []).length === 0
                ? "OK: no bare name left behind in any memory"
                : `FAIL: bare names survive: ${JSON.stringify(stragglers)}`
        );

        console.log("=== her page, and the person facet ===");
        await f.evaluate(() => (location.hash = "#/people"));
        await page.waitForTimeout(2500);
        await f.getByRole("button", { name: /Ana Spike/ }).first().click();
        await page.waitForTimeout(2500);
        txt = await f.evaluate(() => document.body.innerText);
        console.log(
            txt.includes("2 memories")
                ? "OK: S-61 shows every memory with her"
                : `FAIL: person detail:\n${txt.slice(0, 400)}`
        );
        await f.getByRole("button", { name: "In time" }).click();
        await page.waitForTimeout(2500);
        txt = await f.evaluate(() => document.body.innerText);
        const rows = await titleCount(f, TITLES[0]);
        console.log(
            rows >= 1 && !txt.includes("Nothing matches")
                ? "OK: the browse filter is pinned to her"
                : `FAIL: filtered browse:\n${txt.slice(0, 400)}`
        );

        console.log("=== here & now renders without a location ===");
        await f.evaluate(() => (location.hash = "#/here"));
        await page.waitForTimeout(4000);
        txt = await f.evaluate(() => document.body.innerText);
        console.log(
            txt.includes("Capture a memory") && !txt.includes("undefined")
                ? "OK: S-01 falls back rather than blanking (§8)"
                : `FAIL: here & now:\n${txt.slice(0, 400)}`
        );
        await shot(page, "m4-people");

        if (!process.env.KEEP) {
            // The filter is pinned to her; cleanup counts rows, so drop it.
            await f.evaluate(() => (location.hash = "#/"));
            await page.waitForTimeout(1500);
            await f
                .getByRole("button", { name: /^Filter/ })
                .click()
                .catch(() => {});
            await f
                .getByRole("button", { name: "Clear the filter" })
                .click()
                .catch(() => {});
            await page.waitForTimeout(1500);
            for (let i = 0; i < TITLES.length; i++)
                await cleanUp(page, f, TITLES[i], before[i]);
            // The contact has no delete in P0 — this run wrote it, so this run
            // removes it, through the debug hook rather than a fake screen.
            if (contactIri) {
                await f.evaluate(
                    (iri) =>
                        window.spikeUpdate(
                            `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
                             DELETE WHERE { GRAPH ?g { <${iri}> ?p ?o } } ;
                             DELETE WHERE { GRAPH ?g { ?s foaf:member <${iri}> } }`
                        ),
                    contactIri
                );
                console.log("[cleanup] contact record removed");
            }
        }
    } else if (step === "spike8") {
        // B-06: what a write across many documents costs, what a partial
        // failure leaves behind, and what a reader sees mid-rewrite.
        const f = await loginAndGetFrame(page);
        await f.evaluate(() => (location.hash = "#/dev"));
        await page.waitForTimeout(1000);
        await f.getByRole("tab", { name: "8 · promotion" }).click();
        await settle(f);
        const n = process.argv[3] ?? "20";
        await f.locator('input[type="number"]').fill(n);
        const steps = [
            ["1 · seed memories", "seeded "],
            ["2 · contact doc", "contact document:"],
            ["3 · one update, many graphs", "nuri = undefined"],
            ["4 · promote in sequence", "reader saw"],
            ["5 · promote together", "concurrent:"],
            ["6 · fail in the middle", "→ "],
            ["7 · all in one update", "after it returned:"],
            ["8 · one bad graph among many", "of the two real documents"],
        ];
        for (const [label, needle] of steps) {
            await click(f, label);
            await waitForLog(f, needle, 300000).catch((e) =>
                console.log(`(${label}: ${e.message})`)
            );
            await page.waitForTimeout(500);
        }
        console.log("[log]\n" + (await readLog(f)));
        await shot(page, "spike8");
        if (!process.env.KEEP) {
            await click(f, "9 · clean up");
            await waitForLog(f, "deleted ", 300000).catch(() => {});
            console.log("[cleanup]", (await readLog(f)).split("\n").pop());
        }
    } else if (step === "cleanup") {
        // node browse.mjs cleanup "<title>" [keep] — remove residue left by
        // earlier runs, through the app's own delete.
        const f = await loginAndGetFrame(page);
        await settle(f);
        await waitSynced(f);
        const title = process.argv[3];
        const keep = Number(process.argv[4] ?? 1);
        console.log(`[before] ${await titleCount(f, title)} × "${title}"`);
        const left = await deleteDownTo(page, f, title, keep);
        console.log(`[after] ${left} × "${title}"`);
    } else if (step === "devview") {
        // The developer view must be reachable from inside the wallet iframe
        // in a preview build, where neither the URL nor a build flag helps.
        const f = await loginAndGetFrame(page);
        await settle(f);
        await f.evaluate(() => (location.hash = "#/visible"));
        await page.waitForTimeout(5000);
        const before = await f.evaluate(() => document.body.innerText);
        console.log(
            before.includes("Developer view —")
                ? "OK: the switch is present in a preview build"
                : "FAIL: no switch"
        );
        console.log(
            before.includes("looks for and does not find")
                ? "FAIL: annotations shown before the switch was turned on"
                : "OK: annotations hidden by default"
        );
        await f.locator('input[type="checkbox"]').first().click();
        await page.waitForTimeout(1500);
        const after = await f.evaluate(() => document.body.innerText);
        console.log(
            after.includes("looks for and does not find") &&
                after.includes("B-01")
                ? "OK: switching it on reveals the shapes and the borrowings"
                : "FAIL: annotations did not appear"
        );
        await shot(page, "devview-on");
        // And it must survive the reload, or it is useless in an iframe.
        await f.evaluate(() => location.reload());
        await page.waitForTimeout(10000);
        const f2 = page
            .frames()
            .find((fr) => fr.url().startsWith("http://localhost:4567"));
        await settle(f2);
        await f2.evaluate(() => (location.hash = "#/visible"));
        await page.waitForTimeout(5000);
        const reloaded = await f2.evaluate(() => document.body.innerText);
        console.log(
            reloaded.includes("looks for and does not find")
                ? "OK: the choice persisted across a reload"
                : "FAIL: the choice did not persist"
        );
        // The media tiles carry the same annotation.
        await f2.evaluate(() => (location.hash = "#/media"));
        await page.waitForTimeout(6000);
        const grid = await f2.evaluate(() => document.body.innerText);
        console.log(
            grid.includes("no thumbnail")
                ? "OK: unpicturable media marked in place"
                : "FAIL: tiles not marked"
        );
        await shot(page, "devview-grid");
    } else if (step === "backfill") {
        // One-off: add schema:Event to memories written before it was
        // asserted (§3, §3.6). Adds triples only.
        const f = await loginAndGetFrame(page);
        await f.evaluate(() => (location.hash = "#/dev"));
        await page.waitForTimeout(1000);
        await f.getByRole("tab", { name: "backfill" }).click();
        await settle(f);
        await click(f, "1 · how many are untyped");
        await waitForLog(f, "memories are not typed", 60000).catch(() =>
            console.log("(nothing to do)")
        );
        await click(f, "2 · backfill");
        await waitForLog(f, "done —", 300000).catch((e) =>
            console.log(`(backfill: ${e.message})`)
        );
        console.log("[log]\n" + (await readLog(f)));
    } else if (step === "seed-clips") {
        // One video and one audio document, so the non-image rendering paths
        // are exercised by media the fixture actually recorded.
        const f = await loginAndGetFrame(page);
        await f.evaluate(() => (location.hash = "#/dev"));
        await page.waitForTimeout(1000);
        await f.getByRole("tab", { name: "6 · thumbnails" }).click();
        await settle(f);
        await click(f, "1b · seed a clip of each kind");
        await waitForLog(f, "seeded a audio document", 300000);
        console.log("[log]\n" + (await readLog(f)));
    } else if (step === "m5") {
        // Milestone 5: the Space projection exists, draws the three layers the
        // filter selects, and says what it cannot place (§8).
        const f = await loginAndGetFrame(page);
        await waitSynced(f);
        await settle(f);

        await f.evaluate(() => (location.hash = "#/space"));
        await page.waitForTimeout(6000);
        // The canvas is the only proof WebGL came up; the legend is the proof
        // that the store reached it.
        const canvas = await f.evaluate(() => {
            const c = document.querySelector("canvas.maplibregl-canvas");
            return c ? { w: c.width, h: c.height } : null;
        });
        if (!canvas?.w) throw new Error("no map canvas rendered");
        console.log(`OK: the map came up (${canvas.w}x${canvas.h})`);

        const legend = await f.evaluate(() => document.body.innerText);
        const counts = {
            memories: +(legend.match(/(\d+) memories/)?.[1] ?? -1),
            media: +(legend.match(/(\d+) photographs/)?.[1] ?? -1),
            tracks: +(legend.match(/(\d+) tracks/)?.[1] ?? 0),
        };
        console.log("[legend]", JSON.stringify(counts));
        if (counts.media < 1)
            throw new Error("no photographs plotted — seed-media first");
        console.log("OK: media, memories and tracks reached the map");
        await shot(page, "m5-space");

        // §6.2's scrubber is bound to the filter, not to a state of its own:
        // moving it has to show up in the shell's date facet.
        const bounds = await f.evaluate(() => {
            const i = document.querySelector('input[aria-label="From year"]');
            return i ? { min: i.min, max: i.max } : null;
        });
        if (!bounds) throw new Error("no time scrubber");
        const openFilter = async () => {
            const up = await f.evaluate(() =>
                document.body.innerText.includes("Tags match")
            );
            if (!up)
                await f.getByRole("button", { name: /^Filter/ }).click();
        };
        await f.getByLabel("From year").fill(bounds.max);
        await page.waitForTimeout(2500);
        await openFilter();
        const shown = await f
            .locator('input[type="number"]')
            .first()
            .inputValue();
        console.log(
            shown === bounds.max
                ? `OK: the scrubber moves the filter itself (from ${shown})`
                : `FAIL: scrubber set ${bounds.max}, filter says ${shown}`
        );
        await f.getByRole("button", { name: "Clear the filter" }).click();
        await page.waitForTimeout(3000);

        const before = counts.media;
        // The map and the shell have to agree about what is being browsed: a
        // filter that matches nothing replaces the projection with §8's blame
        // state, and dropping the facet brings the map back.
        await openFilter();
        await f
            .getByRole("button", { name: "any date", exact: true })
            .first()
            .click();
        await f.locator('input[type="number"]').first().fill("2030");
        await page.waitForTimeout(3000);
        let txt = await f.evaluate(() => document.body.innerText);
        const gone = await f.evaluate(
            () => !document.querySelector("canvas.maplibregl-canvas")
        );
        console.log(
            gone && /is the narrowest part of this filter/.test(txt)
                ? "OK: an impossible filter replaces the map with the blame state"
                : `FAIL: map ${gone ? "gone" : "still up"}, blame ${/narrowest/.test(txt)}`
        );
        await shot(page, "m5-empty");

        await f.getByRole("button", { name: "Drop it" }).click();
        await page.waitForTimeout(5000);
        const back = await f.evaluate(() => {
            const c = document.querySelector("canvas.maplibregl-canvas");
            return { up: !!c?.width, text: document.body.innerText };
        });
        const again = +(back.text.match(/(\d+) photographs/)?.[1] ?? -1);
        console.log(
            back.up && again === before
                ? `OK: dropping the facet brings the map back (${again} photographs)`
                : `FAIL: map up ${back.up}, ${again} photographs (was ${before})`
        );

        // §6.2: long-press captures at a dropped pin. Right-click is the same
        // gesture with a mouse, and the only one a headless run can make.
        await f
            .locator("canvas.maplibregl-canvas")
            .click({ button: "right", position: { x: 300, y: 200 } });
        await page.waitForTimeout(3000);
        const editor = await f.evaluate(() => document.body.innerText);
        console.log(
            /New memory/.test(editor) &&
                /-?\d+\.\d+, -?\d+\.\d+/.test(editor) &&
                /kept in this memory only/.test(editor)
                ? "OK: a dropped pin opens the editor on an unnamed location"
                : `FAIL: no pinned capture:\n${editor.slice(0, 300)}`
        );
        // Away without saving: nothing was created, so there is nothing to
        // clean up beyond leaving the screen.
        await f.evaluate(() => (location.hash = "#/space"));
        await page.waitForTimeout(4000);

        // Dropping the only facet already emptied the filter, which disables
        // the clear button; clicking it then would hang rather than tidy.
        const clear = f.getByRole("button", { name: "Clear the filter" });
        if (await clear.isEnabled()) {
            await clear.click();
            await page.waitForTimeout(2000);
        }
        console.log("[cleanup] filter empty");
    } else if (step === "m6") {
        // Milestone 6 — what you were told about (§4, S-40/S-41), and the loop
        // it closes: hearing about a place, going there, and the app noticing.
        //
        // Needs `make seed-foreign`: the referents are the fixture's events and
        // places, because a recommendation with nothing to point at tests
        // nothing.
        const f = await loginAndGetFrame(page);
        await settle(f);

        // Lisbon, so "nearby" has an answer. The app runs in an iframe served
        // by the auth server, so both origins need the grant.
        for (const origin of [
            "http://localhost:14400",
            "http://localhost:4567",
        ])
            await ctx.grantPermissions(["geolocation"], { origin });
        await ctx.setGeolocation({ latitude: 38.7139, longitude: -9.1394 });

        // Whether that reaches the app at all is a question about the
        // deployment, not about Cairns: the app runs inside the auth server's
        // iframe, and an iframe gets geolocation only if its host says so.
        const geo = await f.evaluate(
            () =>
                new Promise((res) => {
                    if (!navigator.geolocation) return res("no API");
                    navigator.geolocation.getCurrentPosition(
                        (p) =>
                            res(
                                `ok ${p.coords.latitude.toFixed(3)},${p.coords.longitude.toFixed(3)}`
                            ),
                        (e) => res(`denied (code ${e.code}): ${e.message}`),
                        { timeout: 8000 }
                    );
                })
        );
        const positioned = geo.startsWith("ok");
        console.log(`[geolocation] ${geo}`);

        // How many recommendations the STORE holds. Counting rendered rows was
        // a mistake worth not repeating: a screen that threw renders nothing,
        // and a cleanup that reads the DOM then reports success while leaving
        // everything behind — which is exactly what happened, on a devstack
        // other people test against.
        const countRecs = () =>
            f.evaluate(() =>
                window
                    .spikeSelect(
                        "SELECT ?s WHERE { GRAPH ?g { ?s a <did:ng:z:cairns/Recommendation> } }"
                    )
                    .then((r) => r.length)
            );

        /** Remove every recommendation, whoever wrote it. */
        const wipeRecs = async () => {
            await f.evaluate(() =>
                window.spikeUpdate(
                    `PREFIX schema: <https://schema.org/>
                     DELETE { GRAPH ?g { ?l schema:itemListElement ?s . ?s ?p ?o } }
                     WHERE { GRAPH ?g {
                        ?s a <did:ng:z:cairns/Recommendation> ; ?p ?o .
                        OPTIONAL { ?l schema:itemListElement ?s }
                     } }`,
                    undefined
                )
            );
        };

        // Start from nothing, so the first-run state below means what it says
        // and a failed earlier run cannot make this one lie.
        const before = await countRecs();
        if (before) {
            await wipeRecs();
            await page.waitForTimeout(3000);
            console.log(`[pre-clean] removed ${before} left over from before`);
        }

        await f.evaluate(() => (location.hash = "#/heard"));
        await page.waitForTimeout(4000);
        const empty = await f.evaluate(() => document.body.innerText);
        console.log(
            /Nothing yet/.test(empty)
                ? "OK: the first-run empty state explains the screen (§8)"
                : `FAIL: no first-run state:\n${empty.slice(0, 300)}`
        );

        // ---- one recommendation about an event, attributed to a contact ----
        await click(f, "Add something");
        await page.waitForTimeout(2000);
        await f
            .locator('select[aria-label="An event"]')
            .selectOption({ label: "Festival ao Largo" });
        await page.waitForTimeout(500);
        // Whoever the fixture's first contact is — the point is the link, not
        // the name, and the names are the fixture's business.
        const teller = await f.evaluate(() => {
            const sel = document.querySelector(
                'select[aria-label="Who told you"]'
            );
            sel.selectedIndex = 1;
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            return sel.options[1].textContent.trim();
        });
        await page.waitForTimeout(500);
        await click(f, "Save");
        await page.waitForTimeout(4000);

        const listed = await f.evaluate(() => document.body.innerText);
        console.log(
            /Festival ao Largo/.test(listed) &&
                new RegExp(teller).test(listed) &&
                /(happening now|coming up)/.test(listed)
                ? `OK: S-41 wrote it and S-40 shows it, dated and attributed (${teller})`
                : `FAIL: not on the list:\n${listed.slice(0, 400)}`
        );

        // ---- the best moment: happening soon, and near ----
        if (positioned) {
            await f.evaluate(() => (location.hash = "#/here"));
            await page.waitForTimeout(6000);
            const hereNow = await f.evaluate(() => document.body.innerText);
            console.log(
                /Happening near you/.test(hereNow) &&
                    /Festival ao Largo/.test(hereNow)
                    ? "OK: S-01's first card is the event you were told about"
                    : `FAIL: no best-moment card:\n${hereNow.slice(0, 400)}`
            );
        } else {
            // Not a pass. §6.2's first card cannot be exercised where the app
            // is never told where it is, and saying OK would be a lie.
            console.log("SKIP: S-01's proximity cards — no position here");
        }

        // ---- one about a place, and going there ----
        await f.evaluate(() => (location.hash = "#/heard/new"));
        await page.waitForTimeout(3000);
        await click(f, "Pick a place");
        await page.waitForTimeout(2000);
        await f.locator('input[placeholder="Search the places you know"]').fill("Alfama");
        await page.waitForTimeout(1500);
        await f.evaluate(() => {
            const b = [...document.querySelectorAll("li button")].find(
                (x) => x.querySelector(".font-medium")?.textContent.trim() === "Alfama"
            );
            b.click();
        });
        await page.waitForTimeout(2000);
        await f.locator('input[aria-label="Source"]').fill("the m6 driver");
        await f
            .locator("textarea")
            .fill("m6: go on a weekday, ask for the back room");
        await click(f, "Save");
        await page.waitForTimeout(4000);

        // Now capture a memory there. The recommendation must come back
        // fulfilled, and the memory must say so (§6.2, S-21).
        await f.evaluate(() => (location.hash = "#/new"));
        await page.waitForTimeout(3000);
        await f.locator('input[placeholder="Optional"]').fill("M6 heard test");
        await click(f, "+ add a location");
        await page.waitForTimeout(2000);
        await f.locator('input[placeholder="Search the places you know"]').fill("Alfama");
        await page.waitForTimeout(1500);
        await f.evaluate(() => {
            const b = [...document.querySelectorAll("li button")].find(
                (x) => x.querySelector(".font-medium")?.textContent.trim() === "Alfama"
            );
            b.click();
        });
        await page.waitForTimeout(2000);

        // §6.2: capturing at a recommended place *offers* to link, and does not
        // mark. That the offer is showing is the proof it was not automatic —
        // nothing is linked at this point.
        const editing = await f.evaluate(() => document.body.innerText);
        console.log(
            /Was this because you were told about it/.test(editing)
                ? "OK: the editor offers the link rather than making the claim"
                : `FAIL: no offer in the editor:\n${editing.slice(0, 400)}`
        );
        await f
            .getByText("Was this because you were told about it?")
            .click();
        await page.waitForTimeout(500);

        await click(f, "Save");
        await page.waitForTimeout(6000);

        const detail = await f.evaluate(() => document.body.innerText);
        console.log(
            /You came here because/.test(detail) && /the m6 driver/.test(detail)
                ? "OK: accepting the offer records the prompt on the memory"
                : `FAIL: no prompt on the memory:\n${detail.slice(0, 500)}`
        );

        await f.evaluate(() => (location.hash = "#/heard"));
        await page.waitForTimeout(4000);
        const after = await f.evaluate(() => document.body.innerText);
        console.log(
            /you went/.test(after)
                ? "OK: S-40 marks it as visited without hiding it"
                : `FAIL: not marked visited:\n${after.slice(0, 400)}`
        );

        // A place you have been to is no longer a prompt to go (§6.2 card 3).
        if (positioned) {
            await f.evaluate(() => (location.hash = "#/here"));
            await page.waitForTimeout(6000);
            const nagging = await f.evaluate(() => document.body.innerText);
            console.log(
                !/told about these, and they are near[\s\S]*Alfama/.test(nagging)
                    ? "OK: S-01 stops offering a place you have already been"
                    : `FAIL: still offered:\n${nagging.slice(0, 400)}`
            );
        }

        // ---- self-cleaning ----
        await cleanUp(page, f, "M6 heard test", 0);
        if (!process.env.KEEP) {
            // Through the app's own affordance — S-41's delete is part of what
            // this milestone claims works — but verified against the store.
            for (let guard = 0; guard < 6 && (await countRecs()); guard++) {
                await f.evaluate(() => (location.hash = "#/heard"));
                await page.waitForTimeout(3000);
                const clicked = await f.evaluate(() => {
                    const b = document.querySelector("li.bg-base-200 button");
                    if (!b) return false;
                    b.click();
                    return true;
                });
                if (!clicked) break;
                await page.waitForTimeout(2500);
                await click(f, "Forget this recommendation");
                await page.waitForTimeout(3000);
            }
            const left = await countRecs();
            // Belt and braces: whatever the UI could not reach, remove anyway.
            if (left) {
                await wipeRecs();
                await page.waitForTimeout(2000);
            }
            const finally_ = await countRecs();
            console.log(
                finally_ === 0
                    ? `[cleanup] recommendations back to 0${left ? ` (${left} needed the blunt instrument)` : ""}`
                    : `FAIL: ${finally_} recommendation(s) left in the store`
            );
        }
    } else if (step === "tagpicker") {
        // The tag combobox (§3.5, §5): completion scoped to a parent, and
        // creation of a path that does not exist yet. Self-cleaning.
        const f = await loginAndGetFrame(page);
        await settle(f);

        const countProbes = () => countProbeConcepts(f);
        const wipeProbes = () => wipeProbeConcepts(f);
        if (await countProbes()) {
            await wipeProbes();
            await page.waitForTimeout(2000);
            console.log("[pre-clean] removed probe tags left over from before");
        }

        await f.evaluate(() => (location.hash = "#/new"));
        await page.waitForTimeout(3000);

        const box = f
            .locator('input[placeholder="tag, or portugal/sintra"]')
            .last();
        const options = () =>
            f.evaluate(() =>
                [
                    ...document.querySelectorAll(
                        '[data-scope="combobox"][data-part="item"]'
                    ),
                ].map((e) => e.textContent.trim())
            );

        await box.click();
        await box.fill("por");
        await page.waitForTimeout(800);
        const matched = await options();
        console.log(
            matched.some((o) => /port/i.test(o))
                ? `OK: typing matches existing tags (${matched.length} offered)`
                : `FAIL: no completion for "por": ${JSON.stringify(matched)}`
        );
        await shot(page, "tagpicker-completing");

        // Creating a path: neither segment exists, so both are appended.
        await box.fill("probe-parent/probe-child");
        await page.waitForTimeout(800);
        // Creating is a row of the list, not a button beside it — the open
        // listbox used to cover the button entirely.
        await f
            .locator('[data-scope="combobox"][data-part="item"]')
            .filter({ hasText: /create/ })
            .first()
            .click();
        await page.waitForTimeout(4000);

        const after = await f.evaluate(() => document.body.innerText);
        console.log(
            /probe-parent\/probe-child/.test(after)
                ? "OK: a new path is created and selected, shown whole"
                : `FAIL: no path chip:\n${after.slice(0, 300)}`
        );
        console.log(`[store] ${await countProbes()} probe concept(s) written`);

        // Typing the same path again must offer it, not offer to make a second
        // one — the append-only licence of §5 cuts both ways.
        await box.click();
        await box.fill("probe-parent/probe-child");
        await page.waitForTimeout(1000);
        const again = await options();
        console.log(
            !again.some((o) => /create/.test(o))
                ? "OK: an existing path is never offered for creation twice"
                : `FAIL: offered to create a duplicate: ${JSON.stringify(again)}`
        );

        // Drop it from the selection first: a tag already applied is
        // deliberately not offered again, so leaving it selected would test
        // that rule rather than the completion.
        // Escape first: an open listbox covers whatever is around it, and a
        // real user closes it the same way.
        await box.press("Escape");
        await page.waitForTimeout(500);
        await f.getByLabel("Remove this tag").first().click();
        await page.waitForTimeout(800);

        // The parent now completes: this is the point of the hierarchy.
        await box.click();
        await box.fill("probe-parent/");
        await page.waitForTimeout(1000);
        const children = await options();
        console.log(
            children.some((o) => o.includes("probe-child"))
                ? "OK: the new parent completes its children"
                : `FAIL: parent offers ${JSON.stringify(children)}`
        );
        await shot(page, "tagpicker-scoped");

        await wipeProbes();
        await page.waitForTimeout(2000);
        console.log(`[cleanup] probe concepts back to ${await countProbes()}`);
    } else if (step === "siblings") {
        // S-20's sibling sections (§6.2): two memories that share a person and
        // a tag find each other, and tapping one opens it. Self-cleaning — the
        // two memories and the concept they share all go back.
        const f = await loginAndGetFrame(page);
        await settle(f);

        const TITLES = ["Sibling probe A", "Sibling probe B"];
        const WHO = "Sibling Probe Companion";
        const TAG = "probe-sib";

        const countProbes = () => countProbeConcepts(f);
        const wipeProbes = () => wipeProbeConcepts(f);
        // As m3 does: residue from a crashed run would make the counts below
        // describe memories this run never created.
        for (const t of TITLES)
            if (await titleCount(f, t)) {
                const left = await deleteDownTo(page, f, t, 0);
                console.log(`[pre-clean] "${t}" left over from before, now ${left}`);
            }
        if (await countProbes()) {
            await wipeProbes();
            await page.waitForTimeout(2000);
            console.log("[pre-clean] removed probe tags left over from before");
        }

        console.log("=== two memories sharing a companion and a tag ===");
        for (const [i, title] of TITLES.entries()) {
            // Through the archive's own button, not `location.hash = "#/new"`:
            // saving pushes the detail screen, so popping back leaves the hash
            // at `#/new` already — assigning it again fires no hashchange, the
            // stack is never reset, and the second memory would be written in
            // the first one's editor, with its chips still in it.
            await f.evaluate(() => (location.hash = "#/"));
            await page.waitForTimeout(2500);
            await f.getByLabel("Capture a memory").click();
            await page.waitForTimeout(1500);
            await f.getByPlaceholder("Optional").fill(title, { timeout: 60000 });
            await f.getByPlaceholder("A name, or someone you know").fill(WHO);
            await f.getByRole("button", { name: "add", exact: true }).click();
            const box = f
                .locator('input[placeholder="tag, or portugal/sintra"]:visible')
                .last();
            const root = box.locator(
                'xpath=ancestor::*[@data-part="root"][@data-scope="combobox"][1]'
            );
            // The first memory mints the concept; the second picks the one
            // that now exists, which is also what proves the two agree on it.
            const want = i === 0 ? /create/ : new RegExp(`^${TAG}$`);
            // Retried, because the second editor is waiting on a document the
            // first one has only just written: the concept reaches the
            // subscription when it syncs, not when Save returns.
            for (let tries = 0; ; tries++) {
                await box.click();
                await box.fill("");
                await box.pressSequentially(TAG, { delay: 30 });
                await page.waitForTimeout(1500);
                const item = root
                    .locator('[data-scope="combobox"][data-part="item"]')
                    .filter({ hasText: want })
                    .first();
                if (await item.count()) {
                    await item.click();
                    break;
                }
                if (tries === 5) {
                    await shot(page, "siblings-picker");
                    throw new Error(
                        `the picker never offered ${want}: root=${await root.count()} ` +
                            `value=${JSON.stringify(await box.inputValue())} ` +
                            `scoped=${JSON.stringify(
                                await root
                                    .locator(
                                        '[data-scope="combobox"][data-part="item"]'
                                    )
                                    .allInnerTexts()
                            )} global=${JSON.stringify(
                                await f
                                    .locator(
                                        '[data-scope="combobox"][data-part="item"]'
                                    )
                                    .allInnerTexts()
                            )}`
                    );
                }
                await page.waitForTimeout(5000);
            }
            await page.waitForTimeout(i === 0 ? 4000 : 1500);
            await f.getByRole("button", { name: "Save", exact: true }).click();
            await page.waitForTimeout(4000);
        }

        console.log("=== the first memory finds the second ===");
        await f.evaluate(() => (location.hash = "#/"));
        await page.waitForTimeout(3000);
        console.log(
            "[archive]",
            (await titleCount(f, TITLES[0])) === 1 &&
                (await titleCount(f, TITLES[1])) === 1
                ? "both memories are in the archive"
                : `FAIL: A×${await titleCount(f, TITLES[0])} B×${await titleCount(f, TITLES[1])}`
        );
        await f.evaluate((t) => {
            const rows = [...document.querySelectorAll("li button")].filter(
                (b) => b.querySelector(".font-medium")?.textContent.trim() === t
            );
            rows[0].click();
        }, TITLES[0]);
        // Polled: the sibling sections are derived from a subscription that
        // may still be delivering (§8, "partially loaded"), and a memory that
        // arrives a second late is not a failure.
        let txt = "";
        for (let i = 0; i < 12; i++) {
            await page.waitForTimeout(2500);
            txt = await f.evaluate(() => document.body.innerText);
            if (txt.includes("Also with") && txt.includes("Also tagged")) break;
        }
        console.log(
            txt.includes(`Also with ${WHO}`)
                ? "OK: the person facet groups them (bare names merged by name)"
                : `FAIL: no person group:\n${txt.slice(0, 600)}`
        );
        console.log(
            txt.includes(`Also tagged ${TAG}`)
                ? "OK: the tag facet groups them"
                : `FAIL: no tag group:\n${txt.slice(0, 600)}`
        );
        // Both groups name the same memory once each — the section is a list
        // of reasons, not of duplicate memories.
        const mentions = (txt.match(new RegExp(TITLES[1], "g")) ?? []).length;
        console.log(
            mentions === 2
                ? "OK: each group names it once (two groups, two rows)"
                : `FAIL: "${TITLES[1]}" appears ${mentions} times`
        );

        await shot(page, "siblings-sections");

        console.log("=== tapping a sibling opens it ===");
        await f
            .getByRole("button", { name: new RegExp(`^${TITLES[1]}`) })
            .first()
            .click();
        await page.waitForTimeout(2500);
        txt = await f.evaluate(() => document.body.innerText);
        console.log(
            /Sibling probe B/.test(txt) && txt.includes("Also with")
                ? "OK: S-20 → S-20, and the sibling has siblings of its own"
                : `FAIL: after the tap:\n${txt.slice(0, 600)}`
        );

        if (process.env.KEEP) {
            console.log("(KEEP set: leaving the probe memories behind)");
        } else {
            for (const t of TITLES) await cleanUp(page, f, t, 0);
            await wipeProbes();
            await page.waitForTimeout(2000);
            const left = await countProbes();
            console.log(
                left === 0
                    ? "[cleanup] probe concepts back to 0"
                    : `FAIL: ${left} probe concept(s) left in the store`
            );
        }
    } else if (step === "grouping") {
        // S-22a's grouping suggestions (§6.2): three memories on consecutive
        // days are offered as one episode, and either action hands the run to
        // the bulk bar of §4.4. Self-cleaning.
        const f = await loginAndGetFrame(page);
        await settle(f);

        const TITLES = ["Cluster probe 1", "Cluster probe 2", "Cluster probe 3"];
        // April 1998: far from anything the fixtures write, so the suggestion
        // is about these three memories and nothing else.
        const DAYS = ["1998-04-06", "1998-04-07", "1998-04-08"];

        for (const t of TITLES)
            if (await titleCount(f, t)) {
                const left = await deleteDownTo(page, f, t, 0);
                console.log(`[pre-clean] "${t}" left over from before, now ${left}`);
            }
        // The last block mints `probe-cluster`, and a concept that already
        // exists is never offered for creation again (§3.5).
        if (await countProbeConcepts(f)) {
            await wipeProbeConcepts(f);
            await page.waitForTimeout(2000);
            console.log("[pre-clean] removed probe tags left over from before");
        }
        const intruders = await f.evaluate(() =>
            window
                .spikeSelect(
                    `PREFIX schema: <https://schema.org/>
                     PREFIX app: <did:ng:z:cairns/>
                     SELECT ?m WHERE { GRAPH ?g {
                        ?m a app:Memory ; schema:startDate ?d .
                        FILTER(STRSTARTS(STR(?d), "1998-04")) } }`
                )
                .then((r) => r.length)
        );
        console.log(
            intruders === 0
                ? "[window] April 1998 is empty, so the counts below are ours"
                : `FAIL: ${intruders} other memories already in the window`
        );

        console.log("=== three memories on consecutive days ===");
        for (const [i, title] of TITLES.entries()) {
            await f.evaluate(() => (location.hash = "#/"));
            await page.waitForTimeout(2500);
            await f.getByLabel("Capture a memory").click();
            await page.waitForTimeout(1500);
            await f.getByPlaceholder("Optional").fill(title, { timeout: 60000 });
            await f.locator('input[type="date"]').first().fill(DAYS[i]);
            await page.waitForTimeout(500);
            await f.getByRole("button", { name: "Save", exact: true }).click();
            await page.waitForTimeout(4000);
        }

        console.log("=== the archive offers them as one episode ===");
        await f.evaluate(() => (location.hash = "#/"));
        let txt = "";
        for (let i = 0; i < 12; i++) {
            await page.waitForTimeout(2500);
            txt = await f.evaluate(() => document.body.innerText);
            if (/one episode\?/.test(txt)) break;
        }
        const offer = txt.match(/(\d+) memories, ([^\n]*?)— one episode\?/);
        console.log(
            offer && offer[1] === "3"
                ? `OK: a suggestion, "${offer[0].trim()}"`
                : `FAIL: no suggestion for the run:\n${txt.slice(0, 600)}`
        );
        await shot(page, "grouping-suggestion");

        console.log("=== one tap selects the run for tagging ===");
        await f.getByRole("button", { name: "Tag these" }).first().click();
        await page.waitForTimeout(1500);
        txt = await f.evaluate(() => document.body.innerText);
        console.log(
            /3 selected/.test(txt)
                ? "OK: the run became the selection, in the bar of §4.4"
                : `FAIL: the selection bar reads:\n${txt.slice(0, 300)}`
        );
        console.log(
            (await f
                .locator('input[placeholder="tag, or portugal/sintra"]:visible')
                .count()) > 0
                ? "OK: the tag picker is open, one tap in"
                : "FAIL: no tag picker after Tag these"
        );
        // Nothing has been written: the suggestion is still only a proposal.
        await f.getByRole("button", { name: "Done", exact: true }).click();
        await page.waitForTimeout(1500);

        console.log("=== the other tap writes a memory about them ===");
        await f
            .getByRole("button", { name: "Write a memory about these" })
            .first()
            .click();
        await page.waitForTimeout(3000);
        const dates = await f
            .locator('input[type="date"]:visible')
            .evaluateAll((els) => els.map((e) => e.value));
        console.log(
            dates.includes(DAYS[0]) && dates.includes(DAYS[2])
                ? `OK: the editor opened on the derived span ${DAYS[0]} → ${DAYS[2]}`
                : `FAIL: the editor's dates are ${JSON.stringify(dates)}`
        );
        // Cancel, not Save: the point was the hand-off, and a fourth memory
        // would be this run's litter.
        await f.getByRole("button", { name: "Cancel", exact: true }).click();
        await page.waitForTimeout(2000);

        console.log("=== a tagged run is not proposed again ===");
        // The suppression that stands in for dismissal until §3.9 is built.
        await f.getByRole("button", { name: "Tag these" }).first().click();
        await page.waitForTimeout(1500);
        const box = f
            .locator('input[placeholder="tag, or portugal/sintra"]:visible')
            .last();
        await box.click();
        await box.pressSequentially("probe-cluster", { delay: 30 });
        await page.waitForTimeout(1500);
        await box
            .locator(
                'xpath=ancestor::*[@data-part="root"][@data-scope="combobox"][1]'
            )
            .locator('[data-scope="combobox"][data-part="item"]')
            .filter({ hasText: /create/ })
            .first()
            .click();
        await page.waitForTimeout(4000);
        // Applying the tags leaves selection mode by itself, so there is no
        // Done to click here — unlike the dry run above, which stayed in it.
        await f.getByRole("button", { name: /^Add to 3$/ }).click();
        await page.waitForTimeout(6000);
        txt = await f.evaluate(() => document.body.innerText);
        console.log(
            !/one episode\?/.test(txt)
                ? "OK: once they share a tag, the offer is gone"
                : `FAIL: still offered:\n${txt.slice(0, 400)}`
        );

        for (const t of TITLES) await cleanUp(page, f, t, 0);
        if (!process.env.KEEP) {
            await wipeProbeConcepts(f);
            await page.waitForTimeout(2000);
            const left = await countProbeConcepts(f);
            console.log(
                left === 0
                    ? "[cleanup] probe concepts back to 0"
                    : `FAIL: ${left} probe concept(s) left in the store`
            );
        }
    } else if (step === "s33") {
        // S-33 (§6.2): edit an unnamed location in place, then promote it to a
        // place of its own — minting a URI, reconciling with owl:sameAs, and
        // repointing the memory in one update (B-06). Self-cleaning, including
        // the document promotion mints.
        const f = await loginAndGetFrame(page);
        await settle(f);

        const TITLE = "S33 probe";
        const PIN = "S33 probe pin";
        const RENAMED = "S33 probe pin, renamed";
        const PLACE = "S33 probe place";
        const SAMEAS = "https://www.wikidata.org/entity/Q99999999";

        const placeDocs = () =>
            f.evaluate(
                (n) =>
                    window
                        .spikeSelect(
                            `PREFIX schema: <https://schema.org/>
                             SELECT ?g WHERE { GRAPH ?g {
                                ?p a schema:Place ; schema:name "${n}" } }`
                        )
                        .then((r) => r.map((x) => x.g.value)),
                PLACE
            );
        const wipePlaces = async () => {
            for (const g of await placeDocs())
                await f.evaluate(
                    (graph) =>
                        window.spikeUpdate(
                            `DELETE WHERE { GRAPH <${graph}> { ?s ?p ?o } }`,
                            graph
                        ),
                    g
                );
        };

        if (await titleCount(f, TITLE)) {
            const left = await deleteDownTo(page, f, TITLE, 0);
            console.log(`[pre-clean] "${TITLE}" left over from before, now ${left}`);
        }
        if ((await placeDocs()).length) {
            await wipePlaces();
            await page.waitForTimeout(2000);
            console.log("[pre-clean] removed a promoted place from before");
        }

        console.log("=== a memory with a location that has no identity ===");
        await f.evaluate(() => (location.hash = "#/"));
        await page.waitForTimeout(2500);
        await f.getByLabel("Capture a memory").click();
        await page.waitForTimeout(1500);
        await f.getByPlaceholder("Optional").fill(TITLE, { timeout: 60000 });
        await f.getByRole("button", { name: "+ add a location" }).click();
        await f
            .getByPlaceholder("What you call it (optional)")
            .fill(PIN, { timeout: 60000 });
        await f.getByPlaceholder("Latitude").fill("38.70");
        await f.getByPlaceholder("Longitude").fill("-9.40");
        await f.getByRole("button", { name: "Use these coordinates" }).click();
        await page.waitForTimeout(1000);
        await f.getByRole("button", { name: "Save", exact: true }).click();
        await page.waitForTimeout(4000);

        console.log("=== S-20 opens it in S-33, seeded from the store ===");
        await f.getByRole("button", { name: new RegExp(PIN) }).first().click();
        await page.waitForTimeout(3000);
        const seeded = await f.evaluate(() => ({
            name: document.querySelector(
                'input[placeholder="the beach below the road"]'
            )?.value,
            lat: document.querySelector('input[placeholder="Latitude"]')?.value,
        }));
        console.log(
            seeded.name === PIN && seeded.lat === "38.7"
                ? "OK: the editor opened on what the memory holds"
                : `FAIL: seeded with ${JSON.stringify(seeded)}`
        );

        console.log("=== editing it touches nothing else ===");
        await f
            .locator('input[placeholder="the beach below the road"]')
            .fill(RENAMED);
        await f.getByRole("button", { name: "Save", exact: true }).click();
        await page.waitForTimeout(4000);
        let txt = await f.evaluate(() => document.body.innerText);
        console.log(
            txt.includes(RENAMED) && txt.includes(TITLE)
                ? "OK: back on the memory, with the new name on it"
                : `FAIL: after saving:\n${txt.slice(0, 400)}`
        );
        const nested = await f.evaluate(
            (n) =>
                window.spikeSelect(
                    `PREFIX schema: <https://schema.org/>
                     PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
                     SELECT ?p ?lat WHERE { GRAPH ?g {
                        ?p a schema:Place ; schema:name "${n}" ; geo:lat ?lat } }`
                ),
            RENAMED
        );
        console.log(
            nested?.length === 1 &&
                nested[0].p.value.includes("#place-0") &&
                nested[0].lat.value === "38.7"
                ? "OK: one nested place, still nested, coordinates intact"
                : `FAIL: ${JSON.stringify(nested)}`
        );

        console.log("=== promotion mints a URI and repoints the memory ===");
        await f.getByRole("button", { name: new RegExp(RENAMED) }).first().click();
        await page.waitForTimeout(2500);
        await f
            .getByRole("button", { name: "Make it a place of its own…" })
            .click();
        await page.waitForTimeout(500);
        await f
            .locator('input[placeholder="the beach below the road"]')
            .fill(PLACE);
        await f
            .getByPlaceholder("https://www.wikidata.org/entity/Q…")
            .fill(SAMEAS);
        await f.getByRole("button", { name: "Make it a place" }).click();
        await page.waitForTimeout(6000);
        txt = await f.evaluate(() => document.body.innerText);
        console.log(
            txt.includes(PLACE)
                ? "OK: S-33 → S-31, the place has its own screen now"
                : `FAIL: after promoting:\n${txt.slice(0, 400)}`
        );

        const promoted = await f.evaluate(
            ([n, same]) =>
                window.spikeSelect(
                    `PREFIX schema: <https://schema.org/>
                     PREFIX owl: <http://www.w3.org/2002/07/owl#>
                     PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
                     PREFIX app: <did:ng:z:cairns/>
                     SELECT ?p ?lat ?same ?m WHERE {
                        GRAPH ?g { ?p a schema:Place ; schema:name "${n}" ;
                                      geo:lat ?lat ; owl:sameAs ?same }
                        GRAPH ?h { ?m a app:Memory ; schema:location ?p } }`
                ),
            [PLACE, SAMEAS]
        );
        console.log(
            promoted?.length === 1 &&
                !promoted[0].p.value.includes("#") &&
                promoted[0].same.value === SAMEAS &&
                promoted[0].lat.value === "38.7"
                ? "OK: a URI of its own, reconciled, and the memory points at it"
                : `FAIL: ${JSON.stringify(promoted)}`
        );
        const leftovers = await f.evaluate(
            (n) =>
                window.spikeSelect(
                    `PREFIX schema: <https://schema.org/>
                     SELECT ?p WHERE { GRAPH ?g {
                        ?p a schema:Place ; schema:name "${n}" } }`
                ),
            RENAMED
        );
        console.log(
            leftovers?.length === 0
                ? "OK: the nested location is gone, not left behind as an orphan"
                : `FAIL: ${JSON.stringify(leftovers)}`
        );
        await shot(page, "s33-promoted");

        console.log("=== editing a place leaves what it does not know ===");
        // Stand in for the application that wrote the rest of this place:
        // three properties Cairns has never heard of and cannot show, which a
        // wholesale rewrite of the subject would silently take with it.
        const placeDoc = (await placeDocs())[0];
        await f.evaluate(
            (g) =>
                window.spikeUpdate(
                    `PREFIX schema: <https://schema.org/>
                     INSERT DATA { GRAPH <${g}> {
                        <${g}> schema:openingHours "Mo-Fr 09:00-17:00" ;
                               schema:telephone "+351 000 000 000" ;
                               schema:alternateName "o sítio" } }`,
                    g
                ),
            placeDoc
        );
        await page.waitForTimeout(3000);

        // `.last()`: the hidden S-20 below this screen has an Edit of its own.
        await f.getByRole("button", { name: "Edit", exact: true }).last().click();
        await page.waitForTimeout(2500);
        await f
            .locator('input[placeholder="the beach below the road"]')
            .fill("S33 probe place");
        await f.locator('input[placeholder="Latitude"]').fill("38.75");
        await f.getByRole("button", { name: "Save", exact: true }).click();
        await page.waitForTimeout(5000);

        const survived = await f.evaluate(
            (g) =>
                window.spikeSelect(
                    `PREFIX schema: <https://schema.org/>
                     SELECT ?h ?tel ?alt ?name WHERE { GRAPH <${g}> {
                        <${g}> schema:openingHours ?h ;
                               schema:telephone ?tel ;
                               schema:alternateName ?alt ;
                               schema:name ?name } }`
                ),
            placeDoc
        );
        console.log(
            survived?.length === 1 &&
                survived[0].h.value === "Mo-Fr 09:00-17:00" &&
                survived[0].tel.value === "+351 000 000 000" &&
                survived[0].alt.value === "o sítio" &&
                survived[0].name.value === "S33 probe place"
                ? "OK: what the app does not model came through untouched"
                : `FAIL: ${JSON.stringify(survived)}`
        );
        const moved = await f.evaluate(
            (g) =>
                window.spikeSelect(
                    `PREFIX schema: <https://schema.org/>
                     PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
                     SELECT ?flat ?structured WHERE { GRAPH <${g}> {
                        <${g}> geo:lat ?flat ; schema:geo ?n .
                        ?n schema:latitude ?structured } }`
                ),
            placeDoc
        );
        console.log(
            moved?.length === 1 &&
                moved[0].flat.value === "38.75" &&
                moved[0].structured.value === "38.75"
                ? "OK: both forms of the coordinates moved together"
                : `FAIL: ${JSON.stringify(moved)}`
        );

        await cleanUp(page, f, TITLE, 0);
        if (!process.env.KEEP) {
            await wipePlaces();
            await page.waitForTimeout(2000);
            const left = (await placeDocs()).length;
            console.log(
                left === 0
                    ? "[cleanup] the promoted place document is gone too"
                    : `FAIL: ${left} promoted place(s) left in the store`
            );
        }
    } else if (step === "search") {
        // S-02 (§6.2) without an index (B-08): free text over the store,
        // grouped by type, and handed to S-22 as a filter so that a search
        // becomes a bulk action. Self-cleaning.
        const f = await loginAndGetFrame(page);
        await settle(f);

        // A needle nothing else in the store contains, so the counts are ours.
        const NEEDLE = "zarquon";
        const TITLES = [`Zarquon probe A`, `B, mentions it in the narrative`];
        const NARRATIVE = `the day we found the zarquon, at last`;

        for (const t of TITLES)
            if (await titleCount(f, t)) {
                const left = await deleteDownTo(page, f, t, 0);
                console.log(`[pre-clean] "${t}" left over from before, now ${left}`);
            }
        if (await countProbeConcepts(f)) {
            await wipeProbeConcepts(f);
            await page.waitForTimeout(2000);
            console.log("[pre-clean] removed probe tags left over from before");
        }

        console.log("=== a needle in the title, the narrative, and a tag ===");
        for (const [i, title] of TITLES.entries()) {
            await f.evaluate(() => (location.hash = "#/"));
            await page.waitForTimeout(2500);
            await f.getByLabel("Capture a memory").click();
            await page.waitForTimeout(1500);
            await f.getByPlaceholder("Optional").fill(title, { timeout: 60000 });
            if (i === 1)
                await f.getByPlaceholder("What happened?").fill(NARRATIVE);
            if (i === 0) {
                // The tag carries the needle too, so the results span two of
                // §6.2's groups rather than one.
                const box = f
                    .locator('input[placeholder="tag, or portugal/sintra"]:visible')
                    .last();
                await box.click();
                await box.pressSequentially(`probe-${NEEDLE}`, { delay: 30 });
                await page.waitForTimeout(1500);
                await box
                    .locator(
                        'xpath=ancestor::*[@data-part="root"][@data-scope="combobox"][1]'
                    )
                    .locator('[data-scope="combobox"][data-part="item"]')
                    .filter({ hasText: /create/ })
                    .first()
                    .click();
                await page.waitForTimeout(4000);
            }
            await f.getByRole("button", { name: "Save", exact: true }).click();
            await page.waitForTimeout(4000);
        }

        console.log("=== search, grouped by type ===");
        await f.evaluate(() => (location.hash = "#/search"));
        await page.waitForTimeout(2500);
        await f.locator('input[aria-label="Search"]').fill(NEEDLE);
        await f.getByRole("button", { name: "Search", exact: true }).click();
        let txt = "";
        for (let i = 0; i < 10; i++) {
            await page.waitForTimeout(2000);
            txt = await f.evaluate(() => document.body.innerText);
            if (/Memories · \d/.test(txt)) break;
        }
        console.log(
            /Memories · 2/.test(txt)
                ? "OK: both memories found — one by title, one by narrative"
                : `FAIL: memories group reads:\n${txt.slice(0, 500)}`
        );
        console.log(
            /Tags · 1/.test(txt)
                ? "OK: the tag is a group of its own (§6.2)"
                : `FAIL: no tag group:\n${txt.slice(0, 500)}`
        );
        console.log(
            txt.includes("the day we found the zarquon")
                ? "OK: the narrative hit shows what matched"
                : "FAIL: no excerpt for the narrative hit"
        );
        await shot(page, "search-results");

        console.log("=== the result set becomes a filter, and a selection ===");
        await f
            .getByRole("button", { name: /^Tag or group these 2 memories$/ })
            .click();
        await page.waitForTimeout(3000);
        txt = await f.evaluate(() => document.body.innerText);
        console.log(
            /Showing 2 search results/.test(txt)
                ? "OK: S-22 shows the results as a filter"
                : `FAIL: browse reads:\n${txt.slice(0, 400)}`
        );
        console.log(
            /2 selected/.test(txt)
                ? "OK: and they arrive selected, one tap from a bulk action"
                : `FAIL: nothing selected:\n${txt.slice(0, 400)}`
        );
        const rows = await f.evaluate(
            () => document.querySelectorAll("li button .font-medium").length
        );
        console.log(
            rows === 2
                ? "OK: the archive is narrowed to exactly the two"
                : `FAIL: ${rows} rows under a 2-result filter`
        );

        console.log("=== and the way out of it ===");
        await f.getByRole("button", { name: "Show everything" }).click();
        await page.waitForTimeout(2500);
        const after = await f.evaluate(
            () => document.querySelectorAll("li button .font-medium").length
        );
        console.log(
            after > rows
                ? `OK: dropping the facet brought the archive back (${after} rows)`
                : `FAIL: still ${after} rows after Show everything`
        );

        for (const t of TITLES) await cleanUp(page, f, t, 0);
        if (!process.env.KEEP) {
            await wipeProbeConcepts(f);
            await page.waitForTimeout(2000);
            const left = await countProbeConcepts(f);
            console.log(
                left === 0
                    ? "[cleanup] probe concepts back to 0"
                    : `FAIL: ${left} probe concept(s) left in the store`
            );
        }
    } else if (step === "search-probe") {
        // B-08: what can free-text search (S-02) do with SPARQL alone, before
        // anyone builds an index? Read-only — this writes nothing.
        const f = await loginAndGetFrame(page);
        await settle(f);

        const needle = process.argv[3] ?? "lisboa";
        const run = async (label, query) => {
            const r = await f.evaluate(
                async ([q]) => {
                    const t0 = performance.now();
                    try {
                        const rows = await window.spikeSelect(q);
                        return { ms: performance.now() - t0, n: rows.length };
                    } catch (e) {
                        return { ms: performance.now() - t0, error: String(e) };
                    }
                },
                [query]
            );
            console.log(
                `[${label}] ${r.error ? "ERROR " + r.error.slice(0, 160) : `${r.n} rows`} in ${Math.round(r.ms)} ms`
            );
            return r;
        };

        const P = `PREFIX schema: <https://schema.org/>
                   PREFIX app: <did:ng:z:cairns/>
                   PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
                   PREFIX foaf: <http://xmlns.com/foaf/0.1/>`;

        // 1. The narrow case: this app's own memories, by title and narrative.
        await run(
            "memories by title/narrative",
            `${P} SELECT ?s ?o WHERE { GRAPH ?g {
                ?s a app:Memory ; ?p ?o .
                VALUES ?p { schema:name schema:text schema:description }
                FILTER(CONTAINS(LCASE(STR(?o)), "${needle}"))
             } }`
        );

        // 2. The whole point of S-02: every literal in the store, whoever
        //    wrote it. This is the query an index would replace.
        await run(
            "every literal in the store",
            `SELECT ?g ?s ?p ?o WHERE { GRAPH ?g {
                ?s ?p ?o .
                FILTER(isLiteral(?o) && CONTAINS(LCASE(STR(?o)), "${needle}"))
             } }`
        );

        // 3. Does REGEX work, and what does it cost against CONTAINS?
        await run(
            "same, by REGEX",
            `SELECT ?s WHERE { GRAPH ?g {
                ?s ?p ?o .
                FILTER(isLiteral(?o) && REGEX(STR(?o), "${needle}", "i"))
             } }`
        );

        // 4. §6.2 wants results grouped by type. Can one query say what each
        //    hit is, so the grouping is not a second round-trip per result?
        await run(
            "hits with their type",
            `${P} SELECT ?s ?type (SAMPLE(?o) AS ?snippet) WHERE { GRAPH ?g {
                ?s ?p ?o ; a ?type .
                FILTER(isLiteral(?o) && CONTAINS(LCASE(STR(?o)), "${needle}"))
             } } GROUP BY ?s ?type`
        );

        // 5. A prefix match, which is what a type-ahead actually needs.
        await run(
            "prefix match on tag labels",
            `${P} SELECT ?c ?l WHERE { GRAPH ?g {
                ?c a skos:Concept ; skos:prefLabel ?l .
                FILTER(STRSTARTS(LCASE(?l), "${needle.slice(0, 3)}"))
             } }`
        );

        // 6. Scale of what any of this walks.
        await run(
            "every triple (for scale)",
            `SELECT ?s WHERE { GRAPH ?g { ?s ?p ?o } }`
        );
    } else if (step === "spike10") {
        // Recommendations live many-to-a-document and that document is mutated
        // for the rest of its life. Does a live subscription notice a sibling
        // appearing beside one it already holds?
        const f = await loginAndGetFrame(page);
        await f.evaluate(() => (location.hash = "#/dev"));
        await page.waitForTimeout(1000);
        await f.getByRole("tab", { name: "10 · list doc" }).click();
        await settle(f);

        await click(f, "1 · list + one item");
        await waitForLog(f, "list document with one item", 60000);
        await click(f, "2 · append a sibling");
        await waitForLog(f, "subscription went", 60000);
        await click(f, "3 · what comes back");
        await page.waitForTimeout(2000);
        await click(f, "4 · delete one item");
        await waitForLog(f, "after deleting one", 60000);
        console.log("[log]\n" + (await readLog(f)));

        // Self-cleaning: the shared devstack must be left as it was found.
        await click(f, "5 · clean up");
        await waitForLog(f, "deleted the spike", 60000);
        console.log("[cleanup] spike 10 list document removed");
    } else if (step === "spike9") {
        // Does MapLibre run here at all — headless, in the auth server's
        // iframe, beside the WASM engine — and how does it fail without tiles?
        const f = await loginAndGetFrame(page);
        await f.evaluate(() => (location.hash = "#/dev"));
        await page.waitForTimeout(1000);
        await f.getByRole("tab", { name: "9 \u00b7 map" }).click();
        await settle(f);

        await click(f, "1 \u00b7 demo basemap");
        await waitForLog(f, "demo basemap:", 30000);
        await click(f, "2 \u00b7 plot the store");
        await waitForLog(f, "plot #1", 120000);
        await page.waitForTimeout(1000);
        await shot(page, "spike9-basemap");

        await click(f, "3 \u00b7 no basemap at all");
        await waitForLog(f, "plot #2", 120000);
        await page.waitForTimeout(1000);
        await shot(page, "spike9-bare");

        // Cut only the tile host: setOffline would take the broker's websocket
        // with it and the session would go down instead of the basemap.
        await page.route("**://*.maplibre.org/**", (r) => r.abort());
        console.log("=== tiles blocked ===");
        await click(f, "4 \u00b7 with tiles blocked");
        await waitForLog(f, "plot #3", 60000);
        await page.waitForTimeout(2000);
        await shot(page, "spike9-blocked");

        await click(f, "5 \u00b7 the Svelte wrapper");
        await page.waitForTimeout(4000);
        await shot(page, "spike9-wrapper");
        console.log("[log]\n" + (await readLog(f)));
    } else if (step === "seed-foreign" || step === "seed-foreign-clean") {
        // The other half of the store: the shapes Cairns reads and never
        // writes (§5), plus contacts appended to the shared people document.
        //   node browse.mjs seed-foreign [contacts] [tracks]
        const clean = step === "seed-foreign-clean";
        const contacts = process.argv[3] ?? "60";
        const tracks = process.argv[4] ?? "4";
        const f = await loginAndGetFrame(page);
        await f.evaluate(() => (location.hash = "#/dev"));
        await page.waitForTimeout(1000);
        await f.getByRole("tab", { name: "seed foreign" }).click();
        await settle(f);

        if (clean) {
            await click(f, "2 \u00b7 clean up");
            await waitForLog(f, "cleared the fixture", 600000);
        } else {
            await f.locator('input[type="number"]').first().fill(contacts);
            await f.locator('input[type="number"]').nth(1).fill(tracks);
            await click(f, "1 \u00b7 seed everything");
            await waitForLog(f, "seeded the foreign store", 900000);
        }
        console.log("[log]\n" + (await readLog(f)));

        // What the census now sees, straight from the store: a seeding run
        // that reported success while writing nothing readable would otherwise
        // look exactly like one that worked.
        const counts = await f.evaluate(async () => {
            const probes = {
                "foaf:Person": "<http://xmlns.com/foaf/0.1/Person>",
                "vcard:Individual":
                    "<http://www.w3.org/2006/vcard/ns#Individual>",
                "skos:Concept":
                    "<http://www.w3.org/2004/02/skos/core#Concept>",
                "skos:ConceptScheme":
                    "<http://www.w3.org/2004/02/skos/core#ConceptScheme>",
                "schema:Place": "<https://schema.org/Place>",
                "schema:Event": "<https://schema.org/Event>",
                "schema:Reservation": "<https://schema.org/Reservation>",
                "gsp:Geometry": "<http://www.opengis.net/ont/geosparql#Geometry>",
            };
            const out = {};
            for (const [label, iri] of Object.entries(probes)) {
                const rows = await window.spikeSelect(
                    `SELECT ?s WHERE { GRAPH ?g { ?s a ${iri} } }`
                );
                out[label] = rows.length;
            }
            return out;
        });
        console.log("[census]", JSON.stringify(counts));
    } else if (step === "spike6") {
        // Thumbnails at grid scale (B-01): node browse.mjs spike6 [count] [conc]
        const count = process.argv[3] ?? "40";
        const conc = process.argv[4] ?? "6";
        const f = await loginAndGetFrame(page);
        await f.evaluate(() => (location.hash = "#/dev"));
        await page.waitForTimeout(1000);
        await f.getByRole("tab", { name: "6 · thumbnails" }).click();
        await settle(f);

        await f.locator('input[type="number"]').first().fill(count);
        await f.locator('input[type="number"]').nth(1).fill(conc);
        // count 0 measures the existing corpus without seeding more documents
        // into the store (which is shared with other people's tests).
        if (count !== "0") {
            console.log(`=== seeding ${count} media documents ===`);
            await click(f, "1 · seed media");
            await waitForLog(f, "seeded " + count + " media documents", 900000);
        }
        await click(f, "2 · discover");
        await waitForLog(f, "discovered", 180000);
        console.log("=== thumbnails, sequential ===");
        await click(f, "3 · thumbnails, sequential");
        await waitForLog(f, "concurrency 1:", 600000);
        console.log("=== thumbnails, concurrent ===");
        await click(f, "4 · thumbnails, concurrent");
        await waitForLog(f, `concurrency ${conc}:`, 600000);
        console.log("=== full-size instead ===");
        await click(f, "5 · full-size instead");
        await waitForLog(f, "FULL-SIZE", 900000).catch((e) =>
            console.log(`(full-size: ${e.message})`)
        );
        // Every assembled blob must decode: a chunk reassembly bug would show
        // up as a broken or truncated image, not as an error.
        await page.waitForTimeout(5000);
        const decoded = await f.evaluate(async () => {
            const out = { ok: 0, broken: [], sizes: {} };
            for (const img of document.querySelectorAll("img")) {
                if (!img.complete)
                    await new Promise((r) => {
                        img.onload = img.onerror = r;
                    });
                const k = `${img.naturalWidth}x${img.naturalHeight}`;
                if (!img.naturalWidth) out.broken.push(img.src.slice(-12));
                else out.ok++;
                out.sizes[k] = (out.sizes[k] ?? 0) + 1;
            }
            return out;
        });
        console.log("[decoded]", JSON.stringify(decoded));
        console.log("[log]\n" + (await readLog(f)));
        await shot(page, "spike6");
    } else if (step === "status") {
        const f = await loginAndGetFrame(page);
        console.log("=== waiting 60s for engine to settle after login ===");
        await page.waitForTimeout(60000);
        await click(f, "enumerate");
        await waitForLog(f, "enumerated", 180000);
        console.log("[log]", await readLog(f));
        console.log("=== subscribe wildcard ===");
        await click(f, "subscribe did:ng:i");
        await waitForLog(f, "subscription ready", 180000).catch((e) =>
            console.log("(no ready)", e.message)
        );
        await page.waitForTimeout(5000);
        console.log("[log]", await readLog(f));
        console.log(
            "[body]",
            await f.evaluate(() => document.body.innerText.slice(0, 600))
        );
        await shot(page, "status");
    } else if (step === "direct") {
        await page.goto("http://localhost:4567/", { waitUntil: "networkidle" });
        await page.waitForTimeout(3000);
        await shot(page, "04-direct");
        await dump(page);
    } else if (step === "import") {
        await page.goto(AUTH_URL, { waitUntil: "networkidle" });
        await page.waitForTimeout(2000);
        await page.setInputFiles("#import_wallet_file", WALLET_FILE);
        await page.waitForTimeout(3000);
        await shot(page, "02-imported");
        await dump(page);
    }
} finally {
    await ctx.close();
}
