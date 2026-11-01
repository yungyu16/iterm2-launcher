import { spawnSync } from 'node:child_process';

export interface HerdrSession {
  project: string;
  name: string;
  binary: string;
}

// Herdr 的动作命令可能没有 stdout；只有查询才解析 JSON。
export function execute(session: HerdrSession, args: string[]): string {
  const result = spawnSync(session.binary, ['--session', session.name, ...args], {
    cwd: session.project,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || `Herdr 退出码 ${result.status}`);
  return result.stdout;
}

export function query(session: HerdrSession, args: string[]): Record<string, unknown> {
  const response = JSON.parse(execute(session, args));
  if (!response.result || typeof response.result !== 'object') {
    throw new Error(`Herdr ${args.join(' ')} 返回缺少 result`);
  }
  return response.result;
}

export function paneId(result: Record<string, unknown>, field: 'root_pane' | 'pane'): string {
  const pane = result[field] as { pane_id?: unknown } | undefined;
  if (typeof pane?.pane_id !== 'string' || !pane.pane_id) {
    throw new Error(`Herdr 返回缺少 ${field}.pane_id`);
  }
  return pane.pane_id;
}
