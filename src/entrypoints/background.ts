import { defineBackground } from "wxt/utils/define-background";
import { backgroundRequestSchema } from "@/messaging/protocol";
import { handleBackgroundRequest } from "@/messaging/backgroundHandlers";
import { initTokenVault } from "@/auth/tokenVault";

export default defineBackground(() => {
  void initTokenVault();

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    const parsed = backgroundRequestSchema.safeParse(message);
    if (!parsed.success) {
      sendResponse({
        ok: false,
        code: "BAD_REQUEST",
        message: "消息不符合协议",
      } as const);
      return false;
    }
    void handleBackgroundRequest(parsed.data).then(sendResponse);
    return true; // 异步响应
  });
});
