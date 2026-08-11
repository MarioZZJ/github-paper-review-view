import { useEffect, useState } from "react";
import { makeRequest } from "@/messaging/protocol";

type TabState = "checking" | "pr" | "other";

export function PopupApp() {
  const [tokenLogin, setTokenLogin] = useState<string | null>(null);
  const [tabState, setTabState] = useState<TabState>("checking");
  const [prUrl, setPrUrl] = useState<string>("");

  useEffect(() => {
    void makeRequest({ type: "token.status" }).then((res) => {
      if (res.ok) {
        const data = res.data as { hasToken: boolean; info: { login: string } | null };
        setTokenLogin(data.hasToken ? (data.info?.login ?? "已配置") : null);
      }
    });
    void chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const url = tabs[0]?.url ?? "";
      if (/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+\/(files|changes)/.test(url)) {
        setTabState("pr");
        setPrUrl(url);
      } else {
        setTabState("other");
      }
    });
  }, []);

  const openOptions = () => {
    void chrome.runtime.openOptionsPage();
    window.close();
  };

  const openPrInNewTab = () => {
    void chrome.tabs.create({ url: prUrl });
    window.close();
  };

  return (
    <div className="popup">
      <h1>Papers Review</h1>
      <div className={`status ${tokenLogin ? "ok" : "warn"}`}>
        {tokenLogin ? `✓ Token：${tokenLogin}` : "✗ 未配置 Token"}
      </div>
      {tabState === "pr" ? (
        <button className="btn primary" onClick={openPrInNewTab}>
          在 GitHub PR 中打开 Papers Review
        </button>
      ) : tabState === "checking" ? (
        <div className="muted">检查当前页面…</div>
      ) : (
        <div className="muted">当前页面不是 GitHub PR Files changed。</div>
      )}
      <button className="btn" onClick={openOptions}>
        设置…
      </button>
    </div>
  );
}
