import { createRoot, type Root } from "react-dom/client";
import { GithubDomAdapter, PAPERS_REVIEW_HOST_ID } from "./githubDomAdapter";
import { NavigationObserver } from "./navigationObserver";
import { samePullRequest } from "./githubUrl";
import { PapersReviewApp } from "@/app/PapersReviewApp";
import type { PullRequestLocation } from "@/domain/pullRequest";
import styles from "@/entrypoints/papers-review.content/style.css?inline";

type ControllerState = "idle" | "active";

/**
 * 幂等挂载控制器：
 * - 管理 Papers Review 的激活 / 停用；
 * - 监听 SPA 导航，PR 或 range 变化时重新挂载；
 * - 离开 PR 页面立即清理；
 * - DOM 被 GitHub 重渲染时自动恢复挂载。
 */
export class MountController {
  private adapter = new GithubDomAdapter();
  private observer: NavigationObserver | null = null;
  private state: ControllerState = "idle";
  private current: PullRequestLocation | null = null;
  private root: Root | null = null;
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private domGuard: MutationObserver | null = null;
  private toggleHandler: ((e: Event) => void) | null = null;
  private abortController: AbortController | null = null;

  start(): void {
    this.toggleHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { owner: string; repo: string; number: number }
        | undefined;
      if (!detail) return;
      if (this.state === "active" && this.current) {
        if (
          this.current.owner === detail.owner &&
          this.current.repo === detail.repo &&
          this.current.number === detail.number
        ) {
          this.deactivate();
          return;
        }
      }
      const loc = this.current ?? null;
      if (loc) this.activate(loc);
    };
    document.addEventListener("papers-review:toggle", this.toggleHandler);
    this.observer = new NavigationObserver((loc) => this.onNavigate(loc));
    this.observer.start();
    // DOM 守护：GitHub SPA 重渲染可能移除 host，active 时自动恢复
    this.domGuard = new MutationObserver(() => {
      if (this.state !== "active") return;
      if (this.host && !this.host.isConnected) {
        this.remount();
      }
    });
    this.domGuard.observe(document.documentElement, { childList: true, subtree: true });
  }

  private onNavigate(loc: PullRequestLocation | null): void {
    if (!loc) {
      // 离开了 PR 页面
      if (this.state === "active") this.deactivate();
      this.current = null;
      return;
    }
    if (this.state === "active" && this.current && samePullRequest(this.current, loc)) {
      return;
    }
    this.current = loc;
    if (this.state === "active") {
      this.remount();
    }
  }

  /** 激活 Papers Review。 */
  activate(loc: PullRequestLocation): void {
    if (this.state === "active") {
      if (this.current && samePullRequest(this.current, loc)) return;
      this.remount();
      return;
    }
    this.state = "active";
    this.current = loc;
    this.mount(loc);
  }

  private mount(loc: PullRequestLocation): void {
    this.adapter.hideNativeDiff();
    const tab = this.adapter.ensureTab(loc);
    const host = this.adapter.ensureHost();
    if (!host) {
      // 页面结构尚未就绪，交给 DOM guard 重试
      this.state = "idle";
      return;
    }
    this.host = host;
    this.adapter.setPapersReviewActive(true);
    if (tab) tab.scrollIntoView({ block: "nearest" });
    const shadow = host.attachShadow({ mode: "open" });
    this.shadow = shadow;
    const styleEl = document.createElement("style");
    styleEl.textContent = styles;
    shadow.appendChild(styleEl);
    const abort = new AbortController();
    this.abortController = abort;
    this.root = createRoot(shadow);
    this.root.render(
      <PapersReviewApp
        location={loc}
        signal={abort.signal}
        onBackToNative={() => this.deactivate()}
      />,
    );
  }

  private remount(): void {
    const loc = this.current;
    if (!loc) return;
    this.teardownRoot();
    if (this.host) {
      this.host.remove();
      this.host = null;
    }
    // 旧的隐藏状态可能已失效，重新执行
    this.adapter.restoreNative();
    this.adapter.removeTab();
    this.mount(loc);
  }

  /** 停用 Papers Review，恢复原生视图。 */
  deactivate(): void {
    if (this.state === "idle") return;
    this.state = "idle";
    this.teardownRoot();
    this.adapter.restoreNative();
    this.adapter.setPapersReviewActive(false);
    this.adapter.removeTab();
    if (this.host) {
      this.host.remove();
      this.host = null;
    }
  }

  private teardownRoot(): void {
    this.abortController?.abort();
    this.abortController = null;
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    this.shadow = null;
  }

  stop(): void {
    this.deactivate();
    this.observer?.stop();
    this.observer = null;
    this.domGuard?.disconnect();
    this.domGuard = null;
    if (this.toggleHandler) {
      document.removeEventListener("papers-review:toggle", this.toggleHandler);
      this.toggleHandler = null;
    }
  }

  /** 供调试/测试：当前是否激活。 */
  isActive(): boolean {
    return this.state === "active";
  }
}

export { PAPERS_REVIEW_HOST_ID };
