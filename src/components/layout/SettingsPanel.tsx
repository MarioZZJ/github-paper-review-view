import { useEffect, useRef, useState } from "react";
import { makeRequest } from "@/messaging/protocol";
import { useSettingsStore } from "@/storage/settingsStore";
import { useUiStore } from "@/app/uiStore";
import { defaultSettings, type Settings } from "@/domain/settings";

interface TokenStatus {
  hasToken: boolean;
  login: string | null;
  scopes: string[];
}

function useTokenStatus(): [TokenStatus, () => void] {
  const [status, setStatus] = useState<TokenStatus>({ hasToken: false, login: null, scopes: [] });
  const refresh = () => {
    void makeRequest({ type: "token.status" }).then((res) => {
      if (res.ok) {
        const data = res.data as { hasToken: boolean; info: { login: string; scopes: string[] } | null };
        setStatus({
          hasToken: data.hasToken,
          login: data.info?.login ?? null,
          scopes: data.info?.scopes ?? [],
        });
      }
    });
  };
  return [status, refresh];
}

function TokenSection() {
  const [status, refresh] = useTokenStatus();
  const [token, setToken] = useState("");
  const [persist, setPersist] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const verifyAndSave = async () => {
    if (!token.trim()) return;
    setBusy(true);
    setMsg(null);
    const verify = await makeRequest({ type: "token.verify", token: token.trim() });
    if (!verify.ok) {
      setMsg({ ok: false, text: verify.message });
      setBusy(false);
      return;
    }
    const save = await makeRequest({
      type: "token.save",
      token: token.trim(),
      persist,
    });
    if (!save.ok) {
      setMsg({ ok: false, text: save.message });
    } else {
      setMsg({ ok: true, text: "Token 已保存" });
      setToken("");
      refresh();
    }
    setBusy(false);
  };

  const forget = async () => {
    setBusy(true);
    const res = await makeRequest({ type: "token.forget" });
    if (!res.ok) setMsg({ ok: false, text: res.message });
    else setMsg({ ok: true, text: "已移除 Token" });
    setBusy(false);
    refresh();
  };

  return (
    <div className="pr-settings-section">
      <h3>GitHub Token</h3>
      {status.hasToken ? (
        <div className="pr-token-status">
          <p>
            已连接：<strong>{status.login}</strong>
            {status.scopes.length > 0 ? (
              <span className="pr-token-scopes"> scopes: {status.scopes.join(", ")}</span>
            ) : null}
          </p>
          <p className="pr-muted">Token 仅保存在后台扩展上下文，content script 无法读取。</p>
          <button className="pr-btn pr-btn-danger" onClick={forget} disabled={busy}>
            移除 Token
          </button>
        </div>
      ) : (
        <div className="pr-token-form">
          <p className="pr-muted">
            需要 <code>repo</code> 或 <code>public_repo</code> 权限的 PAT（或 fine-grained token）。
            Token 仅用于调用 GitHub REST / GraphQL API。
          </p>
          <input
            type="password"
            className="pr-input"
            placeholder="ghp_... / ghp_..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
          <label className="pr-check">
            <input type="checkbox" checked={persist} onChange={(e) => setPersist(e.target.checked)} />
            在本地记住（不勾选则浏览器会话结束后失效）
          </label>
          <button className="pr-btn pr-btn-primary" onClick={verifyAndSave} disabled={busy || !token.trim()}>
            {busy ? "验证中…" : "验证并保存"}
          </button>
        </div>
      )}
      {msg ? <p className={msg.ok ? "pr-ok" : "pr-error"}>{msg.text}</p> : null}
    </div>
  );
}

function SettingRow<T extends string | number | boolean>(props: {
  label: string;
  hint?: string;
  value: T;
  options?: Array<{ value: string; label: string }>;
  onChange: (v: T) => void;
  type?: "select" | "number" | "toggle";
  min?: number;
  max?: number;
  step?: number;
}) {
  const { label, hint, value, options, onChange, type = "select", min, max, step } = props;
  return (
    <div className="pr-setting-row">
      <div className="pr-setting-label">
        <span>{label}</span>
        {hint ? <span className="pr-muted">{hint}</span> : null}
      </div>
      {type === "select" && options ? (
        <select
          className="pr-select"
          value={String(value)}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : type === "number" ? (
        <input
          type="number"
          className="pr-input pr-input-number"
          min={min}
          max={max}
          step={step}
          value={Number(value)}
          onChange={(e) => onChange(Number(e.target.value) as T)}
        />
      ) : (
        <input
          type="checkbox"
          className="pr-toggle"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked as T)}
        />
      )}
    </div>
  );
}

