#!/usr/bin/env node
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { configPath, loadConfig } from './config.js';
import { launch, type LaunchRequest } from './launch.js';
import { packageRoot } from './iterm.js';

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

function projectDirectory(path: string): string {
    const project = realpathSync(path);
    if (!statSync(project).isDirectory()) throw new Error('项目路径必须是目录');
    return project;
}

function parseSession(args: string[]): LaunchRequest {
    if (args.length !== 4) throw new Error('内部会话入口参数不完整');
    const [project, name, binary, encoded] = args;
    const commands = JSON.parse(encoded);
    if (!Array.isArray(commands) || commands.length !== 2 || commands.some((command) => typeof command !== 'string' || !command.trim() || command.includes('\0'))) {
        throw new Error('内部会话入口需要两个非空命令');
    }
    return { kind: 'session', project: projectDirectory(project), name, binary, commands };
}

function parseRequest(args: string[]): LaunchRequest | undefined {
    if (process.versions.node.split('.')[0] !== '24') throw new Error(`需要 Node.js 24，当前为 ${process.version}；请通过 nvm 或 mise 切换`);
    // 内部会话复用同一个入口，但不重新读取用户配置，以免初始化途中配置变化。
    if (args[0] === '_session') return parseSession(args.slice(1));

    const { values, positionals } = parseArgs({
        args,
        options: {
            help: { type: 'boolean', short: 'h' },
            version: { type: 'boolean' },
            config: { type: 'string' },
            profile: { type: 'string' },
        },
        allowPositionals: true,
    });
    // 帮助和版本无需项目配置、iTerm2 或 Herdr，便于安装后检查入口。
    if (values.help) {
        console.log(help);
        return;
    }
    if (values.version) {
        console.log(JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version);
        return;
    }
    const [mode, directory = process.cwd()] = positionals;
    if ((mode !== 'native' && mode !== 'herdr') || positionals.length > 2) throw new Error('请指定 native 或 herdr 及可选项目目录；参见 --help');
    const project = projectDirectory(directory);
    const path = values.config ? resolve(values.config) : configPath();
    // 在产生窗口或后台进程之前，先校验所有本地输入。
    const config = loadConfig(path, mode, values.profile);
    return { kind: 'workspace', mode, project, config };
}

try {
    const request = parseRequest(process.argv.slice(2));
    if (request) {
        if (process.platform !== 'darwin') throw new Error('仅支持 macOS 和 iTerm2');
        process.exitCode = await launch(request);
    }
} catch (error) {
    console.error(`错误: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
}
