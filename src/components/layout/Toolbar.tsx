import {
  CommentIcon,
  GearIcon,
  SidebarCollapseIcon,
  SidebarExpandIcon,
  ArrowLeftIcon,
  XCircleIcon,
} from "@primer/octicons-react";
import { useUiStore } from "@/app/uiStore";
import { useSettingsStore } from "@/storage/settingsStore";
import type { ViewMode } from "@/domain/settings";

const VIEW_MODES: Array<{ id: ViewMode; label: string }> = [
  { id: "final", label: "定稿" },
  { id: "original", label: "原稿" },
  { id: "split", label: "对照" },
  { id: "raw", label: "源码" },
];

export interface ToolbarProps {
  title: string;
  stats: { added: number; deleted: number; modified: number } | null;
  fileCount: number;
  hasToken: boolean;
  onBack: () => void;
  onOpenTokenSettings: () => void;
}

export function Toolbar({ title, stats, fileCount, hasToken, onBack, onOpenTokenSettings }: ToolbarProps) {
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const toggleSettings = useUiStore((s) => s.toggleSettings);
  const outlineOpen = useUiStore((s) => s.outlineOpen);
  const toggleOutline = useUiStore((s) => s.toggleOutline);
  const commentsOpen = useUiStore((s) => s.commentsOpen);
  const toggleComments = useUiStore((s) => s.toggleComments);
  const settings = useSettingsStore((s) => s.settings);

  return (
    <div className="pr-toolbar">
      <button className="pr-btn pr-btn-ghost" onClick={onBack} title="返回 GitHub Files changed">
        <ArrowLeftIcon size={16} />
      </button>
      <div className="pr-toolbar-title" title={title}>
        {title || "Papers Review"}
        {fileCount > 0 ? <span className="pr-toolbar-files">{fileCount} 个文件</span> : null}
      </div>

      <div className="pr-view-switcher" role="tablist" aria-label="视图">
        {VIEW_MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={viewMode === m.id}
            className={`pr-view-btn${viewMode === m.id ? " active" : ""}`}
            onClick={() => setViewMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {stats ? (
        <div className="pr-toolbar-stats" title="增 / 删 / 改（句子级）">
          <span className="pr-stat-add">+{stats.added}</span>
          <span className="pr-stat-del">−{stats.deleted}</span>
          <span className="pr-stat-mod">~{stats.modified}</span>
        </div>
      ) : null}

      <div className="pr-toolbar-spacer" />

      <button
        className={`pr-btn pr-btn-ghost${outlineOpen ? " active" : ""}`}
        onClick={toggleOutline}
        title="文件 / 章节"
      >
        {outlineOpen ? <SidebarExpandIcon size={16} /> : <SidebarCollapseIcon size={16} />}
      </button>
      <button
        className={`pr-btn pr-btn-ghost${commentsOpen ? " active" : ""}`}
        onClick={toggleComments}
        title="评论面板"
      >
        <CommentIcon size={16} />
      </button>
      <button className="pr-btn pr-btn-ghost" onClick={toggleSettings} title="设置">
        <GearIcon size={16} />
      </button>
      {!hasToken ? (
        <button className="pr-btn pr-btn-warn" onClick={onOpenTokenSettings} title="需要配置 GitHub token">
          <XCircleIcon size={14} /> 未配置 Token
        </button>
      ) : null}
      <span className="pr-toolbar-mode">{settings.theme}</span>
    </div>
  );
}
