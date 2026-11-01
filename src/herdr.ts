import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { basename } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { execute, paneId, query, type HerdrSession } from './herdr-api.js';

// 保留旧工具的名称算法，安装位置变化不创建另一套后台会话。
export function sessionName(project: string): string {
  return 'ait-' + createHash('sha256').update(project).digest('hex').slice(0, 24);
}

export function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

function listWorkspaces(session: HerdrSession): unknown[] {
  const result = query(session, ['workspace', 'list']);
  if (!Array.isArray(result.workspaces)) throw new Error('Herdr 返回缺少 result.workspaces');
  return result.workspaces;
}

async function ensureServer(session: HerdrSession): Promise<unknown[]> {
  try {
    return listWorkspaces(session);
  } catch {
    // 启动 cwd 提示会让 Herdr 自动生成布局，必须先清除再初始化双栏。
    const env = { ...process.env };
    delete env.HERDR_STARTUP_CWD;
    const server = spawn(session.binary, ['--session', session.name, 'server'], {
      cwd: session.project, env, detached: true, stdio: 'ignore',
    });
    let startupError: Error | undefined;
    server.on('error', error => { startupError = error; });
    server.unref();
    for (let attempt = 0; attempt < 50; attempt++) {
      await setTimeout(100);
      if (startupError) throw startupError;
      try { return listWorkspaces(session); } catch { /* 就绪前暂不暴露连接错误。 */ }
    }
    // 超时后返回真实错误，不能把连接失败当成空布局。
    return listWorkspaces(session);
  }
}

function initializeWorkspace(session: HerdrSession, commands: string[]): void {
  const workspace = query(session, ['workspace', 'create', '--cwd', session.project, '--label', basename(session.project), '--focus']);
  const left = paneId(workspace, 'root_pane');
  const split = query(session, ['pane', 'split', left, '--direction', 'right', '--ratio', '0.5', '--cwd', session.project]);
  const right = paneId(split, 'pane');
  for (const [pane, command] of [[left, commands[0]], [right, commands[1]]]) {
    execute(session, ['pane', 'run', pane, '/bin/zsh -lic ' + shellQuote(command)]);
  }
}

async function attachClient(session: HerdrSession): Promise<number> {
  return new Promise((resolve, reject) => {
    const client = spawn(session.binary, ['--session', session.name], { cwd: session.project, stdio: 'inherit' });
    client.once('error', reject);
    client.once('exit', code => resolve(code ?? 1));
  });
}

export async function connect(project: string, name: string, binary: string, commands: string[]): Promise<number> {
  const session = { project, name, binary };
  const workspaces = await ensureServer(session);
  // 包括初始化中断后的非空布局：不重复发送命令，避免重复启动进程。
  if (workspaces.length === 0) initializeWorkspace(session, commands);
  return attachClient(session);
}
