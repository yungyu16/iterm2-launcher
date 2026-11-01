import type { LaunchConfig, Mode } from './config.js';
import { connect } from './herdr.js';
import { launchHerdr, launchNative } from './iterm.js';

// 请求在 CLI 边界完成校验；启动层不读取 argv，也不修改全局退出状态。
export type LaunchRequest = { kind: 'workspace'; mode: Mode; project: string; config: LaunchConfig } | { kind: 'session'; project: string; name: string; binary: string; commands: string[] };

export async function launch(request: LaunchRequest): Promise<number> {
    if (request.kind === 'session') {
        return connect(request.project, request.name, request.binary, request.commands);
    }
    return request.mode === 'native' ? launchNative(request.project, request.config) : launchHerdr(request.project, request.config);
}
