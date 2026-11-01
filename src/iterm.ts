import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionName, shellQuote } from './herdr.js';
import type { Mode, LaunchConfig } from './config.js';

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scripts = join(packageRoot, 'scripts/iterm');

function runAppleScript(mode: Mode, args: string[]): number {
  const result = spawnSync('/usr/bin/osascript', [
    join(scripts, `${mode}.applescript`), ...args, join(scripts, 'common.applescript'),
  ], { stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function findHerdr(): string {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const binary = resolve(directory, 'herdr');
    try {
      if (statSync(binary).isFile() && spawnSync(binary, ['--version'], { stdio: 'ignore' }).status === 0) return binary;
    } catch { /* PATH 中没有这个文件，继续检查下一个目录。 */ }
  }
  throw new Error('PATH 中找不到可运行的 Herdr，请先安装');
}

export function launchNative(project: string, config: LaunchConfig): number {
  const commands = Array.from({ length: 4 }, (_, index) => config.commands[index] ?? '');
  return runAppleScript('native', [project, config.profile, ...commands]);
}

export function launchHerdr(project: string, config: LaunchConfig): number {
  // mise 等管理器的 shim 仍依赖 PATH；仅传可执行文件绝对路径不足以恢复环境。
  const environment = ['PATH', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME']
    .filter(key => process.env[key] !== undefined)
    .map(key => key + '=' + process.env[key]);
  const args = [
    '/usr/bin/env', ...environment, process.execPath,
    join(packageRoot, 'dist/bin/iterm2-launch.js'), '_session',
    project, sessionName(project), findHerdr(), JSON.stringify(config.commands),
  ];
  const command = args.map(shellQuote).join(' ');
  return runAppleScript('herdr', [project, config.profile, command]);
}
