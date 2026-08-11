import { embeddedDataScript, extractEmbeddedData } from "./embeddedData";
import type { PullRequestLocation } from "@/domain/pullRequest";

export const PAPERS_REVIEW_TAB_ID = "papers-review-tab";
export const PAPERS_REVIEW_HOST_ID = "papers-review-host";

/** 被修改节点的原始状态，用于恢复。 */
interface SavedState {
  node: HTMLElement;
  hidden: boolean;
  styleDisplay: string | null;
  styleVisibility: string | null;
  ariaHidden: string | null;
  className: string | null;
}

/**
 * GitHub DOM adapter：
 * - 定位 PR 页面关键节点（多级 fallback）；
 * - 隐藏 / 恢复原生 diff 主体；
 * - 插入 / 移除 Papers Review tab；
 * - 管理 aria-current 状态。
 */
export class GithubDomAdapter {
  private hiddenNodes: SavedState[] = [];
  private tab: HTMLAnchorElement | null = null;
  private nativeTab: HTMLAnchorElement | null = null;
  private tabBar: HTMLElement | null = null;

  /** 定位 diff 主体容器（主路径）。 */
  findDiffContainer(doc: Document = document): HTMLElement | null {
    const byId = doc.getElementById("diff-comparison-viewer-container");
    if (byId) return byId;
    const app = doc.querySelector<HTMLElement>('react-app[app-name="pull-requests"]');
    if (app) return app;
    // react 新 UI：diff 视图容器（PR files 页与 PR 内 commit 页共用）
    const files = doc.getElementById("files");
    if (files) return files;
    const layout = doc.getElementById("diff-layout-component");
    if (layout) return layout;
    return null;
  }

  /** 定位需要隐藏的节点集合（fallback 路径：tabBar 之后的兄弟）。 */
  findNodesToHide(doc: Document = document): HTMLElement[] {
    const container = this.findDiffContainer(doc);
    if (container) return [container];
    const tabBar = this.findTabBar(doc);
    if (!tabBar?.parentElement) return [];
    const parent = tabBar.parentElement;
    const out: HTMLElement[] = [];
    let afterTabs = false;
    for (const child of [...parent.children]) {
      if (child === tabBar) {
        afterTabs = true;
        continue;
      }
      if (afterTabs && child instanceof HTMLElement) {
        // 跳过 PR header / 标题等
        if (child.querySelector("h1, [data-testid='pr-header'], .js-issue-title")) continue;
        out.push(child);
      }
    }
    return out;
  }

  /** 定位 PR tabs 导航栏。 */
  findTabBar(doc: Document = document): HTMLElement | null {
    const byTestId = doc.querySelector<HTMLElement>('nav[data-testid="pr-tabs"]');
    if (byTestId) return byTestId;
    const links = [...doc.querySelectorAll<HTMLAnchorElement>('a[href*="/pull/"]')];
    for (const a of links) {
      if (/\/pull\/\d+\/(files|changes)/.test(a.getAttribute("href") ?? "")) {
        const nav = a.closest("nav");
        if (nav) return nav as HTMLElement;
      }
    }
    return null;
  }

