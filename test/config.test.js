import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { configPath, loadConfig, validateConfig } from '../dist/src/config.js';
import { sessionName, shellQuote } from '../dist/src/herdr.js';

test('XDG 路径、默认目录与相对路径拒绝', () => {
    assert.equal(configPath({}, '/home/example'), '/home/example/.config/iterm2-launcher/config.toml');
    assert.equal(configPath({ XDG_CONFIG_HOME: '/tmp/custom' }), '/tmp/custom/iterm2-launcher/config.toml');
    assert.throws(() => configPath({ XDG_CONFIG_HOME: 'relative' }));
});
test('命令数量和类型校验，模式配置互不依赖', () => {
    for (let n = 1; n <= 4; n++) assert.equal(validateConfig({ native: { commands: Array(n).fill('zsh') } }, 'native').commands.length, n);
    for (const commands of [[], [''], [' '], [1], Array(5).fill('zsh')]) assert.throws(() => validateConfig({ native: { commands } }, 'native'));
    assert.throws(() => validateConfig({ herdr: { commands: ['zsh'] } }, 'herdr'));
    assert.equal(validateConfig({ profile: 'A', herdr: { commands: ['pi', 'cdx'] } }, 'herdr', 'B').profile, 'B');
});
test('读取真实 TOML、保留引号，并提供文件错误上下文', () => {
    const dir = mkdtempSync(join(tmpdir(), 'launcher-test-'));
    const path = join(dir, 'config.toml');
    try {
        writeFileSync(path, `profile = "Default"\n[native]\ncommands = ["echo 'hello'", "zsh"]\n`);
        assert.equal(loadConfig(path, 'native').commands[0], "echo 'hello'");
        writeFileSync(path, 'broken = [');
        assert.throws(() => loadConfig(path, 'native'), /config.toml/);
    } finally {
        rmSync(dir, { recursive: true });
    }
});
test('Herdr 会话标识兼容既有 SHA256 算法，Shell 引号可往返', () => {
    assert.equal(sessionName('/tmp/example'), 'ait-f33aa9244af53b8803b7c0c7');
    const value = "echo 'hello'; $(false)\nspace";
    const result = spawnSync('/bin/sh', ['-c', 'printf %s ' + shellQuote(value)], { encoding: 'utf8' });
    assert.equal(result.stdout, value);
});
test('帮助和版本不需要配置或 GUI，未知命令失败', () => {
    for (const arg of ['--help', '--version']) assert.equal(spawnSync(process.execPath, ['dist/src/bin.js', arg]).status, 0);
    assert.equal(spawnSync(process.execPath, ['dist/src/bin.js', 'unknown']).status, 1);
});
