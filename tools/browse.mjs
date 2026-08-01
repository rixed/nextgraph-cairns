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

        console.log("=== capture The Van Year (gYear 2019) ===");
        await f.getByLabel("Capture a memory").click();
        await f.getByRole("button", { name: "Year", exact: true }).click();
        await f.locator('input[type="number"]').fill("2019");
        await f.getByPlaceholder("Optional").fill("The Van Year");
        await f.getByPlaceholder("One line, shown in lists").fill(
            "Living in the van"
        );
        await f.locator("summary", { hasText: "Tags" }).click();
        await f.getByText("van-year", { exact: true }).first().click();
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
            ].map((b) => b.querySelector("span").textContent.trim());
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
    } else if (step === "m2") {
        // Milestone 2 end-to-end: a memory dated inside the fixture corpus
        // picks up photographs by overlap, opens one, attaches it, and
        // suppresses another — the §3.9 "no" that must never be re-proposed.
        const f = await loginAndGetFrame(page);
        await settle(f);

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
        await f.getByText("Document").waitFor({ timeout: 60000 });
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
