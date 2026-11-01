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
- `scripts/package-release.ts`：只生成发布归档与 SHA-256，不修改 Formula。
- `scripts/release.ts`：校验 tag、验证独立归档、发布 Release 和回写 Formula。
- `scripts/release-utils.ts`：版本、校验和与 Formula 更新规则，配有无网络单元测试。

macOS 自带 `osascript` / `osacompile` 和 Shell 用于系统集成，不通过版本管理器安装。安装 iTerm2 后执行：

```sh
osacompile -o /tmp/iterm2-launch-common.scpt scripts/iterm/common.applescript
osacompile -o /tmp/iterm2-launch-native.scpt scripts/iterm/native.applescript
osacompile -o /tmp/iterm2-launch-herdr.scpt scripts/iterm/herdr.applescript
```

## 验证范围

自动测试覆盖配置优先级和错误、命令数量、XDG 路径、Shell 引号、会话标识、Herdr 新建/复用/分屏失败、结构化错误分类、启动总预算、忽略 SIGTERM 的请求子进程超时终止，以及不依赖 GUI 的帮助和版本。CI 还编译 AppleScript；这些检查不证明 GUI 焦点或真实 Agent 的长期运行正常。

发布前在隔离的测试目录和 Profile 中进行交互验收：

1. 原生 1～4 栏：顺序、cwd、命令执行、新建与复用。
2. Herdr 首次双栏、再次打开不重复执行命令、关闭 tab 后重新连接。
3. 含空格和单引号的目录、软链接目录、不同父目录下的同名项目。
4. 目标窗口在后台时，激活正确的窗口和 tab。
5. 配置更新不打断已有进程；初始化失败不重复发送命令。

不使用真实个人 Agent 作为自动测试进程，不关闭用户已有窗口。测试创建的 tab/server 只清理本次明确记录的标识。

## 发布 Homebrew 版本

本仓库兼作 Tap。**推送 `vX.Y.Z` tag 会自动验证、发布 GitHub Release，再更新默认分支的 Formula。** 普通分支提交与 PR 只运行 CI；不会发布。暂不发布预发行版本，`v0.2.0-beta` 或版本不匹配的 tag 会失败。

### 维护者操作

先提交本次功能与文档，再提升版本。以下以 `0.1.5` 为例，替换为实际的新版本：

```sh
mise exec -- npm version 0.1.5 --no-git-tag-version
mise exec -- npm run format:check
mise exec -- npm run check
mise exec -- npm test

git add package.json package-lock.json
git commit -m "chore: 发布 0.1.5"
git tag v0.1.5
git push origin main
git push origin v0.1.5
```

tag 必须指向准备发布的提交，且与该提交 `package.json` 的版本严格一致。`npm version` 同步更新锁文件；不要手改锁文件。不要手工修改 Formula 的 URL/SHA，也不用在本机上传 Release 资产。

GitHub Actions 的 **Release** 工作流全部成功后，默认分支会增加一条 `chore: 更新 Homebrew 至 ...` 提交。维护者使用 `git pull --ff-only` 同步这条提交，用户按 README 的 Homebrew 升级方式更新。

### 自动化顺序与权限

1. **verify**：复用 CI，核对 tag/版本，执行格式、类型、测试、AppleScript 编译，并验证独立发布归档。
2. **publish**：在干净构建后生成 `.tar.gz` 和 `.sha256`，解包到临时目录验证 CLI 版本、帮助、配置错误路径和必需资源，再创建草稿 Release、上传资产并正式发布。
3. **formula**：发布成功后，通过 GitHub Contents API 更新默认分支的 Formula URL/SHA。按文件 SHA 做冲突检查，发生并发冲突时重新读取；已是更高版本时不降级，同版本不同 SHA 时拒绝覆盖。

工作流默认只有 `contents: read`；只有 publish/formula 两个 job 获得 `contents: write`。使用仓库内置 `GITHUB_TOKEN`，不需要个人访问令牌。若以后为默认分支设置禁止机器人直写的保护规则，Formula 回写会失败，需要调整为 PR 审核流程；不会绕过保护规则。

Formula 更新在资产正式可下载后发生，避免 Tap 先指向尚未上传的文件。由 `GITHUB_TOKEN` 写回的 Formula 提交不依赖再次触发 CI来完成发布；核心产物已在前置步骤验证。

### 产物与本地排查

```sh
mise exec -- npm ci --ignore-scripts
mise exec -- npm run release
mise exec -- npm run test:package
```

构建会清空 `dist/` 再编译，防止删除或改名的源码留下旧产物。打包只收录运行代码、AppleScript、示例、文档及 TOML 解析器及其许可证，不收录开发依赖。产物在忽略的 `.release/` 下；本地打包不会改动 Formula 或上传文件。

安装逻辑直接维护在 `Formula/iterm2-launcher.rb`；如果修改了安装结构，仍需验证真实 Homebrew 安装及 `brew test`。归档检查不等于 Homebrew 安装验收，也不等于 GUI 验收。CI 与 Release 不启动真实 Agent。

### 失败、重试与回滚

- tag/版本或测试失败：不发布、不更新 Formula。修复代码后使用新的版本/tag，不移动已发布 tag。
- 网络临时失败：可在 Actions 页面重跑失败的 job。
- Release 已存在：重新下载原资产并校验，使用原 SHA 恢复后续步骤，不覆盖同版本资产。已完整上传的草稿可继续发布；草稿缺少资产或校验失败时停止，由维护者检查，不能把损坏资产当成成功发布。
- Formula 回写失败：已发布 Release 保留，用户仍使用旧 Formula；重跑 formula job 即可，不需要重新打包。
- 旧 tag 重跑：可以保留对应 Release，但不会把 Formula 从新版本降回旧版本。
- 功能回滚：优先回退源码后发布更高的补丁版本。需要紧急恢复旧 Formula 时由维护者显式操作，不通过重跑旧工作流绕过防降级规则。

不要重新打包并覆盖已发布版本：gzip 元数据可能改变 SHA-256。正式资产、tag 和版本作为一个整体保留。

维护内容按职责更新：CLI/配置契约更新 README，开发与发布流程更新本文；不要将单次调试日志或历史测试数量追加为长期说明。
