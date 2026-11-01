import { readFileSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { configPath, loadConfig } from './config.js';
import { connect } from './herdr.js';
import { launchHerdr, launchNative, packageRoot } from './iterm.js';

const help = `用法: iterm2-launch <native|herdr> [项目目录] [选项]

项目目录默认当前目录；软链接统一为真实目录。
配置默认为 $XDG_CONFIG_HOME/iterm2-launcher/config.toml，
未设置 XDG_CONFIG_HOME 时使用 ~/.config/iterm2-launcher/config.toml。

选项:
  --profile NAME  覆盖 iTerm2 Profile
  --config FILE   使用指定 TOML 配置
  --help, -h      显示帮助
  --version       显示版本

需要 PATH 中的 Node.js 24 和 iTerm2；herdr 模式额外需要 Herdr。`;

function parseCli(args: string[]) {
  return parseArgs({
    args,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean' },
      config: { type: 'string' },
      profile: { type: 'string' },
    },
    allowPositionals: true,
  });
}

function projectDirectory(path: string): string {
  const project = realpathSync(path);
  if (!statSync(project).isDirectory()) throw new Error('项目路径必须是目录');
  return project;
}

async function runSession(args: string[]): Promise<number> {
  if (args.length !== 4) throw new Error('内部会话入口参数不完整');
  const [project, name, binary, encoded] = args;
  const commands = JSON.parse(encoded);
  // 内部入口也校验，不把外部传入的数组直接交给 Shell。
  if (!Array.isArray(commands) || commands.length !== 2 || commands.some(command => typeof command !== 'string' || !command.trim())) {
    throw new Error('内部会话入口需要两个非空命令');
  }
  return connect(projectDirectory(project), name, binary, commands);
}

async function dispatch(args: string[]): Promise<number> {
  if (process.versions.node.split('.')[0] !== '24') throw new Error(`需要 Node.js 24，当前为 ${process.version}；请通过 nvm 或 mise 切换`);
  // iTerm2 创建的客户端走同一入口，参数由 AppleScript 逐个引用。
  if (args[0] === '_session') return runSession(args.slice(1));

  const { values, positionals } = parseCli(args);
  if (values.help) { console.log(help); return 0; }
  if (values.version) {
    console.log(JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version);
    return 0;
  }
  const [mode, directory = process.cwd()] = positionals;
  if ((mode !== 'native' && mode !== 'herdr') || positionals.length > 2) throw new Error('请指定 native 或 herdr 及可选项目目录；参见 --help');
  const project = projectDirectory(directory);
  const path = values.config ? resolve(values.config) : configPath();
  const config = loadConfig(path, mode, values.profile);
  if (process.platform !== 'darwin') throw new Error('仅支持 macOS 和 iTerm2');
  return mode === 'native' ? launchNative(project, config) : launchHerdr(project, config);
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  try {
    process.exitCode = await dispatch(args);
  } catch (error) {
    console.error(`错误: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
