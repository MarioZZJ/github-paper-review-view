import { create } from "zustand";
import { defaultSettings, parseSettings, type Settings } from "@/domain/settings";

const SYNC_KEY = "papersReviewSettings";

/**
 * 设置 store：小型偏好存 chrome.storage.sync；
 * token 与文档缓存不得进入 sync。
 */
interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
  reset: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  loaded: false,
  load: async () => {
    const raw = await chrome.storage.sync.get(SYNC_KEY);
    const settings = parseSettings(raw[SYNC_KEY]);
    set({ settings, loaded: true });
  },
  update: async (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    await chrome.storage.sync.set({ [SYNC_KEY]: next });
  },
  reset: async () => {
    set({ settings: defaultSettings });
    await chrome.storage.sync.remove(SYNC_KEY);
  },
}));
