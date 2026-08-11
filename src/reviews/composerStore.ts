import { create } from "zustand";
import type { ReviewAnchor } from "@/domain/review";
import type { PublishMode } from "@/reviews/reviewService";
import { deleteDraft, getDraft, saveDraft } from "@/storage/draftStore";
import type { PullRequestLocation } from "@/domain/pullRequest";

export interface ComposerState {
  open: boolean;
  anchor: ReviewAnchor | null;
  body: string;
  publishMode: PublishMode;
  sending: boolean;
  error: string | null;
  /** 最近一次发布结果（供 UI 提示）。 */
  lastResult: { ok: boolean; message: string } | null;
  openComposer: (anchor: ReviewAnchor, initialBody?: string) => void;
  close: () => void;
  setBody: (b: string) => void;
  setPublishMode: (m: PublishMode) => void;
  setSending: (s: boolean) => void;
  setError: (e: string | null) => void;
  setLastResult: (r: { ok: boolean; message: string } | null) => void;
}

export const useComposerStore = create<ComposerState>((set) => ({
  open: false,
  anchor: null,
  body: "",
  publishMode: "pending",
  sending: false,
  error: null,
  lastResult: null,
  openComposer: (anchor, initialBody = "") =>
    set({ open: true, anchor, body: initialBody, error: null, lastResult: null }),
  close: () => set({ open: false, anchor: null, body: "", error: null }),
  setBody: (b) => set({ body: b }),
  setPublishMode: (m) => set({ publishMode: m }),
  setSending: (s) => set({ sending: s }),
  setError: (e) => set({ error: e }),
  setLastResult: (r) => set({ lastResult: r }),
}));

export function composerDraftKey(loc: PullRequestLocation, anchor: ReviewAnchor): string {
  return `${loc.owner}/${loc.repo}/${loc.number}/${anchor.path}/${anchor.side}/${anchor.startLine}-${anchor.endLine}`;
}

/** 保存草稿到 IndexedDB。 */
export async function persistDraft(loc: PullRequestLocation, anchor: ReviewAnchor, body: string): Promise<void> {
  const key = composerDraftKey(loc, anchor);
  if (!body.trim()) {
    await deleteDraft(key);
    return;
  }
  await saveDraft({
    key,
    path: anchor.path,
    side: anchor.side,
    startLine: anchor.startLine,
    endLine: anchor.endLine,
    body,
    updatedAt: Date.now(),
  });
}

/** 读取草稿。 */
export async function loadDraft(loc: PullRequestLocation, anchor: ReviewAnchor): Promise<string> {
  const draft = await getDraft(composerDraftKey(loc, anchor));
  return draft?.body ?? "";
}
