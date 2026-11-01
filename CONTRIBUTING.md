# 开发与发布

## 开发环境

`.nvmrc` 是 Node 主版本的唯一来源，内容为 `24`，允许使用该主版本内的补丁更新。`.mise.toml` 仅启用对 `.nvmrc` 的读取；也可使用 nvm。发布包使用调用环境 PATH 中的 Node 24，Homebrew Formula 不管理 Node 安装。

```sh
mise trust
mise install
mise exec -- npm ci --ignore-scripts
mise exec -- npm run format:check
mise exec -- npm run check
mise exec -- npm test
```

npm 只管理开发工具、依赖锁和构建任务；`private: true` 防止误发布 npm 包。依赖使用公共 registry，不使用机器上的私有镜像。TypeScript 开启 strict，输出到忽略的 `dist/`。

## 格式与注释

TypeScript、测试脚本、JSON 与 CI YAML 使用 `mise exec -- npm run format` 格式化，CI 使用 `format:check` 检查。格式规则统一引号、4 空格缩进和括号；行宽阈值保持较高，避免仅为列宽拆断日志、字符串和调用。AppleScript 保留 tab 缩进，使用系统 `osacompile` 检查语法，不交给不支持该语言的格式化器。

注释重点解释会话生命周期、参数转义、环境传递和行为限制，不复述函数名或逐行解释赋值。改变相关行为时同步维护注释与 README。

## 代码结构

- `src/bin.ts`：唯一 CLI 入口，负责参数解析、运行环境与本地输入检查、退出状态。
- `src/launch.ts`：接收校验后的请求，调度工作空间启动或 Herdr 客户端连接。
- `src/iterm.ts`：AppleScript 参数适配、脚本定位和 Herdr 可执行文件检查。
- `src/config.ts`：XDG 路径、TOML 解析与当前模式校验。
- `src/herdr.ts`：稳定会话标识、服务就绪、布局初始化与客户端连接。
- `src/herdr-api.ts`：显式 session 的命令执行、JSON 查询和 pane ID 校验。
- `scripts/iterm/common.applescript`：两种模式共享的窗口查找和焦点收尾。
- `scripts/iterm/native.applescript`、`herdr.applescript`：各自的项目 tab 识别与初始化。
- `examples/config.toml`：完整的最小用户配置，不含个人命令。
- `test/`：配置与 CLI 测试，以及使用可执行替身的 Herdr 流程测试。
- `scripts/package-release.ts`：生成发布归档、校验和，并更新 Formula 的版本 URL 和 SHA-256；安装逻辑直接维护在 Formula 文件中。

macOS 自带 `osascript` / `osacompile` 和 Shell 用于系统集成，不通过版本管理器安装。安装 iTerm2 后执行：

```sh
osacompile -o /tmp/iterm2-launch-common.scpt scripts/iterm/common.applescript
osacompile -o /tmp/iterm2-launch-native.scpt scripts/iterm/native.applescript
osacompile -o /tmp/iterm2-launch-herdr.scpt scripts/iterm/herdr.applescript
```

## 验证范围

自动测试覆盖配置优先级和错误、命令数量、XDG 路径、Shell 引号、会话标识、Herdr 新建/复用/分屏失败，以及不依赖 GUI 的帮助和版本。CI 还编译 AppleScript；这些检查不证明 GUI 焦点或真实 Agent 的长期运行正常。

发布前在隔离的测试目录和 Profile 中进行交互验收：

1. 原生 1～4 栏：顺序、cwd、命令执行、新建与复用。
2. Herdr 首次双栏、再次打开不重复执行命令、关闭 tab 后重新连接。
3. 含空格和单引号的目录、软链接目录、不同父目录下的同名项目。
4. 目标窗口在后台时，激活正确的窗口和 tab。
5. 配置更新不打断已有进程；初始化失败不重复发送命令。

不使用真实个人 Agent 作为自动测试进程，不关闭用户已有窗口。测试创建的 tab/server 只清理本次明确记录的标识。

## 发布 Homebrew 版本

本仓库兼作 Tap，用户通过显式 Git URL 添加它，无需另建 `homebrew-*` 仓库。

1. 修改 `package.json` 版本，并使用 `npm install --package-lock-only --ignore-scripts` 同步锁文件。
2. 完成测试、编译与公开内容检查，再运行：

   ```sh
   mise exec -- npm ci --ignore-scripts
   mise exec -- npm test
   mise exec -- npm run release
   ```

3. 检查 `.release/` 中的归档和 SHA-256，确认包含编译代码、AppleScript、示例及 TOML 解析器许可证，没有开发依赖或本地配置。`Formula/iterm2-launcher.rb` 已被同步为对应版本及 SHA-256。
4. 提交源码、锁文件、Formula；创建相同版本的 Git tag，并推送。不要提交 `.release/`、`dist/` 或 `node_modules/`。
5. 在该 tag 的 GitHub Release 中上传生成的 `.tar.gz` 与 `.sha256`。Formula 下载的是这个归档，不是 GitHub 自动生成的源码包。发布完成前不要向用户宣称该版本已可安装。
6. 从远端 Tap 安装并执行 `brew test yungyu16/iterm2-launcher/iterm2-launcher`，测试环境需确保 Node 24 在 PATH 中（Homebrew 的隔离测试环境可能需要显式传入 PATH）。核对 `iterm2-launch --version`，再按上述清单验收 GUI。

打包后不要重新生成另一份归档再上传：gzip 时间戳等可能改变 SHA-256。需要重打包时同时重新生成并提交 Formula。已发布的版本不覆盖资产，修复使用新版本。

维护内容按职责更新：CLI/配置契约更新 README，开发和发布流程更新本文；不要把单次调试日志或历史测试数量追加为长期说明。
