import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  vite: () => ({
    build: {
      // KaTeX 字体以内联 data URI 打进 CSS（content script 无法引用相对字体路径）
      assetsInlineLimit: 10 * 1024 * 1024,
    },
  }),
  manifest: {
    name: "Papers Review for GitHub",
    description: "在 GitHub Pull Request 中重建面向 TeX 学术论文审阅的前端",
    version: "0.1.0",
    permissions: ["storage"],
    host_permissions: ["https://github.com/*", "https://api.github.com/*"],
    action: { default_title: "Papers Review" },
    options_ui: { page: "options.html", open_in_tab: true },
    web_accessible_resources: [
      {
        resources: ["*.woff2", "*.ttf", "*.woff", "*.css"],
        matches: ["https://github.com/*"],
      },
    ],
  },
});
