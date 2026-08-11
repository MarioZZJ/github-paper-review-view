import { useEffect, useMemo, useRef, useState } from "react";
import { AlignedBlockView, SentenceView, type BlockViewsProps } from "./BlockViews";
import { useUiStore } from "@/app/uiStore";
import { useSettingsStore } from "@/storage/settingsStore";
import { useComposerStore } from "@/reviews/composerStore";
import { selectionToAnchor } from "@/selection/selection";
import { InlineRenderer } from "@/tex/renderAst";
import { renderMath } from "@/tex/renderMath";
import { Spinner } from "@/components/common/Spinner";
import type { ReviewDocument } from "@/revisions/buildReviewDocument";
import type { ParsedManuscript } from "@/tex/types";
import type { CommentableIndexByFile } from "@/source/commentableLines";
import type { ReviewThread } from "@/domain/review";

export interface ManuscriptViewProps {
  path: string;
  doc: ReviewDocument | null;
  baseParsed: ParsedManuscript | null;
  headParsed: ParsedManuscript | null;
  commentableIndex: CommentableIndexByFile | undefined;
  threads: ReviewThread[];
  loading: boolean;
  error: string | null;
  onComment: (side: "LEFT" | "RIGHT", line: number, quote?: string) => void;
  onThreadClick: (t: ReviewThread) => void;
}

function buildThreadsByLine(threads: ReviewThread[]): Map<string, ReviewThread[]> {
  const map = new Map<string, ReviewThread[]>();
  for (const t of threads) {
    if (t.line === null) continue;
    const side = t.diffSide ?? "RIGHT";
    const key = `${side}:${t.line}`;
    const list = map.get(key) ?? [];
    list.push(t);
    map.set(key, list);
  }
  return map;
}

