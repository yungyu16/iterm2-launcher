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
        const result = spawnSync(process.execPath, [resolve('dist/src/bin.js'), '_session', dir, 'ait-test', binary, JSON.stringify(commands)], {
            encoding: 'utf8',
            env: { ...process.env, CALL_LOG: log, SCENARIO: scenario },
            timeout: 10000,
        });
        callback(result, readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse));
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
