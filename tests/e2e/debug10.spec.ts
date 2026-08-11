import { test, chromium, expect } from "@playwright/test";
import { buildChromeMock, installPageMock, shadowLocator, CONTENT_SCRIPT_PATH } from "./helpers";

test("debug10", async () => {
  const context = await chromium.launchPersistentContext("", { headless: true, channel: "chrome", args: ["--no-sandbox", "--disable-gpu"] });
  const page = context.pages()[0] ?? (await context.newPage());
  page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 200)));
  await page.addInitScript(buildChromeMock());
  await page.addInitScript({ path: CONTENT_SCRIPT_PATH });
  await installPageMock(page);
  await page.goto("https://github.com/demo/demo-repo/pull/42/files");
  const tab = page.locator("#papers-review-tab");
  await expect(tab).toBeVisible({ timeout: 15000 });
  await tab.click();
  await expect(shadowLocator(page, ".pr-heading-line")).toContainText("Attention Is All You Need", { timeout: 20000 });
  await page.evaluate(() => {
    const root = document.getElementById("papers-review-host")!.shadowRoot!;
    const sent = [...root.querySelectorAll<HTMLElement>(".pr-sentence")].find((el) => el.textContent?.includes("sequence transduction"))!;
    const range = document.createRange();
    range.selectNodeContents(sent);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    sent.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, composed: true }));
  });
  const pop = shadowLocator(page, ".pr-selection-popover");
  await expect(pop).toBeVisible({ timeout: 8000 });
  await pop.getByRole("button", { name: "评论" }).click();
  const composer = shadowLocator(page, ".pr-composer");
  await expect(composer).toBeVisible({ timeout: 8000 });
  const anchorInfo = await page.evaluate(() => {
    const root = document.getElementById("papers-review-host")!.shadowRoot!;
    const c = root.querySelector(".pr-composer");
    return {
      file: c?.querySelector(".pr-composer-file")?.textContent ?? null,
      lines: c?.querySelector(".pr-composer-lines")?.textContent ?? null,
    };
  });
  console.log("ANCHOR:", JSON.stringify(anchorInfo));
  await context.close();
});
