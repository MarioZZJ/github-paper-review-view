import { idbAll, idbDelete, idbGet, idbPut } from "./idb";
import type { ReviewAnchor } from "@/domain/review";

/**
 * 评论草稿与精确范围映射（IndexedDB）。
 */

export interface CommentDraft {
  key: string;
  /** 目标锚点（部分字段可能变化）。 */
  path: string;
  side: "LEFT" | "RIGHT";
  startLine: number;
  endLine: number;
  body: string;
  updatedAt: number;
}

/** 精确字符范围（comment node id → 本地映射）。 */
export interface LocalAnchorMapping {
  key: string;
  commentId: string;
  anchor: ReviewAnchor;
  savedAt: number;
}

export function draftKey(
  owner: string,
  repo: string,
  number: number,
  path: string,
  side: "LEFT" | "RIGHT",
  startLine: number,
  endLine: number,
): string {
  return `${owner}/${repo}/${number}/${path}/${side}/${startLine}-${endLine}`;
}

export async function getDraft(key: string): Promise<CommentDraft | undefined> {
  return idbGet<CommentDraft>("drafts", key);
}

export async function saveDraft(draft: CommentDraft): Promise<void> {
  await idbPut("drafts", draft);
}

export async function deleteDraft(key: string): Promise<void> {
  await idbDelete("drafts", key);
}

export async function allDrafts(): Promise<CommentDraft[]> {
  return idbAll<CommentDraft>("drafts");
}

export async function getAnchorMapping(commentId: string): Promise<LocalAnchorMapping | undefined> {
  return idbGet<LocalAnchorMapping>("anchors", commentId);
}

export async function saveAnchorMapping(mapping: LocalAnchorMapping): Promise<void> {
  await idbPut("anchors", mapping);
}

export async function deleteAnchorMapping(commentId: string): Promise<void> {
  await idbDelete("anchors", commentId);
}
