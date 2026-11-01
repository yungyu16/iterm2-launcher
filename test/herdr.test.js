import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(scenario, callback) {
    const dir = mkdtempSync(join(tmpdir(), "launcher ' test-"));
    const binary = join(dir, 'herdr');
    const log = join(dir, 'calls.jsonl');
    writeFileSync(
        binary,
        `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify(args) + '\\n');
const command = args.slice(2);
const scenario = process.env.SCENARIO;
if (!command.length) process.exit(0);
const marker = process.env.CALL_LOG + '.started';
if (command[0] === 'server') { fs.writeFileSync(marker, 'started'); process.exit(0); }
function unavailable(stream = 'stderr') {
  const message = JSON.stringify({error:{code:'server_not_running',message:'test server unavailable'}});
  process[stream].write(message); process.exit(1);
}
if (command.join(' ') === 'workspace list') {
  if (scenario === 'initial-hang') { process.on('SIGTERM',()=>{}); setInterval(()=>{},1000); return; }
  if (scenario === 'invalid-json') { console.log('not-json'); process.exit(0); }
  if (scenario === 'schema-error') { console.log('{"result":{"workspaces":null}}'); process.exit(0); }
  if (scenario === 'permission-error') { console.error(JSON.stringify({error:{code:'permission_denied',message:'test denied'}})); process.exit(1); }
  if (scenario === 'plain-error') { console.error('server_not_running'); process.exit(1); }
  if (scenario.startsWith('startup')) {
    if (!fs.existsSync(marker) || scenario === 'startup-never') unavailable(scenario === 'startup-stdout' ? 'stdout' : 'stderr');
    if (scenario === 'startup-schema') { console.log('{"result":{"workspaces":null}}'); process.exit(0); }
    if (scenario === 'startup-hang') { process.on('SIGTERM',()=>{}); setInterval(()=>{},1000); return; }
    console.log('{"result":{"workspaces":[{}]}}'); process.exit(0);
  }
}
let result;
if (command.join(' ') === 'workspace list') {
  result = {workspaces: scenario === 'existing' ? [{id:'old'}] : []};
} else if (command[0] === 'workspace') {
  result = {root_pane: {pane_id: 'left'}};
} else if (command[1] === 'split') {
  if (scenario === 'split-failure') { console.error('split failed'); process.exit(1); }
  result = {pane: {pane_id:'right'}};
} else { process.exit(0); }
console.log(JSON.stringify({result}));
`,
        { mode: 0o755 },
    );
    try {
        const commands = ["echo 'left'; echo $HOME", 'echo right'];
        const started = performance.now();
        const result = spawnSync(process.execPath, [resolve('dist/src/bin.js'), '_session', dir, 'ait-test', binary, JSON.stringify(commands)], {
            encoding: 'utf8',
            env: { ...process.env, CALL_LOG: log, SCENARIO: scenario },
            timeout: 10000,
        });
        callback(result, readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse), performance.now() - started);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('新建 Herdr 布局：显式 session，创建双栏并各执行一次命令', () => {
    fixture('new', (result, calls) => {
        assert.equal(result.status, 0, result.stderr);
        assert.ok(calls.every((args) => args[0] === '--session' && args[1] === 'ait-test'));
        assert.deepEqual(
            calls.map((args) => args.slice(2, 4)),
            [['workspace', 'list'], ['workspace', 'create'], ['pane', 'split'], ['pane', 'run'], ['pane', 'run'], []],
        );
        const run = calls[3];
        assert.equal(run[4], 'left');
        assert.ok(run[5].startsWith('/bin/zsh -lic '));
    });
});
test('已有布局只连接客户端，不重复创建或运行命令', () => {
    fixture('existing', (result, calls) => {
        assert.equal(result.status, 0, result.stderr);
        assert.equal(calls.length, 2);
        assert.deepEqual(calls[1], ['--session', 'ait-test']);
    });
});
test('分屏失败时停止初始化，不启动命令或客户端', () => {
    fixture('split-failure', (result, calls) => {
        assert.equal(result.status, 1);
        assert.match(result.stderr, /split failed/);
        assert.equal(calls.length, 3);
    });
});

for (const scenario of ['invalid-json', 'schema-error', 'permission-error', 'plain-error']) {
    test(scenario + ' 立即失败且不启动 server', () => {
        fixture(scenario, (result, calls) => {
            assert.equal(result.status, 1, result.stderr);
            assert.deepEqual(
                calls.map((args) => args.slice(2)),
                [['workspace', 'list']],
            );
        });
    });
}
for (const scenario of ['startup', 'startup-stdout']) {
    test(scenario + ' 仅在明确未运行时启动一次并连接', () => {
        fixture(scenario, (result, calls) => {
            assert.equal(result.status, 0, result.stderr);
            assert.equal(calls.filter((args) => args[2] === 'server').length, 1);
            assert.deepEqual(calls.at(-1), ['--session', 'ait-test']);
            assert.ok(!calls.some((args) => args[2] === 'pane'));
        });
    });
}
test('启动后协议错误立即退出，不继续轮询或创建布局', () => {
    fixture('startup-schema', (result, calls) => {
        assert.equal(result.status, 1);
        assert.match(result.stderr, /result.workspaces/);
        assert.equal(calls.filter((args) => args[2] === 'workspace').length, 2);
    });
});
for (const scenario of ['startup-never', 'startup-hang']) {
    test(scenario + ' 受总预算限制，无超时后的额外请求', () => {
        fixture(scenario, (result, calls, elapsed) => {
            assert.equal(result.error, undefined, '应由启动器退出，不能依赖测试的外部超时');
            assert.equal(result.status, 1);
            assert.match(result.stderr, /未就绪|请求超时/);
            assert.ok(elapsed < 8000, '轮询和请求共享启动预算');
            assert.equal(calls.filter((args) => args[2] === 'server').length, 1);
            assert.ok(!calls.some((args) => args[2] === 'pane' || args.length === 2));
            if (scenario === 'startup-hang') assert.equal(calls.filter((args) => args[2] === 'workspace').length, 2);
        });
    });
}

test('首次查询超时不启动 server，也不初始化布局', () => {
    fixture('initial-hang', (result, calls, elapsed) => {
        assert.equal(result.error, undefined);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /请求超时/);
        assert.ok(elapsed < 8000);
        assert.deepEqual(
            calls.map((args) => args.slice(2)),
            [['workspace', 'list']],
        );
    });
});
