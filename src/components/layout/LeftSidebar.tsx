import { FileAddedIcon, FileRemovedIcon, FileMovedIcon, ChevronRightIcon, ChevronDownIcon } from "@primer/octicons-react";
import { useUiStore } from "@/app/uiStore";
import type { RestPullFile } from "@/api/rest";
import type { OutlineItem } from "@/tex/types";
import type { ReviewDocument } from "@/revisions/buildReviewDocument";

function statusIcon(status: RestPullFile["status"]) {
  switch (status) {
    case "added":
      return <FileAddedIcon size={14} className="pr-file-status add" />;
    case "removed":
      return <FileRemovedIcon size={14} className="pr-file-status del" />;
    default:
      return <FileMovedIcon size={14} className="pr-file-status mod" />;
  }
}

export interface LeftSidebarProps {
  files: RestPullFile[];
  activePath: string | null;
  /** 当前文件的大纲。 */
  outline: OutlineItem[] | null;
  onSelectFile: (path: string) => void;
  statsByPath: Map<string, { added: number; deleted: number; modified: number }>;
  doc: ReviewDocument | null;
}

export function LeftSidebar({
  files,
  activePath,
  outline,
  onSelectFile,
  statsByPath,
  doc,
}: LeftSidebarProps) {
  const outlineOpen = useUiStore((s) => s.outlineOpen);
  const requestScroll = useUiStore((s) => s.requestScroll);
  if (!outlineOpen) return null;

  return (
    <aside className="pr-left-sidebar">
      <div className="pr-sidebar-header">文件</div>
      <div className="pr-file-list">
        {files.map((f) => {
          const stats = statsByPath.get(f.filename);
          const active = f.filename === activePath;
          return (
            <div key={f.filename}>
              <button
                className={`pr-file-item${active ? " active" : ""}`}
                onClick={() => onSelectFile(f.filename)}
                title={f.filename}
              >
                <span className="pr-file-chevron">{active && outline ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}</span>
                {statusIcon(f.status)}
                <span className="pr-file-name">{f.filename.split("/").pop()}</span>
                {stats ? (
                  <span className="pr-file-stats">
                    {stats.added > 0 ? <span className="pr-stat-add">+{stats.added}</span> : null}
                    {stats.deleted > 0 ? <span className="pr-stat-del">−{stats.deleted}</span> : null}
                  </span>
                ) : null}
              </button>
              {active && outline ? (
                <div className="pr-outline">
                  {outline.map((o) => (
                    <button
                      key={o.id}
                      className={`pr-outline-item lv-${o.level}`}
                      onClick={() => requestScroll(doc?.path ?? activePath!, o.span.side, o.span.startLine)}
                    >
                      {o.title}
                    </button>
                  ))}
                  {outline.length === 0 ? <div className="pr-muted pr-outline-empty">（无章节）</div> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
