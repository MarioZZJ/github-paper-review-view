import { parsePullRequestUrl } from "./githubUrl";
import type { PullRequestLocation } from "@/domain/pullRequest";

/**
 * SPA 导航观察器：
 * - 监听 popstate / hashchange / turbo 事件；
 * - 轻量轮询 location.href；
 * - DOM 变化时校验 PR 特征是否出现（SPA 渲染完成）。
 */
export class NavigationObserver {
  private lastUrl: string;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private domObserver: MutationObserver | null = null;
  private stopped = false;

  constructor(private readonly onChange: (loc: PullRequestLocation | null) => void) {
    this.lastUrl = window.location.href;
  }

  start(): void {
    if (this.stopped) return;
    window.addEventListener("popstate", this.handleUrlEvent);
    window.addEventListener("hashchange", this.handleUrlEvent);
    document.addEventListener("turbo:load", this.handleUrlEvent);
    document.addEventListener("turbo:render", this.handleUrlEvent);
    this.pollTimer = setInterval(() => this.check(), 250);
    this.domObserver = new MutationObserver(() => this.check());
    this.domObserver.observe(document.documentElement, { childList: true, subtree: true });
    // 初始检查
    this.check();
  }

  private handleUrlEvent = (): void => {
    this.check();
  };

  private check(): void {
    if (this.stopped) return;
    const url = window.location.href;
    const loc = parsePullRequestUrl(url);
    this.onChange(loc);
    this.lastUrl = url;
  }

  stop(): void {
    this.stopped = true;
    window.removeEventListener("popstate", this.handleUrlEvent);
    window.removeEventListener("hashchange", this.handleUrlEvent);
    document.removeEventListener("turbo:load", this.handleUrlEvent);
    document.removeEventListener("turbo:render", this.handleUrlEvent);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.domObserver?.disconnect();
    this.domObserver = null;
  }
}
