import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { buildChromeMock, installPageMock, shadowLocator, CONTENT_SCRIPT_PATH } from "./helpers";

let context: BrowserContext;
let page: Page;

test.beforeAll(async () => {
  // google-chrome headless（容器内稳定）；扩展以注入方式测试
  context = await chromium.launchPersistentContext("", {
    headless: true,
    channel: "chrome",
    args: ["--no-sandbox", "--disable-gpu"],
  });
  page = context.pages()[0] ?? (await context.newPage());
  // 先注入 chrome API mock，再注入 content script bundle
  await page.addInitScript(buildChromeMock());
  await page.addInitScript({ path: CONTENT_SCRIPT_PATH });
  await installPageMock(page);
});

test.afterAll(async () => {
  await context.close();
});

test("PR 页面上出现 Papers Review tab 并可激活", async () => {
  await page.goto("https://github.com/demo/demo-repo/pull/42/files");
  const tab = page.locator("#papers-review-tab");
  await expect(tab).toBeVisible({ timeout: 15_000 });
  await tab.click();

  await expect(page.locator("#papers-review-host")).toBeAttached({ timeout: 10_000 });
  await expect(shadowLocator(page, ".pr-app-shell")).toBeAttached({ timeout: 10_000 });
  await expect(page.locator("#diff-comparison-viewer-container")).toBeHidden();
});

test("论文渲染：标题、段落、修订标识", async () => {
  await expect(shadowLocator(page, ".pr-heading-line")).toContainText("Attention Is All You Need", {
    timeout: 20_000,
  });
  await expect(shadowLocator(page, ".pr-paper")).toContainText("sequence transduction");
  // 新增句（\maketitle、Our experiments；align 环境合并为 math block）
  const addedCount = await shadowLocator(page, ".pr-sentence-added").count();
  expect(addedCount).toBeGreaterThanOrEqual(2);
  // 数学环境渲染（align block）
  await expect(shadowLocator(page, ".pr-math-display").first()).toBeAttached({ timeout: 15_000 });
  // 工具栏统计反映新增
  await expect(shadowLocator(page, ".pr-toolbar-stats")).toContainText("+2", { timeout: 15_000 });
});

test("工具栏：统计与视图切换", async () => {
  await expect(shadowLocator(page, ".pr-toolbar-stats")).toBeVisible({ timeout: 15_000 });
  await shadowLocator(page, ".pr-view-btn").nth(3).click();
  await expect(shadowLocator(page, ".pr-raw-view")).toBeVisible({ timeout: 10_000 });
  await shadowLocator(page, ".pr-view-btn").first().click();
  await expect(shadowLocator(page, ".pr-paper")).toBeVisible({ timeout: 10_000 });
});

test("选择文本出现评论按钮并打开 composer", async () => {
  await expect(shadowLocator(page, ".pr-sentence").first()).toBeAttached({ timeout: 15_000 });
  // 用 Range API 选择句子文本并派发 mouseup
  await page.evaluate(() => {
    const root = document.getElementById("papers-review-host")!.shadowRoot!;
    const sent = [...root.querySelectorAll<HTMLElement>(".pr-sentence")].find((el) =>
      el.textContent?.includes("sequence transduction"),
    );
    if (!sent) throw new Error("sentence not found");
    const range = document.createRange();
    range.selectNodeContents(sent);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    sent.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, composed: true }));
  });
  await expect(shadowLocator(page, ".pr-selection-popover")).toBeVisible({ timeout: 8_000 });
  await shadowLocator(page, ".pr-selection-popover").getByRole("button", { name: "评论" }).click();
  await expect(shadowLocator(page, ".pr-composer")).toBeVisible({ timeout: 8_000 });
});

test("composer 发布评论（mock）后线程出现", async () => {
  const composer = shadowLocator(page, ".pr-composer");
  await composer.locator("textarea").fill("这条评论来自 e2e 测试。");
  await composer.getByRole("button", { name: "加入 Review" }).click();
  await expect(shadowLocator(page, ".pr-thread").first()).toBeAttached({ timeout: 10_000 });
  await expect(shadowLocator(page, ".pr-comments-scroll")).toContainText("这条评论来自 e2e 测试", {
    timeout: 10_000,
  });
});

test("返回按钮恢复原生视图", async () => {
  await shadowLocator(page, ".pr-toolbar").locator(".pr-btn-ghost").first().click();
  await expect(page.locator("#papers-review-host")).not.toBeAttached({ timeout: 10_000 });
  await expect(page.locator("#diff-comparison-viewer-container")).toBeVisible();
});
