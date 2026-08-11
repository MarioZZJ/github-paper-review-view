/**
 * Token vault —— 仅允许在 background service worker / extension pages 中访问。
 * content script 永远拿不到 token 明文，只能查询状态。
 */

const TOKEN_KEY = "githubToken";
const PERSIST_FLAG_KEY = "githubTokenPersist";
const TOKEN_INFO_KEY = "githubTokenInfo";

export interface TokenInfo {
  login: string;
  avatarUrl: string | null;
  /** 已验证的 scopes（classic PAT 时存在）。 */
  scopes: string[];
  /** fine-grained token 的仓库访问描述（尽力而为）。 */
  repositorySelection: string | null;
  savedAt: number;
  persist: boolean;
}

export interface TokenStatus {
  hasToken: boolean;
  info: TokenInfo | null;
}

/** 初始化：把 session storage 限制为 trusted contexts。 */
export async function initTokenVault(): Promise<void> {
  try {
    await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch (err) {
    // 部分 Chrome 版本或非扩展上下文会抛错，忽略即可
    console.debug("setAccessLevel 不可用", err);
  }
}

async function readRawToken(): Promise<{ token: string | null; persist: boolean }> {
  const fromSession = await chrome.storage.session.get(TOKEN_KEY);
  if (typeof fromSession[TOKEN_KEY] === "string") {
    return { token: fromSession[TOKEN_KEY] as string, persist: false };
  }
  const fromLocal = await chrome.storage.local.get([TOKEN_KEY, PERSIST_FLAG_KEY]);
  if (typeof fromLocal[TOKEN_KEY] === "string") {
    return { token: fromLocal[TOKEN_KEY] as string, persist: fromLocal[PERSIST_FLAG_KEY] === true };
  }
  return { token: null, persist: false };
}

/** 仅 background 内部使用：读取 token。 */
export async function getToken(): Promise<string | null> {
  const { token } = await readRawToken();
  return token;
}

export async function getTokenStatus(): Promise<TokenStatus> {
  const [raw, infoRaw] = await Promise.all([
    readRawToken(),
    chrome.storage.local.get(TOKEN_INFO_KEY),
  ]);
  const info = infoRaw[TOKEN_INFO_KEY] as TokenInfo | undefined;
  if (!raw.token) return { hasToken: false, info: null };
  return { hasToken: true, info: info ?? null };
}

export async function saveToken(token: string, persist: boolean, info: TokenInfo): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_INFO_KEY]: info });
  if (persist) {
    await chrome.storage.local.set({ [TOKEN_KEY]: token, [PERSIST_FLAG_KEY]: true });
    await chrome.storage.session.remove(TOKEN_KEY);
  } else {
    await chrome.storage.session.set({ [TOKEN_KEY]: token });
    await chrome.storage.local.remove([TOKEN_KEY, PERSIST_FLAG_KEY]);
  }
}

export async function forgetToken(): Promise<void> {
  await chrome.storage.local.remove([TOKEN_KEY, PERSIST_FLAG_KEY, TOKEN_INFO_KEY]);
  await chrome.storage.session.remove(TOKEN_KEY);
}

/** 把已记住的 token 从 local 迁移到 session（下次浏览器会话失效）。 */
export async function switchToSessionStorage(): Promise<void> {
  const { token, persist } = await readRawToken();
  if (!token) return;
  if (persist) {
    await saveToken(token, false, (await getTokenStatus()).info ?? {
      login: "unknown",
      avatarUrl: null,
      scopes: [],
      repositorySelection: null,
      savedAt: Date.now(),
      persist: false,
    });
  }
}
