import { useMemo, useState } from "react";
import { CheckIcon, CommentIcon } from "@primer/octicons-react";
import { submitPendingReview } from "@/reviews/reviewService";
import type { PullRequestLocation } from "@/domain/pullRequest";
import type { ReviewEvent } from "@/domain/review";

export interface SubmitReviewBarProps {
  loc: PullRequestLocation;
  pendingReviewId: string | null;
  threadCount: number;
  onSubmitted: () => void;
}

const EVENTS: Array<{ id: ReviewEvent; label: string }> = [
  { id: "COMMENT", label: "仅评论" },
  { id: "APPROVE", label: "批准" },
  { id: "REQUEST_CHANGES", label: "请求修改" },
];

/** 提交 pending review 的底部操作栏。 */
export function SubmitReviewBar({ pendingReviewId, threadCount, onSubmitted }: SubmitReviewBarProps) {
  const [open, setOpen] = useState(false);
  const [event, setEvent] = useState<ReviewEvent>("COMMENT");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const hasPending = pendingReviewId !== null && threadCount > 0;
  const summary = useMemo(() => {
    if (!hasPending) return null;
    return `${threadCount} 条评论待提交`;
  }, [hasPending, threadCount]);

  if (!hasPending && !open) return null;

  const submit = async () => {
    if (!pendingReviewId || busy) return;
    setBusy(true);
    setError(null);
    const res = await submitPendingReview(pendingReviewId, event, body);
    setBusy(false);
    if (res.ok) {
      setDone(true);
      window.setTimeout(() => {
        setOpen(false);
        setDone(false);
        onSubmitted();
      }, 1200);
    } else {
      setError(res.error ?? "提交失败");
    }
  };

  return (
    <div className="pr-submit-bar">
      {!open ? (
        <button className="pr-btn pr-btn-primary" onClick={() => setOpen(true)}>
          <CommentIcon size={14} /> 提交 Review（{summary}）
        </button>
      ) : done ? (
        <span className="pr-ok">
          <CheckIcon size={14} /> 已提交
        </span>
      ) : (
        <div className="pr-submit-form">
          <div className="pr-submit-events" role="radiogroup" aria-label="Review 结论">
            {EVENTS.map((e) => (
              <button
                key={e.id}
                role="radio"
                aria-checked={event === e.id}
                className={`pr-mode-btn${event === e.id ? " active" : ""}`}
                onClick={() => setEvent(e.id)}
              >
                {e.label}
              </button>
            ))}
          </div>
          <textarea
            className="pr-textarea"
            rows={2}
            placeholder="整体意见（可选）"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="pr-submit-actions">
            {error ? <span className="pr-error">{error}</span> : null}
            <button className="pr-btn" onClick={() => setOpen(false)}>
              取消
            </button>
            <button className="pr-btn pr-btn-primary" onClick={submit} disabled={busy}>
              {busy ? "提交中…" : "提交 Review"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
