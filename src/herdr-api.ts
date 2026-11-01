import { spawnSync } from 'node:child_process';

export const HERDR_REQUEST_TIMEOUT_MS = 5000;

export interface HerdrSession {
    project: string;
    name: string;
    binary: string;
}

export class HerdrCommandError extends Error {
    constructor(
        message: string,
        public readonly code?: string,
    ) {
        super(message);
        this.name = 'HerdrCommandError';
    }
}

function responseError(output: string): { code: string; message: string } | undefined {
    try {
        const error = JSON.parse(output)?.error;
        if (typeof error?.code === 'string' && typeof error.message === 'string') return error;
    } catch {
        /* 非 JSON 错误保留原文，不按字符串猜测服务状态。 */
    }
    return undefined;
}

function runCommand(binary: string, args: string[], timeoutMs: number, cwd?: string): string {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Herdr 请求超时必须是正数');
    const result = spawnSync(binary, args, {
        cwd,
        encoding: 'utf8',
        timeout: Math.max(1, Math.ceil(timeoutMs)),
        // 同步调用若仅发送可忽略的 SIGTERM，可能继续等待子进程而失去时间边界。
        killSignal: 'SIGKILL',
    });
    if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT') throw new HerdrCommandError(`Herdr 请求超时（${Math.ceil(timeoutMs)}ms）：${args.join(' ')}`, 'request_timeout');
    if (result.error) throw result.error;
    if (result.status !== 0) {
        const error = responseError(result.stderr) ?? responseError(result.stdout);
        throw new HerdrCommandError(error?.message || result.stderr.trim() || result.stdout.trim() || `Herdr 退出码 ${result.status}`, error?.code);
    }
    return result.stdout;
}

export function probeHerdr(binary: string, timeoutMs = HERDR_REQUEST_TIMEOUT_MS): void {
    runCommand(binary, ['--version'], timeoutMs);
}

// 动作命令允许没有 stdout；每次调用显式指定 session，避免操作父会话。
export function execute(session: HerdrSession, args: string[], timeoutMs = HERDR_REQUEST_TIMEOUT_MS): string {
    return runCommand(session.binary, ['--session', session.name, ...args], timeoutMs, session.project);
}

export function query(session: HerdrSession, args: string[], timeoutMs = HERDR_REQUEST_TIMEOUT_MS): Record<string, unknown> {
    const output = execute(session, args, timeoutMs);
    let response;
    try {
        response = JSON.parse(output);
    } catch {
        throw new Error(`Herdr ${args.join(' ')} 返回无效 JSON`);
    }
    const error = responseError(output);
    if (error) throw new HerdrCommandError(error.message, error.code);
    if (!response?.result || typeof response.result !== 'object' || Array.isArray(response.result)) {
        throw new Error(`Herdr ${args.join(' ')} 返回缺少有效 result`);
    }
    return response.result;
}

export function paneId(result: Record<string, unknown>, field: 'root_pane' | 'pane'): string {
    const pane = result[field] as { pane_id?: unknown } | undefined;
    if (typeof pane?.pane_id !== 'string' || !pane.pane_id) throw new Error(`Herdr 返回缺少 ${field}.pane_id`);
    return pane.pane_id;
}