export function SettingsPanel() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const reset = useSettingsStore((s) => s.reset);
  const close = useUiStore((s) => s.toggleSettings);
  const [customMacrosText, setCustomMacrosText] = useState(settings.customMacros.join("\n"));
  const macrosDirty = useRef(false);

  useEffect(() => {
    if (!macrosDirty.current) setCustomMacrosText(settings.customMacros.join("\n"));
  }, [settings.customMacros]);

  const up = (patch: Partial<Settings>) => void update(patch);

  return (
    <div className="pr-settings-overlay" onClick={close}>
      <div className="pr-settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="pr-settings-header">
          <h2>设置</h2>
          <button className="pr-btn pr-btn-ghost" onClick={close}>
            ✕
          </button>
        </div>
        <div className="pr-settings-body">
          <TokenSection />

          <div className="pr-settings-section">
            <h3>阅读</h3>
            <SettingRow
              label="默认视图"
              value={settings.viewMode}
              options={[
                { value: "final", label: "定稿" },
                { value: "original", label: "原稿" },
                { value: "split", label: "对照" },
                { value: "raw", label: "源码" },
              ]}
              onChange={(v) => up({ viewMode: v as Settings["viewMode"] })}
            />
            <SettingRow
              label="字号 (px)"
              type="number"
              min={14}
              max={24}
              value={settings.fontSize}
              onChange={(v) => up({ fontSize: v as number })}
            />
            <SettingRow
              label="行距"
              type="number"
              min={1.45}
              max={2}
              step={0.05}
              value={settings.lineHeight}
              onChange={(v) => up({ lineHeight: v as number })}
            />
            <SettingRow
              label="正文宽度 (px)"
              type="number"
              min={760}
              max={1200}
              step={20}
              value={settings.paperWidth}
              onChange={(v) => up({ paperWidth: v as number })}
            />
            <SettingRow
              label="正文字体"
              value={settings.bodyFont}
              options={[
                { value: "serif", label: "衬线" },
                { value: "system", label: "系统" },
                { value: "mono", label: "等宽" },
              ]}
              onChange={(v) => up({ bodyFont: v as Settings["bodyFont"] })}
            />
            <SettingRow
              label="主题"
              value={settings.theme}
              options={[
                { value: "auto", label: "跟随系统" },
                { value: "light", label: "浅色" },
                { value: "dark", label: "深色" },
                { value: "dimmed", label: "Dimmed" },
              ]}
              onChange={(v) => up({ theme: v as Settings["theme"] })}
            />
          </div>

          <div className="pr-settings-section">
            <h3>修订显示</h3>
            <SettingRow
              label="显示删除块"
              hint="关闭后所有删除内容折叠"
              type="toggle"
              value={settings.showDeleted}
              onChange={(v) => up({ showDeleted: v as boolean })}
            />
            <SettingRow
              label="显示 TeX 注释行"
              type="toggle"
              value={settings.showTexComments}
              onChange={(v) => up({ showTexComments: v as boolean })}
            />
            <SettingRow
              label="展开复杂环境源码"
              hint="verbatim / tikz / 表格 等"
              type="toggle"
              value={settings.expandEnvironments}
              onChange={(v) => up({ expandEnvironments: v as boolean })}
            />
          </div>

          <div className="pr-settings-section">
            <h3>评论</h3>
            <SettingRow
              label="引文显示"
              value={settings.citationDisplay}
              options={[
                { value: "authorYear", label: "作者-年份" },
                { value: "key", label: "bib key" },
              ]}
              onChange={(v) => up({ citationDisplay: v as Settings["citationDisplay"] })}
            />
            <SettingRow
              label="默认发布方式"
              value={settings.defaultPublishAction}
              options={[
                { value: "pending", label: "待定 (pending review)" },
                { value: "direct", label: "立即发布" },
              ]}
              onChange={(v) => up({ defaultPublishAction: v as Settings["defaultPublishAction"] })}
            />
            <SettingRow
              label="默认评论侧"
              value={settings.defaultSide}
              options={[
                { value: "RIGHT", label: "新版本 (head)" },
                { value: "LEFT", label: "旧版本 (base)" },
              ]}
              onChange={(v) => up({ defaultSide: v as Settings["defaultSide"] })}
            />
            <SettingRow
              label="已解决 thread 折叠"
              type="toggle"
              value={settings.collapseResolved}
              onChange={(v) => up({ collapseResolved: v as boolean })}
            />
            <SettingRow
              label="保存精确选择高亮"
              type="toggle"
              value={settings.saveSelectionHighlights}
              onChange={(v) => up({ saveSelectionHighlights: v as boolean })}
            />
          </div>

          <div className="pr-settings-section">
            <h3>自定义宏（KaTeX）</h3>
            <p className="pr-muted">每行一个，格式 <code>\name = body</code>，body 中可用 #1 #2。</p>
            <textarea
              className="pr-textarea"
              rows={4}
              value={customMacrosText}
              onChange={(e) => {
                macrosDirty.current = true;
                setCustomMacrosText(e.target.value);
              }}
              onBlur={() => {
                up({
                  customMacros: customMacrosText
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean),
                });
                macrosDirty.current = false;
              }}
            />
          </div>

          <div className="pr-settings-footer">
            <button className="pr-btn" onClick={() => void reset()}>
              恢复默认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
