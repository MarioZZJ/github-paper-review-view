import { memo, useState } from "react";
import { InlineRenderer } from "@/tex/renderAst";
import { renderMath } from "@/tex/renderMath";
import type { AlignedBlock, AlignedSentence } from "@/revisions/buildReviewDocument";
import type { ReviewThread } from "@/domain/review";
import type { ManuscriptBlock } from "@/tex/types";

export interface BlockViewsProps {
  showDeleted: boolean;
  expandEnvironments: boolean;
  showTexComments: boolean;
  threadsByLine: Map<string, ReviewThread[]>;
  onComment: (side: "LEFT" | "RIGHT", line: number, quote?: string) => void;
  onThreadClick: (t: ReviewThread) => void;
  /** 只读模式（如 commit 视图）：隐藏行内评论入口。 */
  readOnly?: boolean;
}

/** 修改句：新文本 + 可折叠旧文本。 */
function ModifiedSentence({ sentence, props }: { sentence: AlignedSentence; props: BlockViewsProps }) {
  const [showOld, setShowOld] = useState(false);
  const head = sentence.head;
  const base = sentence.base;
  if (!head) return null;
  return (
    <span
      className="pr-sentence pr-sentence-modified"
      data-path={head.span.path}
      data-side={head.span.side}
      data-line={head.span.startLine}
      data-commentable={head.commentable ? "true" : "false"}
    >
      <InlineRenderer nodes={head.inline} />
      {props.showDeleted && base ? (
        <span className="pr-modified-old-wrap">
          <button
            className="pr-old-toggle"
            onClick={() => setShowOld((v) => !v)}
            title={showOld ? "收起旧文本" : "显示旧文本"}
          >
            {showOld ? "▾" : "▸"}
          </button>
          {showOld ? (
            <span className="pr-old-text">
              {sentence.wordParts ? (
                sentence.wordParts.oldTokens
                  .filter((t) => t.type === "del" || t.type === "same")
                  .map((t, i) =>
                    t.type === "del" ? (
                      <del key={i} className="pr-w-del">
                        {t.text}
                      </del>
                    ) : (
                      <span key={i}>{t.text}</span>
                    ),
                  )
              ) : (
                base.text
              )}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/** 单个句子（含修订标识）。 */
export function SentenceView({
  sentence,
  props,
  view,
}: {
  sentence: AlignedSentence;
  props: BlockViewsProps;
  view: "final" | "split";
}) {
  const { base, head, kind } = sentence;
  const cls = [`pr-sentence`];
  const commentable = (head ?? base)?.commentable ?? false;
  const side = (head ?? base)?.span.side ?? "RIGHT";
  const line = (head ?? base)?.span.startLine ?? 0;
  const path = (head ?? base)?.span.path ?? "";
  const threadKey = `${side}:${line}`;
  const threads = props.threadsByLine.get(threadKey) ?? [];
  const [hover, setHover] = useState(false);

  if (kind === "modified" && view === "final") {
    return (
      <span
        className={cls.join(" ")}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <ModifiedSentence sentence={sentence} props={props} />
        {hover && commentable && !props.readOnly ? (
          <button
            className="pr-inline-comment-btn"
            onClick={(e) => {
              e.stopPropagation();
              props.onComment(side, line);
            }}
          >
            ＋ 评论
          </button>
        ) : null}
        {threads.length > 0 ? <ThreadBadge threads={threads} onClick={() => props.onThreadClick(threads[0]!)} /> : null}
      </span>
    );
  }

  if (kind === "deleted") {
    return (
      <span
        className="pr-sentence pr-sentence-deleted"
        data-path={base?.span.path ?? ""}
        data-side={base?.span.side ?? "LEFT"}
        data-line={base?.span.startLine ?? 0}
        data-commentable={base?.commentable ? "true" : "false"}
        title="已删除"
      >
        {base ? <InlineRenderer nodes={base.inline} /> : null}
      </span>
    );
  }

  if (kind === "added") {
    return (
      <span
        className="pr-sentence pr-sentence-added"
        data-path={head?.span.path ?? ""}
        data-side={head?.span.side ?? "RIGHT"}
        data-line={head?.span.startLine ?? 0}
        data-commentable={head?.commentable ? "true" : "false"}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {head ? <InlineRenderer nodes={head.inline} /> : null}
        {hover && commentable && !props.readOnly ? (
          <button
            className="pr-inline-comment-btn"
            onClick={(e) => {
              e.stopPropagation();
              props.onComment(side, line);
            }}
          >
            ＋ 评论
          </button>
        ) : null}
        {threads.length > 0 ? <ThreadBadge threads={threads} onClick={() => props.onThreadClick(threads[0]!)} /> : null}
      </span>
    );
  }

  // unchanged
  return (
    <span
      className="pr-sentence"
      data-path={head?.span.path ?? path}
      data-side={side}
      data-line={line}
      data-commentable={commentable ? "true" : "false"}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {head ? <InlineRenderer nodes={head.inline} /> : null}
      {hover && commentable && !props.readOnly ? (
        <button
          className="pr-inline-comment-btn"
          onClick={(e) => {
            e.stopPropagation();
            props.onComment(side, line);
          }}
        >
          ＋ 评论
        </button>
      ) : null}
      {threads.length > 0 ? <ThreadBadge threads={threads} onClick={() => props.onThreadClick(threads[0]!)} /> : null}
    </span>
  );
}

function ThreadBadge({ threads, onClick }: { threads: ReviewThread[]; onClick: () => void }) {
  const unresolved = threads.filter((t) => !t.isResolved).length;
  return (
    <button className="pr-thread-badge" onClick={(e) => { e.stopPropagation(); onClick(); }} title={`${threads.length} 条评论`}>
      💬 {threads.length}
      {unresolved > 0 ? <span className="pr-thread-unresolved">{unresolved}</span> : null}
    </button>
  );
}

function MathBlockView({ block }: { block: Extract<ManuscriptBlock, { type: "math" }> }) {
  const { html, failed } = renderMath(block.tex, true);
  return (
    <div
      className="pr-math-line"
      data-path={block.span.path}
      data-side={block.span.side}
      data-line={block.span.startLine}
      data-commentable="false"
    >
      {failed || !html ? <pre className="pr-math-fallback">{block.tex}</pre> : <div className="pr-math-display" dangerouslySetInnerHTML={{ __html: html }} />}
    </div>
  );
}

function FallbackBlockView({ block, expandEnvironments }: { block: Extract<ManuscriptBlock, { type: "fallback" }>; expandEnvironments: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const show = expandEnvironments || expanded;
  return (
    <div className="pr-fallback-block" data-path={block.span.path} data-side={block.span.side} data-line={block.span.startLine}>
      <button className="pr-fallback-toggle" onClick={() => setExpanded((v) => !v)}>
        {show ? "▾" : "▸"} {block.env} 环境源码
      </button>
      {show ? <pre className="pr-fallback-raw">{block.raw}</pre> : null}
    </div>
  );
}

function HeadingView({ block, kind }: { block: Extract<ManuscriptBlock, { type: "heading" }>; kind: AlignedBlock["kind"] }) {
  return (
    <div
      className={`pr-heading-line lv-${block.level}${kind === "added" ? " pr-block-added" : ""}${kind === "modified" ? " pr-block-modified" : ""}`}
      data-path={block.span.path}
      data-side={block.span.side}
      data-line={block.span.startLine}
      data-commentable="false"
    >
      <InlineRenderer nodes={block.title} />
    </div>
  );
}

function TexCommentView({ block }: { block: Extract<ManuscriptBlock, { type: "texcomment" }> }) {
  return (
    <div className="pr-texcomment-line" data-path={block.span.path} data-side={block.span.side} data-line={block.span.startLine}>
      {block.text}
    </div>
  );
}

/** 渲染单个 AlignedBlock（final 视图）。 */
export const AlignedBlockView = memo(function AlignedBlockView({
  block,
  props,
}: {
  block: AlignedBlock;
  props: BlockViewsProps;
}) {
  if (block.kind === "deleted" || (block.sentences.length > 0 && block.sentences.every((s) => s.kind === "deleted"))) {
    if (!props.showDeleted) return null;
    return (
      <div className="pr-block pr-deleted-block">
        <div className="pr-deleted-head" title="已删除内容">
          已删除 {block.sentences.length} 句
        </div>
        <div className="pr-deleted-body">
          {block.sentences.map((s) => (
            <SentenceView key={s.id} sentence={s} props={props} view="final" />
          ))}
        </div>
      </div>
    );
  }

  const hb = block.headBlock;
  if (!hb) {
    // 理论不出现：head 框架
    return null;
  }
  const kindCls =
    block.kind === "added"
      ? " pr-block-added"
      : block.kind === "modified"
        ? " pr-block-modified"
        : "";

  switch (hb.type) {
    case "heading":
      return <HeadingView block={hb} kind={block.kind} />;
    case "math":
      return <MathBlockView block={hb} />;
    case "fallback":
      return <FallbackBlockView block={hb} expandEnvironments={props.expandEnvironments} />;
    case "texcomment":
      return props.showTexComments ? <TexCommentView block={hb} /> : null;
    case "list":
      return (
        <div className={`pr-block pr-list${kindCls}`}>
          {hb.items.map((item) => {
            const a = block.sentences.find((s) => s.id === item.id);
            if (a) {
              return (
                <div key={item.id} className="pr-list-item">
                  <span className="pr-list-marker">{hb.ordered ? "1." : "•"}</span>
                  <SentenceView sentence={a} props={props} view="final" />
                </div>
              );
            }
            return null;
          })}
        </div>
      );
    case "paragraph":
    case "quote":
      return (
        <div className={`pr-block pr-paragraph${hb.type === "quote" ? " pr-quote" : ""}${kindCls}`}>
          {block.sentences.map((s) => (
            <SentenceView key={s.id} sentence={s} props={props} view="final" />
          ))}
        </div>
      );
    default:
      return null;
  }
});