/** 原稿视图：渲染 base blocks。 */
function OriginalView({
  parsed,
  props,
}: {
  parsed: ParsedManuscript | null;
  props: BlockViewsProps;
}) {
  if (!parsed) return null;
  return (
    <div className="pr-paper">
      {parsed.blocks.map((b) => {
        switch (b.type) {
          case "heading":
            return (
              <div key={b.id} className={`pr-heading-line lv-${b.level}`} data-path={b.span.path} data-side={b.span.side} data-line={b.span.startLine}>
                <InlineRenderer nodes={b.title} />
              </div>
            );
          case "math": {
            const { html, failed } = renderMath(b.tex, true);
            return (
              <div key={b.id} className="pr-math-line" data-path={b.span.path} data-side={b.span.side} data-line={b.span.startLine}>
                {failed || !html ? <pre className="pr-math-fallback">{b.tex}</pre> : <div className="pr-math-display" dangerouslySetInnerHTML={{ __html: html }} />}
              </div>
            );
          }
          case "fallback":
            return (
              <div key={b.id} className="pr-fallback-block" data-path={b.span.path} data-line={b.span.startLine}>
                <pre className="pr-fallback-raw">{b.raw}</pre>
              </div>
            );
          case "texcomment":
            return props.showTexComments ? (
              <div key={b.id} className="pr-texcomment-line">{b.text}</div>
            ) : null;
          case "list":
            return (
              <div key={b.id} className="pr-list">
                {b.items.map((item) => (
                  <div key={item.id} className="pr-list-item">
                    <span className="pr-list-marker">{b.ordered ? "•" : "•"}</span>
                    <InlineRenderer nodes={item.inline} />
                  </div>
                ))}
              </div>
            );
          case "paragraph":
          case "quote":
            return (
              <div key={b.id} className={`pr-block pr-paragraph${b.type === "quote" ? " pr-quote" : ""}`}>
                {b.sentences.map((s) => (
                  <span
                    key={s.id}
                    className="pr-sentence"
                    data-path={s.span.path}
                    data-side={s.span.side}
                    data-line={s.span.startLine}
                    data-commentable={s.commentable ? "true" : "false"}
                  >
                    <InlineRenderer nodes={s.inline} />
                  </span>
                ))}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

/** 源码视图。 */
function RawView({
  parsed,
  commentableIndex,
  path,
}: {
  parsed: ParsedManuscript | null;
  commentableIndex: CommentableIndexByFile | undefined;
  path: string;
}) {
  if (!parsed) return null;
  const index = commentableIndex?.get(path);
  return (
    <div className="pr-raw-view">
      {parsed.lineList.map((l) => {
        const commentable = index?.get("RIGHT")?.has(l.number) ?? false;
        return (
          <div
            key={l.number}
            className={`pr-raw-line${commentable ? " commentable" : ""}`}
            data-path={path}
            data-side="RIGHT"
            data-line={l.number}
            data-commentable={commentable ? "true" : "false"}
          >
            <span className="pr-raw-num">{l.number}</span>
            <code className="pr-raw-code">{l.raw || " "}</code>
          </div>
        );
      })}
    </div>
  );
}

/** 对照视图：左右双栏。 */
function SplitView({
  doc,
  props,
}: {
  doc: ReviewDocument;
  props: BlockViewsProps;
}) {
  return (
    <div className="pr-split-view">
      <div className="pr-split-col pr-split-base">
        <div className="pr-split-head">Base（原稿）</div>
        {doc.blocks.map((b) =>
          b.sentences.length > 0 ? (
            b.sentences.map((s) =>
              s.base ? (
                <span
                  key={s.id}
                  className={`pr-sentence${s.kind === "deleted" ? " pr-sentence-deleted" : ""}`}
                  data-path={s.base.span.path}
                  data-side="LEFT"
                  data-line={s.base.span.startLine}
                >
                  <InlineRenderer nodes={s.base.inline} />
                </span>
              ) : null,
            )
          ) : b.headBlock ? (
            <span key={b.id} className="pr-split-block-label">
              {b.headBlock.type === "heading" ? `§ ${b.headBlock.titleText}` : ""}
            </span>
          ) : null,
        )}
      </div>
      <div className="pr-split-col pr-split-head-col">
        <div className="pr-split-head">Head（新稿）</div>
        {doc.blocks.map((b) =>
          b.sentences.length > 0 ? (
            b.sentences.map((s) => (
              <SentenceView key={s.id} sentence={s} props={props} view="split" />
            ))
          ) : b.headBlock ? (
            <span key={b.id} className="pr-split-block-label">
              {b.headBlock.type === "heading" ? `§ ${b.headBlock.titleText}` : ""}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

export function ManuscriptView({
  path,
  doc,
  baseParsed,
  headParsed,
  commentableIndex,
  threads,
  loading,
  error,
  onComment,
  onThreadClick,
}: ManuscriptViewProps) {
  const viewMode = useUiStore((s) => s.viewMode);
  const scrollTarget = useUiStore((s) => s.scrollTarget);
  const clearScroll = useUiStore((s) => s.clearScroll);
  const openComposer = useComposerStore((s) => s.openComposer);
  const settings = useSettingsStore((s) => s.settings);
  const containerRef = useRef<HTMLDivElement>(null);
  const threadsByLine = useMemo(() => buildThreadsByLine(threads), [threads]);

  // 选择 → 浮动评论按钮
  const [popover, setPopover] = useState<{ x: number; y: number; quote: string; anchorKey: string } | null>(null);
  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest(".pr-paper, .pr-split-view, .pr-raw-view")) {
        setPopover(null);
        return;
      }
      window.setTimeout(() => {
        const result = selectionToAnchor(commentableIndex);
        if (!result.anchor) {
          setPopover(null);
          return;
        }
        const sel = window.getSelection();
        const rect = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : null;
        if (!rect) return;
        setPopover({
          x: Math.min(rect.left, window.innerWidth - 200),
          y: rect.bottom + 6,
          quote: result.anchor.quote,
          anchorKey: `${result.anchor.side}:${result.anchor.startLine}-${result.anchor.endLine}`,
        });
      }, 0);
    };
    const onScroll = () => setPopover(null);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [commentableIndex]);

  // 滚动到目标行
  useEffect(() => {
    if (!scrollTarget || scrollTarget.path !== path) return;
    const el = containerRef.current?.querySelector(
      `[data-side="${scrollTarget.side}"][data-line="${scrollTarget.line}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("pr-line-flash");
      window.setTimeout(() => el.classList.remove("pr-line-flash"), 1600);
    }
    clearScroll();
  }, [scrollTarget, path, clearScroll]);

  const blockProps: BlockViewsProps = {
    showDeleted: settings.showDeleted,
    expandEnvironments: settings.expandEnvironments,
    showTexComments: settings.showTexComments,
    threadsByLine,
    onComment,
    onThreadClick,
  };

  return (
    <main className="pr-manuscript" ref={containerRef}>
      {loading && !doc ? (
        <div className="pr-loading">
          <Spinner label="正在解析论文…" />
        </div>
      ) : error && !doc ? (
        <div className="pr-error-box">{error}</div>
      ) : viewMode === "original" ? (
        <OriginalView parsed={baseParsed} props={blockProps} />
      ) : viewMode === "raw" ? (
        <RawView parsed={headParsed} commentableIndex={commentableIndex} path={path} />
      ) : viewMode === "split" ? (
        doc ? (
          <SplitView doc={doc} props={blockProps} />
        ) : (
          <div className="pr-loading"><Spinner label="正在对齐…" /></div>
        )
      ) : doc ? (
        <div className="pr-paper">
          {doc.blocks.map((b) => (
            <AlignedBlockView key={b.id} block={b} props={blockProps} />
          ))}
          {doc.blocks.length === 0 ? (
            <div className="pr-muted">该文件无可渲染内容。</div>
          ) : null}
        </div>
      ) : (
        <div className="pr-loading"><Spinner label="正在解析论文…" /></div>
      )}

      {popover ? (
        <div className="pr-selection-popover" style={{ left: popover.x, top: popover.y }}>
          <button
            className="pr-btn pr-btn-primary pr-btn-sm"
            onClick={() => {
              const result = selectionToAnchor(commentableIndex);
              if (result.anchor) {
                openComposer(result.anchor);
                window.getSelection()?.removeAllRanges();
              }
              setPopover(null);
            }}
          >
            评论
          </button>
          <span className="pr-selection-quote" title={popover.quote}>
            {popover.quote.length > 40 ? `${popover.quote.slice(0, 40)}…` : popover.quote}
          </span>
        </div>
      ) : null}
    </main>
  );
}
