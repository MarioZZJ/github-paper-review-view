import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  CommentIcon,
  ReplyIcon,
  CheckIcon,
  PencilIcon,
  TrashIcon,
  KebabHorizontalIcon,
} from "@primer/octicons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUiStore } from "@/app/uiStore";
import { useComposerStore, persistDraft, loadDraft } from "@/reviews/composerStore";
import {
  editComment,
  publishComment,
  publishReply,
  removeComment,
  setThreadResolved,
  type PublishMode,
} from "@/reviews/reviewService";
import { useSettingsStore } from "@/storage/settingsStore";
import type { PullRequestLocation } from "@/domain/pullRequest";
import type { ReviewAnchor, ReviewCommentNode, ReviewThread } from "@/domain/review";

export function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(t).toLocaleDateString();
}

export function MarkdownBody({ body }: { body: string }) {
  return (
    <div className="pr-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

function Avatar({ login }: { login: string }) {
  return (
    <span className="pr-avatar" title={login}>
      {login.slice(0, 2).toUpperCase()}
    </span>
  );
}

/* ------------------------------ Composer ------------------------------ */

export interface ComposerProps {
  loc: PullRequestLocation;
  pullRequestId: string;
  headSha: string;
  anchor: ReviewAnchor;
  defaultMode: PublishMode;
  onPublished: () => void;
}

export function Composer({ loc, pullRequestId, headSha, anchor, defaultMode, onPublished }: ComposerProps) {
  const store = useComposerStore();
  const [body, setBodyLocal] = useState("");
  const [mode, setMode] = useState<PublishMode>(defaultMode);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const autosaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bodyRef = useRef(body);
  bodyRef.current = body;

  // 载入草稿
  useEffect(() => {
    let cancelled = false;
    void loadDraft(loc, anchor).then((d) => {
      if (!cancelled && d) setBodyLocal(d);
    });
    return () => {
      cancelled = true;
    };
  }, [loc, anchor]);

  // 自动保存
  useEffect(() => {
    autosaveRef.current = setInterval(() => {
      void persistDraft(loc, anchor, bodyRef.current);
    }, 3000);
    return () => {
      if (autosaveRef.current) clearInterval(autosaveRef.current);
    };
  }, [loc, anchor]);

  const submit = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    setError(null);
    const res = await publishComment(loc, anchor, body, mode, pullRequestId, headSha);
    setSending(false);
    if (res.ok) {
      await persistDraft(loc, anchor, "");
      setBodyLocal("");
      await queryClient.invalidateQueries({ queryKey: ["threads", loc.owner, loc.repo, loc.number] });
      await queryClient.invalidateQueries({
        queryKey: ["pending-review", loc.owner, loc.repo, loc.number],
      });
      store.setLastResult({ ok: true, message: "评论已发布" });
      onPublished();
    } else {
      setError(res.error ?? "发布失败");
      store.setLastResult({ ok: false, message: res.error ?? "发布失败" });
    }
  };

  return (
    <div className="pr-composer">
      <div className="pr-composer-anchor">
        <span className="pr-composer-file">{anchor.path}</span>
        <span className="pr-composer-lines">
          {anchor.side === "LEFT" ? "旧" : "新"} 行 {anchor.startLine}
          {anchor.endLine !== anchor.startLine ? `–${anchor.endLine}` : ""}
        </span>
        {anchor.fallbackReason ? (
          <span className="pr-fallback-badge" title={anchor.fallbackReason}>
            ⚠ 已回退锚点
          </span>
        ) : null}
      </div>
      {anchor.quote ? (
        <blockquote className="pr-composer-quote">{anchor.quote.slice(0, 300)}</blockquote>
      ) : null}
      <textarea
        className="pr-textarea pr-composer-input"
        rows={4}
        placeholder="输入评论…（支持 Markdown 与 LaTeX 数学）"
        value={body}
        onChange={(e) => setBodyLocal(e.target.value)}
        autoFocus
      />
      <div className="pr-composer-footer">
        <div className="pr-composer-modes" role="radiogroup" aria-label="发布方式">
          <button
            role="radio"
            aria-checked={mode === "pending"}
            className={`pr-mode-btn${mode === "pending" ? " active" : ""}`}
            onClick={() => setMode("pending")}
            title="加入 pending review，可与其他评论一起提交"
          >
            待定
          </button>
          <button
            role="radio"
            aria-checked={mode === "direct"}
            className={`pr-mode-btn${mode === "direct" ? " active" : ""}`}
            onClick={() => setMode("direct")}
            title="立即作为单条评论发布"
          >
            立即发布
          </button>
        </div>
        <div className="pr-composer-actions">
          {error ? <span className="pr-error">{error}</span> : null}
          <button className="pr-btn pr-btn-primary" onClick={submit} disabled={sending || !body.trim()}>
            {sending ? "发布中…" : mode === "pending" ? "加入 Review" : "评论"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ ThreadCard ------------------------------ */

export interface ThreadCardProps {
  loc: PullRequestLocation;
  thread: ReviewThread;
  pendingReviewId: string | null;
  collapsedResolved: boolean;
  onJump: (thread: ReviewThread) => void;
  onMutated: () => void;
}

function CommentItem({
  comment,
  onReply,
  onEdit,
  onDelete,
}: {
  comment: ReviewCommentNode;
  onReply: (c: ReviewCommentNode) => void;
  onEdit: (c: ReviewCommentNode) => void;
  onDelete: (c: ReviewCommentNode) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const author = comment.author;
  return (
    <div className="pr-comment">
      <div className="pr-comment-head">
        {author ? <Avatar login={author.login} /> : <span className="pr-avatar">?</span>}
        <span className="pr-comment-author">{author?.login ?? "未知"}</span>
        <span className="pr-comment-time">{relativeTime(comment.createdAt)}</span>
        {comment.author?.isViewer ? (
          <span className="pr-menu-wrap">
            <button className="pr-btn pr-btn-ghost pr-btn-sm" onClick={() => setMenuOpen((v) => !v)}>
              <KebabHorizontalIcon size={12} />
            </button>
            {menuOpen ? (
              <span className="pr-menu">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit(comment);
                  }}
                >
                  <PencilIcon size={12} /> 编辑
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(comment);
                  }}
                >
                  <TrashIcon size={12} /> 删除
                </button>
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      <MarkdownBody body={comment.body} />
      <button className="pr-comment-reply" onClick={() => onReply(comment)}>
        <ReplyIcon size={12} /> 回复
      </button>
    </div>
  );
}

export const ThreadCard = memo(function ThreadCard({
  loc,
  thread,
  pendingReviewId,
  collapsedResolved,
  onJump,
  onMutated,
}: ThreadCardProps) {
  const [collapsed, setCollapsed] = useState(thread.isResolved && collapsedResolved);
  const [replyingTo, setReplyingTo] = useState<ReviewCommentNode | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [editing, setEditing] = useState<ReviewCommentNode | null>(null);
  const [editBody, setEditBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["threads", loc.owner, loc.repo, loc.number] });
    onMutated();
  }, [queryClient, loc, onMutated]);

  const doReply = async () => {
    if (!replyingTo || !replyBody.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await publishReply(
      pendingReviewId ?? thread.reviewId ?? "",
      replyingTo.id,
      replyBody,
    );
    setBusy(false);
    if (res.ok) {
      setReplyBody("");
      setReplyingTo(null);
      refresh();
    } else {
      setError(res.error ?? "回复失败");
    }
  };

  const doResolve = async () => {
    setBusy(true);
    const res = await setThreadResolved(thread.id, !thread.isResolved);
    setBusy(false);
    if (!res.ok) setError(res.error ?? "操作失败");
    else refresh();
  };

  const doSaveEdit = async () => {
    if (!editing || !editBody.trim()) return;
    const dbId = editing.databaseId;
    if (dbId === null) {
      setError("该评论无法编辑");
      return;
    }
    setBusy(true);
    const res = await editComment(loc, dbId, editBody);
    setBusy(false);
    if (res.ok) {
      setEditing(null);
      refresh();
    } else setError(res.error ?? "编辑失败");
  };

  const doDelete = async (c: ReviewCommentNode) => {
    if (c.databaseId === null) return;
    if (!window.confirm("删除这条评论？")) return;
    setBusy(true);
    const res = await removeComment(loc, c.databaseId);
    setBusy(false);
    if (res.ok) refresh();
    else setError(res.error ?? "删除失败");
  };

  return (
    <div className={`pr-thread${thread.isResolved ? " resolved" : ""}${thread.isOutdated ? " outdated" : ""}`}>
      <div className="pr-thread-head">
        <span className={`pr-thread-state${thread.isResolved ? " resolved" : ""}`}>
          {thread.isResolved ? <CheckIcon size={12} /> : <CommentIcon size={12} />}
          {thread.isResolved ? "已解决" : thread.isOutdated ? "已过时" : "未解决"}
        </span>
        <span className="pr-thread-loc" onClick={() => onJump(thread)} title="跳转到该行">
          {thread.path.split("/").pop()}：
          {thread.startLine !== null && thread.startLine !== thread.line
            ? `${thread.startLine}–${thread.line}`
            : thread.line}
        </span>
        <button className="pr-btn pr-btn-ghost pr-btn-sm" onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? "展开" : "折叠"}
        </button>
      </div>
      {!collapsed ? (
        <div className="pr-thread-body">
          {thread.comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              onReply={(c) => {
                setReplyingTo(c);
                setEditing(null);
              }}
              onEdit={(c) => {
                setEditing(c);
                setEditBody(c.body);
                setReplyingTo(null);
              }}
              onDelete={doDelete}
            />
          ))}
          {editing ? (
            <div className="pr-composer pr-composer-inline">
              <textarea
                className="pr-textarea"
                rows={3}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
              />
              <div className="pr-composer-actions">
                <button className="pr-btn" onClick={() => setEditing(null)}>
                  取消
                </button>
                <button className="pr-btn pr-btn-primary" onClick={doSaveEdit} disabled={busy}>
                  保存
                </button>
              </div>
            </div>
          ) : null}
          {replyingTo ? (
            <div className="pr-composer pr-composer-inline">
              <textarea
                className="pr-textarea"
                rows={2}
                placeholder={`回复 ${replyingTo.author?.login ?? ""}…`}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
              />
              <div className="pr-composer-actions">
                <button className="pr-btn" onClick={() => setReplyingTo(null)}>
                  取消
                </button>
                <button className="pr-btn pr-btn-primary" onClick={doReply} disabled={busy || !replyBody.trim()}>
                  回复
                </button>
              </div>
            </div>
          ) : null}
          {error ? <div className="pr-error">{error}</div> : null}
          <div className="pr-thread-actions">
            {thread.viewerCanResolve || thread.viewerCanUnresolve ? (
              <button className="pr-btn pr-btn-sm" onClick={doResolve} disabled={busy}>
                {thread.isResolved ? "重新打开" : "标记解决"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
});

/* ------------------------------ CommentPanel ------------------------------ */

export interface CommentPanelProps {
  loc: PullRequestLocation;
  threads: ReviewThread[];
  pendingReviewId: string | null;
  pullRequestId: string;
  headSha: string;
  activeAnchor: ReviewAnchor | null;
  composerOpen: boolean;
  onCloseComposer: () => void;
  onJumpToThread: (t: ReviewThread) => void;
  onMutated: () => void;
}

export function CommentPanel({
  loc,
  threads,
  pendingReviewId,
  pullRequestId,
  headSha,
  activeAnchor,
  composerOpen,
  onCloseComposer,
  onJumpToThread,
  onMutated,
}: CommentPanelProps) {
  const commentsOpen = useUiStore((s) => s.commentsOpen);
  const settings = useSettingsStore((s) => s.settings);
  const sorted = useMemo(
    () =>
      [...threads].sort(
        (a, b) =>
          (a.line ?? 0) - (b.line ?? 0) || (a.startLine ?? 0) - (b.startLine ?? 0),
      ),
    [threads],
  );
  if (!commentsOpen) return null;
  const jump = (t: ReviewThread) => {
    onJumpToThread(t);
  };
  return (
    <aside className="pr-right-sidebar">
      <div className="pr-sidebar-header">
        评论
        <span className="pr-thread-count">{sorted.length}</span>
      </div>
      <div className="pr-comments-scroll">
        {composerOpen && activeAnchor ? (
          <Composer
            loc={loc}
            pullRequestId={pullRequestId}
            headSha={headSha}
            anchor={activeAnchor}
            defaultMode={settings.defaultPublishAction}
            onPublished={onCloseComposer}
          />
        ) : null}
        {sorted.map((t) => (
          <ThreadCard
            key={t.id}
            loc={loc}
            thread={t}
            pendingReviewId={pendingReviewId}
            collapsedResolved={settings.collapseResolved}
            onJump={jump}
            onMutated={onMutated}
          />
        ))}
        {sorted.length === 0 && !composerOpen ? (
          <div className="pr-muted pr-comments-empty">
            <CommentIcon size={24} />
            <p>暂无评论。选中论文中的文本开始审阅。</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
