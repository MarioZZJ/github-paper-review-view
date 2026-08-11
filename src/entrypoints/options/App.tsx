import { useEffect, useState } from "react";
import { makeRequest } from "@/messaging/protocol";
import { useSettingsStore } from "@/storage/settingsStore";

/** 设置页：token 管理 + 阅读偏好。 */
export function OptionsApp() {
  const load = useSettingsStore((s) => s.load);
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const reset = useSettingsStore((s) => s.reset);
  const [tokenStatus, setTokenStatus] = useState<string>("加载中…");
  const [token, setToken] = useState("");
  const [persist, setPersist] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void load();
    void makeRequest({ type: "token.status" }).then((res) => {
      if (res.ok) {
        const data = res.data as { hasToken: boolean; info: { login: string } | null };
        setTokenStatus(
          data.hasToken ? `已连接：${data.info?.login ?? "?"}` : "未配置 Token",
        );
      } else {
        setTokenStatus("无法访问后台");
      }
    });
  }, [load]);

  const save = async () => {
    if (!token.trim()) return;
    setBusy(true);
    setMsg(null);
    const verify = await makeRequest({ type: "token.verify", token: token.trim() });
    if (!verify.ok) {
      setMsg({ ok: false, text: verify.message });
      setBusy(false);
      return;
    }
    const res = await makeRequest({ type: "token.save", token: token.trim(), persist });
    setMsg(res.ok ? { ok: true, text: "Token 已保存" } : { ok: false, text: res.message });
    setBusy(false);
    setToken("");
    void makeRequest({ type: "token.status" }).then((r) => {
      if (r.ok) {
        const data = r.data as { hasToken: boolean; info: { login: string } | null };
        setTokenStatus(data.hasToken ? `已连接：${data.info?.login ?? "?"}` : "未配置 Token");
      }
    });
  };

  return (
    <div className="options-shell">
      <h1>Papers Review for GitHub — 设置</h1>

      <section>
        <h2>GitHub Token</h2>
        <p className="muted">
          当前状态：<strong>{tokenStatus}</strong>
        </p>
        <p className="muted">
          Token 需要 <code>repo</code> 或 <code>public_repo</code> 权限，仅保存在后台扩展上下文。
        </p>
        <div className="row">
          <input
            type="password"
            placeholder="ghp_…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <label>
            <input type="checkbox" checked={persist} onChange={(e) => setPersist(e.target.checked)} />
            记住（浏览器会话结束后失效需重配）
          </label>
        </div>
        <button className="btn primary" onClick={save} disabled={busy || !token.trim()}>
          {busy ? "验证中…" : "验证并保存"}
        </button>
        <button
          className="btn"
          onClick={async () => {
            const res = await makeRequest({ type: "token.forget" });
            setMsg(res.ok ? { ok: true, text: "已移除" } : { ok: false, text: res.message });
            setTokenStatus("未配置 Token");
          }}
        >
          移除 Token
        </button>
        {msg ? <p className={msg.ok ? "ok" : "err"}>{msg.text}</p> : null}
      </section>

      <section>
        <h2>阅读偏好</h2>
        <div className="grid">
          <label>
            默认视图
            <select
              value={settings.viewMode}
              onChange={(e) =>
                void update({ viewMode: e.target.value as typeof settings.viewMode })
              }
            >
              <option value="final">定稿</option>
              <option value="original">原稿</option>
              <option value="split">对照</option>
              <option value="raw">源码</option>
            </select>
          </label>
          <label>
            主题
            <select
              value={settings.theme}
              onChange={(e) => void update({ theme: e.target.value as typeof settings.theme })}
            >
              <option value="auto">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
              <option value="dimmed">Dimmed</option>
            </select>
          </label>
          <label>
            字号 (px)
            <input
              type="number"
              min={14}
              max={24}
              value={settings.fontSize}
              onChange={(e) => void update({ fontSize: Number(e.target.value) })}
            />
          </label>
          <label>
            行距
            <input
              type="number"
              min={1.45}
              max={2}
              step={0.05}
              value={settings.lineHeight}
              onChange={(e) => void update({ lineHeight: Number(e.target.value) })}
            />
          </label>
          <label>
            正文字体
            <select
              value={settings.bodyFont}
              onChange={(e) =>
                void update({ bodyFont: e.target.value as typeof settings.bodyFont })
              }
            >
              <option value="serif">衬线</option>
              <option value="system">系统</option>
              <option value="mono">等宽</option>
            </select>
          </label>
          <label>
            引文显示
            <select
              value={settings.citationDisplay}
              onChange={(e) =>
                void update({ citationDisplay: e.target.value as typeof settings.citationDisplay })
              }
            >
              <option value="authorYear">作者-年份</option>
              <option value="key">bib key</option>
            </select>
          </label>
          <label>
            默认发布方式
            <select
              value={settings.defaultPublishAction}
              onChange={(e) =>
                void update({
                  defaultPublishAction: e.target.value as typeof settings.defaultPublishAction,
                })
              }
            >
              <option value="pending">待定 (pending review)</option>
              <option value="direct">立即发布</option>
            </select>
          </label>
        </div>
        <div className="checks">
          <label>
            <input
              type="checkbox"
              checked={settings.showDeleted}
              onChange={(e) => void update({ showDeleted: e.target.checked })}
            />
            显示删除块
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.showTexComments}
              onChange={(e) => void update({ showTexComments: e.target.checked })}
            />
            显示 TeX 注释行
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.expandEnvironments}
              onChange={(e) => void update({ expandEnvironments: e.target.checked })}
            />
            展开复杂环境源码
          </label>
        </div>
        <button className="btn" onClick={() => void reset()}>
          恢复默认
        </button>
      </section>
    </div>
  );
}
