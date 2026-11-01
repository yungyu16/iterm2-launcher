# Repository Guidelines

- 本仓库维护 macOS iTerm2 启动工具；公开内容不得依赖个人配置仓库或内部服务。
- Node.js 主版本由 `.nvmrc` 声明，`.mise.toml` 启用读取，开发命令通过 `mise exec --` 执行。
- 使用 `npm ci --ignore-scripts` 安装锁定依赖；npm 仅用于工程管理，不发布 npm 包。
- CLI、配置契约和运行边界维护在 README；开发与发布步骤维护在 CONTRIBUTING。
- 修改后运行 `npm test`、`npm run check`，macOS 上编译两个 AppleScript。GUI 验收单独报告，不以单测替代。
- 保留 Herdr 的 `ait-` 路径摘要和 `user.agent_in_term_cwd` 标识，变更必须考虑已有会话。
- 发布由单仓库内的 `Formula/iterm2-launcher.rb` 和 GitHub Release 配合完成；安装包只包含明确列出的文件。
