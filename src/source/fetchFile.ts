import { getBlob, getFileContent, getTree, type RestContentItem, type RestTree } from "@/api/rest";
import type { PullRequestLocation } from "@/domain/pullRequest";
import type { SourceLine } from "@/domain/source";

const CONTENTS_LIMIT = 1024 * 1024; // 1MB：Contents API 上限

/** 解码内容：base64 内容优先，其次 URL 下载。 */
function decodeContent(item: RestContentItem): string | null {
  if (typeof item.content === "string" && item.encoding === "base64") {
    try {
      const bin = atob(item.content);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return null;
    }
  }
  return null;
}

/** 把文本拆为 SourceLine[]（保留 newline 类型，统一内部为 \n）。 */
export function toSourceLines(text: string): SourceLine[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const rawLines = normalized.split("\n");
  // 去掉末尾多余的空行（split 产生的最后一个空串表示文件结尾换行）
  const out: SourceLine[] = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const raw = rawLines[i]!;
    out.push({
      number: i + 1,
      raw,
      blank: raw.trim().length === 0,
      newline: "LF",
    });
  }
  return out;
}

export interface FileFetchResult {
  text: string | null;
  sha: string | null;
  method: "contents" | "blob" | "tree" | "none";
}

/**
 * 获取某个 ref 下文件的完整文本：
 * 1. contents API（小文件）；
 * 2. git trees (recursive) 找 blob → git blobs（raw media type）。
 */
export async function fetchFileText(
  loc: Pick<PullRequestLocation, "owner" | "repo" | "number">,
  path: string,
  ref: string,
  expectedSize?: number,
): Promise<FileFetchResult> {
  // 1) contents API
  if (!expectedSize || expectedSize <= CONTENTS_LIMIT) {
    try {
      const item = await getFileContent(loc, path, ref);
      if (item.type === "file") {
        const text = decodeContent(item);
        if (text !== null) return { text, sha: item.sha, method: "contents" };
      }
    } catch {
      // 继续尝试 trees/blobs
    }
  }
  // 2) git trees + blobs
  try {
    const tree: RestTree = await getTree(loc, ref);
    if (!tree.truncated) {
      const entry = tree.tree.find((e) => e.type === "blob" && e.path === path);
      if (entry) {
        const blob = await getBlob(loc, entry.sha);
        return { text: blob.raw, sha: entry.sha, method: "blob" };
      }
    } else {
      // truncated tree：逐个目录下钻
      const sha = await findBlobInTree(loc, tree, path);
      if (sha) {
        const blob = await getBlob(loc, sha);
        return { text: blob.raw, sha, method: "tree" };
      }
    }
  } catch {
    // 两个方案都失败
  }
  return { text: null, sha: null, method: "none" };
}

/** 在 truncated tree 中下钻查找 path 对应的 blob sha。 */
async function findBlobInTree(
  loc: Pick<PullRequestLocation, "owner" | "repo" | "number">,
  tree: RestTree,
  path: string,
): Promise<string | null> {
  const segments = path.split("/");
  const walk = async (prefix: string, depth: number): Promise<string | null> => {
    const full = prefix ? `${prefix}/${segments[depth]}` : segments[depth]!;
    const entry = tree.tree.find((e) => e.path === full);
    if (!entry) return null;
    if (depth === segments.length - 1) return entry.type === "blob" ? entry.sha : null;
    if (entry.type === "tree") {
      const sub = await getTree(loc, entry.sha);
      return walk(full, depth + 1);
    }
    return null;
  };
  return walk("", 0);
}
