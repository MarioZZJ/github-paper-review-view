import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
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
