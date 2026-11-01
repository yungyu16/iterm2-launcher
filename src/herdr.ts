import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { basename } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { execute, paneId, query, HerdrCommandError, HERDR_REQUEST_TIMEOUT_MS, type HerdrSession } from './herdr-api.js';

// 保留旧工具的名称算法，安装位置变化不创建另一套后台会话。
export function sessionName(project: string): string {
    return 'ait-' + createHash('sha256').update(project).digest('hex').slice(0, 24);
}

export function shellQuote(value: string): string {
    return "'" + value.replaceAll("'", "'\\''") + "'";
}

function listWorkspaces(session: HerdrSession, timeoutMs = HERDR_REQUEST_TIMEOUT_MS): unknown[] {
    const result = query(session, ['workspace', 'list'], timeoutMs);
    if (!Array.isArray(result.workspaces)) throw new Error('Herdr 返回缺少 result.workspaces');
    return result.workspaces;
}

const SERVER_START_TIMEOUT_MS = 5000;

function serverNotRunning(error: unknown): boolean {
    return error instanceof HerdrCommandError && error.code === 'server_not_running';
}

async function ensureServer(session: HerdrSession): Promise<unknown[]> {
    try {
        return listWorkspaces(session);
    } catch (error) {
        // 只有明确的服务未运行错误可触发启动；协议、权限、超时错误直接返回。
        if (!serverNotRunning(error)) throw error;
    }
    const deadline = performance.now() + SERVER_START_TIMEOUT_MS;
    const env = { ...process.env };
    // 防止 Herdr 按继承的 cwd 提示抢先创建默认布局。
    delete env.HERDR_STARTUP_CWD;
    const server = spawn(session.binary, ['--session', session.name, 'server'], {
        cwd: session.project,
        env,
        detached: true,
        stdio: 'ignore',
    });
    let startupError: Error | undefined;
    server.on('error', (error) => {
        startupError = error;
    });
    server.unref();
    let lastError: unknown;
    while (performance.now() < deadline) {
        await setTimeout(Math.min(100, Math.max(0, deadline - performance.now())));
        if (startupError) throw startupError;
        const remaining = deadline - performance.now();
        if (remaining <= 0) break;
        try {
            return listWorkspaces(session, Math.min(HERDR_REQUEST_TIMEOUT_MS, remaining));
        } catch (error) {
            if (!serverNotRunning(error)) throw error;
            lastError = error;
        }
    }
    // 预算耗尽后不再补发请求，也不停止可能稍后就绪的后台服务。
    const detail = lastError instanceof Error ? '：' + lastError.message : '';
    throw new HerdrCommandError('Herdr 服务在 5000ms 内未就绪' + detail, 'startup_timeout');
}

function initializeWorkspace(session: HerdrSession, commands: string[]): void {
    const workspace = query(session, ['workspace', 'create', '--cwd', session.project, '--label', basename(session.project), '--focus']);
    const left = paneId(workspace, 'root_pane');
    const split = query(session, ['pane', 'split', left, '--direction', 'right', '--ratio', '0.5', '--cwd', session.project]);
    const right = paneId(split, 'pane');
    for (const [pane, command] of [
        [left, commands[0]],
        [right, commands[1]],
    ]) {
        execute(session, ['pane', 'run', pane, '/bin/zsh -lic ' + shellQuote(command)]);
    }
}

// 继承终端供 Herdr 交互；客户端退出只回传状态，不停止后台 server。
async function attachClient(session: HerdrSession): Promise<number> {
    return new Promise((resolve, reject) => {
        const client = spawn(session.binary, ['--session', session.name], { cwd: session.project, stdio: 'inherit' });
        client.once('error', reject);
        client.once('exit', (code) => resolve(code ?? 1));
    });
}

export async function connect(project: string, name: string, binary: string, commands: string[]): Promise<number> {
    const session = { project, name, binary };
    const workspaces = await ensureServer(session);
    // 包括初始化中断后的非空布局：不重复发送命令，避免重复启动进程。
    if (workspaces.length === 0) initializeWorkspace(session, commands);
    return attachClient(session);
}
