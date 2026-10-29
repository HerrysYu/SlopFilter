# SlopFilter 项目交接

## 项目与入口

- 原生 Chrome Manifest V3 扩展，无构建步骤或 npm 运行依赖。
- `manifest.json` 定义入口；`src/background.js` 负责 Jev 请求与存储，`src/content.js` 读取和处理推文，`src/ui.js` 构建面板。
- 安装、隐私、判定流程及已知限制见 `README.md`。
- GitHub：<https://github.com/HerrysYu/SlopFilter>，主分支 `main`，许可证 MIT（已由项目所有者确认）。

## 协作约定

- 先检查工作区，不覆盖已有修改。代码实现按单一目标委派给 scoped_coder，限定可写路径、接口、非目标、验收命令和交付内容；执行者不递归委派。
- 主 agent 负责规划、审查、验收、整合及维护本交接记录。
- `.claude/`、本地环境文件、依赖缓存及 `test/out/` 不进入版本库。不得提交 API Key 或浏览器用户数据。

## 验证命令

```sh
node test/heuristics.test.mjs
node test/e2e.mjs
```

端到端测试需要 Google Chrome 和 openssl，使用独立的临时浏览器配置和本地 HTTPS 模拟服务，不调用真实 Jev API。可通过 `CHROME` 指定 Chrome 可执行文件。

## 当前进度（2026-10-30）

- 已补充 GitHub 下载与安装说明、MIT 许可证及本地文件忽略规则，保留扩展功能与原有演示文件。
- 上述两项测试均已实际运行通过；端到端测试覆盖扩展加载、本地与模拟 Jev 判定、折叠/隐藏、主题、动画打断、拖动及误判恢复。
- 发布前文本扫描未发现真实凭据；截图为模拟时间线，测试 Key 为占位值。
- 首次发布包含扩展源码、图标、模拟测试与文档。真实 Jev 接口尚未验证，这一限制已在 README 中说明。
- 已将首次发布推送至公开 GitHub 仓库的 `main` 分支，并补充仓库简介与主题。后续重点是验证真实 Jev 接口及 X 实际页面兼容性。
