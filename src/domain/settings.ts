import { z } from "zod";

export type ViewMode = "final" | "original" | "split" | "raw";
export type ThemeMode = "auto" | "light" | "dark" | "dimmed";
export type BodyFont = "serif" | "system" | "mono";
export type CitationDisplay = "authorYear" | "key";

export const settingsSchema = z.object({
  /** 默认视图模式。 */
  viewMode: z.enum(["final", "original", "split", "raw"]),
  /** 正文字号 px。 */
  fontSize: z.number().min(14).max(24),
  /** 行距。 */
  lineHeight: z.number().min(1.45).max(2.0),
  /** 正文阅读宽度 px。 */
  paperWidth: z.number().min(760).max(1200),
  /** 正文字体。 */
  bodyFont: z.enum(["serif", "system", "mono"]),
  /** 是否显示删除块。 */
  showDeleted: z.boolean(),
  /** 是否展开复杂环境源码。 */
  expandEnvironments: z.boolean(),
  /** 是否显示 TeX comments（% 行）。 */
  showTexComments: z.boolean(),
  /** 引文显示方式。 */
  citationDisplay: z.enum(["authorYear", "key"]),
  /** 主题。 */
  theme: z.enum(["auto", "light", "dark", "dimmed"]),
  /** 默认发布动作。 */
  defaultPublishAction: z.enum(["pending", "direct"]),
  /** 默认评论 side。 */
  defaultSide: z.enum(["RIGHT", "LEFT"]),
  /** resolved thread 是否折叠。 */
  collapseResolved: z.boolean(),
  /** 精确选择高亮是否本地保存。 */
  saveSelectionHighlights: z.boolean(),
  /** 草稿自动保存间隔 ms。 */
  autosaveIntervalMs: z.number().min(1000).max(60000),
  /** TeX 扩展名列表。 */
  texExtensions: z.array(z.string()),
  /** 忽略的 path glob。 */
  ignoreGlobs: z.array(z.string()),
  /** 主 manuscript 文件优先级列表。 */
  mainManuscriptPriority: z.array(z.string()),
  /** 自定义安全宏（\newcommand 定义文本）。 */
  customMacros: z.array(z.string()),
});

export type Settings = z.infer<typeof settingsSchema>;

export const defaultSettings: Settings = {
  viewMode: "final",
  fontSize: 17,
  lineHeight: 1.72,
  paperWidth: 940,
  bodyFont: "serif",
  showDeleted: true,
  expandEnvironments: false,
  showTexComments: false,
  citationDisplay: "authorYear",
  theme: "auto",
  defaultPublishAction: "pending",
  defaultSide: "RIGHT",
  collapseResolved: true,
  saveSelectionHighlights: true,
  autosaveIntervalMs: 3000,
  texExtensions: [".tex", ".ltx", ".latex"],
  ignoreGlobs: [],
  mainManuscriptPriority: ["main.tex", "paper.tex", "manuscript.tex"],
  customMacros: [],
};

/** 校验未知设置对象，失败时返回默认设置。 */
export function parseSettings(raw: unknown): Settings {
  const parsed = settingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return defaultSettings;
}
