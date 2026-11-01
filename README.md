# iterm2-launcher

按项目目录打开或复用 iTerm2 工作空间。一个命令提供两种模式：iTerm2 原生分屏，或在一个 iTerm2 tab 内运行 Herdr 会话。

仅支持 macOS。使用 TypeScript + AppleScript 实现，通过 Homebrew 安装；不发布 npm 包。配置独立存放在 XDG 目录，不依赖个人 dotfiles 仓库。

## 安装

源码和 Homebrew Formula 位于同一个仓库。首次添加 Tap 时显式指定仓库 URL：

```sh
brew tap yungyu16/iterm2-launcher https://github.com/yungyu16/iterm2-launcher.git
brew install yungyu16/iterm2-launcher/iterm2-launcher
```

运行前需确保当前 PATH 中有 **Node.js 24**，可由 nvm、mise 或其他方式管理；Formula 不强制安装 Homebrew Node。入口会检查 Node 主版本。发布归档已经包含编译后的程序和 TOML 解析器；用户不需要运行 npm、安装 TypeScript 或构建源码。

从 IDE、快捷键或 GUI 启动时，也需为该入口提供正确的 PATH；nvm 的 Shell 函数不会自动出现在 GUI 环境中。入口启动后会将已解析的 Node 绝对路径传给 iTerm2 中的 Herdr 客户端。

另需安装 [iTerm2](https://iterm2.com/)，并确保指定 Profile 已存在。首次调用可能需要在 macOS 设置中允许终端控制 iTerm2；原生模式还会访问 System Events。使用 Herdr 模式时，按 [Herdr 官方安装说明](https://herdr.dev/docs/install/) 安装 `herdr`，使其在启动终端的 PATH 中可用。安装包不自动安装任何 Agent，也不修改 Shell 启动文件。

## 配置

公共包负责窗口、布局、会话管理及配置校验；个人配置负责运行哪些命令、选择哪个 Profile。包内不预置特定 Agent 或个人 Shell 环境，也不会在安装、升级时覆盖用户配置。

个人配置可由自己的 dotfiles 仓库维护，再软链到下述 XDG 路径。仓库位置不属于工具契约，也不需要为 dotfiles 增加专用代码。环境变量仅用于 XDG 目录及运行时 PATH，不再并行提供一套面板命令环境变量。

默认读取 `$XDG_CONFIG_HOME/iterm2-launcher/config.toml`。`XDG_CONFIG_HOME` 未设置或为空时使用 `~/.config/iterm2-launcher/config.toml`；相对路径会报错。

首次复制示例（已有文件不会被覆盖）：

```sh
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/iterm2-launcher"
mkdir -p "$config_dir"
if [ ! -e "$config_dir/config.toml" ]; then
  cp "$(brew --prefix iterm2-launcher)/share/iterm2-launcher/config.toml" "$config_dir/config.toml"
fi
```

然后编辑配置，例如：

```toml
[native]
commands = ["exec zsh", "exec zsh"]

[herdr]
commands = ["exec zsh", "exec zsh"]
```

公共示例只启动普通 Shell，省略 `profile` 时使用名为 `Default` 的 iTerm2 Profile。按个人需求将 `exec zsh` 替换为自己的命令、alias 或 Shell 函数；它们必须在对应 Shell 中可用。

| 配置项 | 约束 |
| --- | --- |
| `profile` | 非空 iTerm2 Profile 名称；省略时为 `Default` |
| `[native].commands` | 1～4 个非空命令，按数组顺序放置 |
| `[herdr].commands` | 恰好两个非空命令，分别位于左、右栏 |

只使用一种模式时可省略另一节。原生模式向 Profile 启动的 Shell 发送命令；Herdr 通过 `/bin/zsh -lic` 执行命令，因此会加载登录交互 Shell 配置。配置中的命令会作为 Shell 代码执行，请只使用可信配置。

配置不存在、TOML 无效或当前模式参数不合法时会在打开 iTerm2 前报错。命令行 `--profile` 覆盖文件中的 `profile`，`--config` 指定替代配置文件。

## 使用

```sh
iterm2-launch native
iterm2-launch herdr /path/to/project
iterm2-launch herdr --config /path/to/config.toml
iterm2-launch --help
iterm2-launch --version
```

项目目录省略时使用当前目录；不存在或不是目录的路径会报错。软链接会规范化为真实目录。

| 原生命令数 | 布局和顺序 |
| --- | --- |
| 1 | 单面板 |
| 2 | 左、右 |
| 3 | 左、右上、右下 |
| 4 | 左上、右上、左下、右下 |

已有项目 tab 直接激活，不重建布局、不重启命令。修改配置只影响新建布局。输出 `created` / `reused` 表示 tab 的处理结果，不代表面板内的应用已经完成启动；应用报错需在对应终端查看。

## 会话与运行边界

- **原生模式**：在首个匹配 Profile 的窗口中，按当前 session 的 `session.path` 查找 tab。依赖 iTerm2 对工作目录的报告；面板内部切换目录可能影响复用。关闭 tab 后不负责恢复进程。
- **Herdr 模式**：按固定项目标识跨窗口查找 tab；内部切换目录不影响归属。关闭 tab 后重新打开，会连接仍在后台运行的同一 session。`ait-` 路径摘要和 `user.agent_in_term_cwd` 保持兼容，能够识别旧工具创建的 Herdr 会话。
- 两种模式的 tab 不互相接管。Herdr 的项目标识不包含 Profile，指定不同 Profile 仍会优先复用该项目已有的 Herdr tab。
- Herdr 初始化中断时保留已有布局，不自动补发命令；请在 Herdr 中手动检查。暂不支持同一项目的并发首次初始化。
- iTerm2 保留了已经结束的 Herdr tab 时，请先关闭该 tab 再打开。机器或 Herdr server 重启后的恢复由 Herdr 决定，不保证原进程仍在。
- Herdr 界面设置仍在它自己的 XDG 配置中，本工具不会覆盖。后台 Herdr 服务由 Herdr 管理，卸载本启动器不会停止它。

## 升级与卸载

```sh
brew update
brew upgrade yungyu16/iterm2-launcher/iterm2-launcher
brew uninstall iterm2-launcher
```

升级和卸载不修改 XDG 配置。Herdr 客户端启动器保持运行直到客户端退出；升级前建议断开客户端，升级后重新连接，后台 pane 不因断开客户端而终止。

窗口选择保留两种旧入口各自的规则：原生模式按各 tab 当前 session 的 Profile 寻找窗口；Herdr 新建 tab 时检查所有 pane 的 Profile。Herdr 已有项目 tab 仍优先按固定项目标识跨窗口复用。

开发、测试、交互验收和发布流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。本项目采用 [MIT License](LICENSE)，归档内 TOML 解析器保留自身许可证。