  /** 定位原生 Files changed tab。 */
  findNativeFilesTab(doc: Document = document): HTMLAnchorElement | null {
    const links = [...doc.querySelectorAll<HTMLAnchorElement>("a")];
    for (const a of links) {
      const href = a.getAttribute("href") ?? "";
      if (/\/pull\/\d+\/files(?:\/|$|\?|#)/.test(href)) return a;
    }
    return null;
  }

  /** 隐藏原生 diff 主体，记录原始状态。 */
  hideNativeDiff(): void {
    const nodes = this.findNodesToHide();
    for (const node of nodes) this.saveAndHide(node);
  }

  private saveAndHide(node: HTMLElement): void {
    if (this.hiddenNodes.some((s) => s.node === node)) return;
    this.hiddenNodes.push({
      node,
      hidden: node.hidden,
      styleDisplay: node.style.display,
      styleVisibility: node.style.visibility,
      ariaHidden: node.getAttribute("aria-hidden"),
      className: node.getAttribute("class"),
    });
    node.hidden = true;
    node.style.display = "none";
    node.setAttribute("aria-hidden", "true");
  }

  /** 恢复原生视图。 */
  restoreNative(): void {
    for (const s of this.hiddenNodes) {
      s.node.hidden = s.hidden;
      s.node.style.display = s.styleDisplay ?? "";
      s.node.style.visibility = s.styleVisibility ?? "";
      if (s.ariaHidden === null) s.node.removeAttribute("aria-hidden");
      else s.node.setAttribute("aria-hidden", s.ariaHidden);
      if (s.className === null) s.node.removeAttribute("class");
      else s.node.setAttribute("class", s.className);
    }
    this.hiddenNodes = [];
  }

  /** 插入 Papers Review tab（幂等）。 */
  ensureTab(loc: PullRequestLocation): HTMLAnchorElement | null {
    if (this.tab && this.tab.isConnected) return this.tab;
    const tabBar = this.findTabBar();
    if (!tabBar) return null;
    const tab = document.createElement("a");
    tab.id = PAPERS_REVIEW_TAB_ID;
    tab.href = `#papers-review`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", "false");
    tab.className = "pr-tab papers-review-tab";
    tab.textContent = "Papers Review";
    tab.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.dispatchEvent(
        new CustomEvent("papers-review:toggle", {
          detail: { owner: loc.owner, repo: loc.repo, number: loc.number },
        }),
      );
    });
    this.nativeTab = this.findNativeFilesTab();
    let inserted = false;
    if (this.nativeTab?.parentElement) {
      this.nativeTab.parentElement.insertAdjacentElement("afterend", tab);
      inserted = true;
    }
    if (!inserted) tabBar.appendChild(tab);
    this.tab = tab;
    this.tabBar = tabBar;
    return tab;
  }

  /** 标记 Papers Review 为当前 tab。 */
  setPapersReviewActive(active: boolean): void {
    if (this.tab) {
      this.tab.setAttribute("aria-selected", active ? "true" : "false");
      if (active) this.tab.classList.add("papers-review-active");
      else this.tab.classList.remove("papers-review-active");
    }
    if (active && this.nativeTab?.isConnected) {
      this.nativeTab.removeAttribute("aria-current");
    }
  }

  /** 移除 tab（恢复原状）。 */
  removeTab(): void {
    if (this.tab) {
      this.tab.remove();
      this.tab = null;
    }
    this.tabBar = null;
  }

  /** 是否存在 Papers Review host。 */
  hasHost(doc: Document = document): boolean {
    return !!doc.getElementById(PAPERS_REVIEW_HOST_ID);
  }

  /** 创建 Shadow DOM host（幂等）。 */
  ensureHost(doc: Document = document): HTMLElement | null {
    const existing = doc.getElementById(PAPERS_REVIEW_HOST_ID);
    if (existing) return existing;
    const container = this.findDiffContainer(doc);
    if (!container) return null;
    const host = doc.createElement("div");
    host.id = PAPERS_REVIEW_HOST_ID;
    container.insertAdjacentElement("beforebegin", host);
    return host;
  }

  /** 页面结构是否具备 PR 特征（用于等待 SPA 渲染）。 */
  pageLooksLikePullRequest(doc: Document = document): boolean {
    return (
      !!doc.getElementById("diff-comparison-viewer-container") ||
      !!doc.querySelector('react-app[app-name="pull-requests"]') ||
      !!embeddedDataScript(doc) ||
      !!this.findNativeFilesTab(doc)
    );
  }

  /** 尝试从 DOM 中提取 PR 定位信息（作为 URL 解析的补充校验）。 */
  probePullRequestLocation(): PullRequestLocation | null {
    const embedded = extractEmbeddedData(document);
    const nativeTab = this.findNativeFilesTab();
    if (embedded?.pullRequest?.number && nativeTab) {
      const href = nativeTab.getAttribute("href") ?? "";
      const m = /^\/([^/]+)\/([^/]+)\/pull\//.exec(href);
      if (m && embedded.pullRequest.number > 0) {
        return {
          owner: m[1]!,
          repo: m[2]!,
          number: embedded.pullRequest.number,
          surface: "files",
        };
      }
    }
    return null;
  }
}
