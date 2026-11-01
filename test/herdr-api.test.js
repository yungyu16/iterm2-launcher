import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execute, probeHerdr, query, HerdrCommandError } from '../dist/src/herdr-api.js';

function withBinary(body, callback) {
    const dir = mkdtempSync(join(tmpdir(), 'herdr-api-test-'));
    const binary = join(dir, 'herdr');
    writeFileSync(binary, `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
    try {
        callback({ project: dir, name: 'isolated', binary });
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

for (const operation of ['api', 'version']) {
    test(operation + ' 超时终止忽略 SIGTERM 的请求子进程', () => {
        withBinary(`require('node:fs').writeFileSync(__filename+'.pid', String(process.pid)); process.on('SIGTERM',()=>{}); setInterval(()=>{},1000);`, (session) => {
            const started = performance.now();
            assert.throws(
                () => (operation === 'api' ? execute(session, ['workspace', 'list'], 1000) : probeHerdr(session.binary, 1000)),
                (error) => error instanceof HerdrCommandError && error.code === 'request_timeout',
            );
            assert.ok(performance.now() - started < 3000);
            const pid = Number(readFileSync(session.binary + '.pid', 'utf8'));
            assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
        });
    });
}

test('成功动作允许空输出；查询仍需有效 JSON result', () => {
    withBinary('', (session) => {
        assert.equal(execute(session, ['pane', 'run', 'p1', 'true']), '');
        assert.throws(() => query(session, ['workspace', 'list']), /无效 JSON/);
    });
});

test('成功退出码中的结构化错误也保留错误类型', () => {
    withBinary(`console.log(JSON.stringify({error:{code:'permission_denied',message:'denied'}}));`, (session) => {
        assert.throws(
            () => query(session, ['workspace', 'list']),
            (error) => error instanceof HerdrCommandError && error.code === 'permission_denied',
        );
    });
});
