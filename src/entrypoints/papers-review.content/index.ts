import { defineContentScript } from "wxt/utils/define-content-script";
import { MountController } from "@/bootstrap/mountController.tsx";

export default defineContentScript({
  matches: [
    "https://github.com/*/*/pull/*/files*",
    "https://github.com/*/*/pull/*/changes*",
    "https://github.com/*/*/pull/*/commits*",
  ],
  runAt: "document_idle",
  main() {
    const controller = new MountController();
    controller.start();
    window.addEventListener(
      "pagehide",
      () => {
        controller.stop();
      },
      { once: true },
    );
  },
});
