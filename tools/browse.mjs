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
