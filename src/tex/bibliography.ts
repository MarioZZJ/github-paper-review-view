/**
 * 轻量 .bib 解析：仅提取 author / year 用于 author–year 引文显示。
 * 解析失败时保留 key 显示。
 */

export interface BibEntry {
  key: string;
  type: string;
  author: string | null;
  year: string | null;
  title: string | null;
}

const ENTRY_RE = /@(\w+)\s*\{\s*([^,\s]+)\s*,([\s\S]*?)\n?\}(?=\s*@|\s*$)/g;
const FIELD_RE = /(\w+)\s*=\s*\{([^{}]*)\}/g;

/** 把作者字符串转为 "Last" 形式。 */
export function formatAuthor(author: string | null, maxAuthors = 3): string | null {
  if (!author) return null;
  const parts = author
    .split(/\s+and\s+/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  const lastName = (part: string): string => {
    const cleaned = part.replace(/[{}]/g, "").trim();
    if (cleaned.includes(",")) {
      return cleaned.split(",")[0]!.trim();
    }
    const words = cleaned.split(/\s+/);
    return words[words.length - 1] ?? cleaned;
  };
  const names = parts.slice(0, maxAuthors).map(lastName);
  if (parts.length > maxAuthors) names.push("et al.");
  return names.join(", ");
}

/** 解析 .bib 文本 → key → 条目。 */
export function parseBib(text: string): Map<string, BibEntry> {
  const out = new Map<string, BibEntry>();
  ENTRY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ENTRY_RE.exec(text)) !== null) {
    const type = m[1]!.toLowerCase();
    const key = m[2]!;
    const body = m[3]!;
    const entry: BibEntry = { key, type, author: null, year: null, title: null };
    FIELD_RE.lastIndex = 0;
    let f: RegExpExecArray | null;
    while ((f = FIELD_RE.exec(body)) !== null) {
      const name = f[1]!.toLowerCase();
      const value = f[2]!;
      if (name === "author") entry.author = value;
      else if (name === "year") entry.year = value;
      else if (name === "title") entry.title = value;
    }
    out.set(key, entry);
  }
  return out;
}

/** 生成 author–year 显示文本；失败返回 null。 */
export function authorYear(entry: BibEntry | undefined): string | null {
  if (!entry) return null;
  const author = formatAuthor(entry.author);
  if (!author) return null;
  return entry.year ? `${author}, ${entry.year}` : author;
}
