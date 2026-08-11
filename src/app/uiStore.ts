import { create } from "zustand";
import type { ViewMode } from "@/domain/settings";
import type { DiffSide } from "@/domain/source";

export interface ScrollTarget {
  path: string;
  side: DiffSide;
  line: number;
  nonce: number;
}

interface UiState {
  viewMode: ViewMode;
  activePath: string | null;
  settingsOpen: boolean;
  commentsOpen: boolean;
  outlineOpen: boolean;
  /** 删除块是否折叠。 */
  deletedCollapsed: boolean;
  /** 跳转目标（由 outline/threads 触发）。 */
  scrollTarget: ScrollTarget | null;
  setViewMode: (m: ViewMode) => void;
  setActivePath: (p: string) => void;
  toggleSettings: () => void;
  toggleComments: () => void;
  toggleOutline: () => void;
  setDeletedCollapsed: (v: boolean) => void;
  requestScroll: (path: string, side: DiffSide, line: number) => void;
  clearScroll: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  viewMode: "final",
  activePath: null,
  settingsOpen: false,
  commentsOpen: true,
  outlineOpen: true,
  deletedCollapsed: true,
  scrollTarget: null,
  setViewMode: (m) => set({ viewMode: m }),
  setActivePath: (p) => set({ activePath: p }),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  toggleComments: () => set((s) => ({ commentsOpen: !s.commentsOpen })),
  toggleOutline: () => set((s) => ({ outlineOpen: !s.outlineOpen })),
  setDeletedCollapsed: (v) => set({ deletedCollapsed: v }),
  requestScroll: (path, side, line) =>
    set((s) => ({ scrollTarget: { path, side, line, nonce: (s.scrollTarget?.nonce ?? 0) + 1 } })),
  clearScroll: () => set({ scrollTarget: null }),
}));
