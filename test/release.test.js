import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseVersion, validateTag, verifyChecksum, updateFormula } from '../scripts/publish.ts';

const oldHash = 'a'.repeat(64);
const newHash = 'b'.repeat(64);
const formula = `class Iterm2Launcher < Formula\n  url "https://github.com/example/launcher/releases/download/v1.2.3/iterm2-launcher-1.2.3.tar.gz"\n  sha256 "${oldHash}"\nend\n`;

test('发布 tag 必须严格匹配稳定版本', () => {
    validateTag('v1.2.3', '1.2.3');
    for (const version of ['1.2', '1.2.3-beta', '01.2.3', '1.2.3\n']) assert.throws(() => parseVersion(version));
    assert.throws(() => validateTag('v1.2.4', '1.2.3'));
    assert.throws(() => validateTag('1.2.3', '1.2.3'));
});

test('归档校验同时验证字节、文件名和摘要格式', () => {
    const data = Buffer.from('release');
    const sha = createHash('sha256').update(data).digest('hex');
    assert.equal(verifyChecksum(data, `${sha}  package.tar.gz\n`, 'package.tar.gz'), sha);
    assert.throws(() => verifyChecksum(Buffer.from('changed'), `${sha}  package.tar.gz`, 'package.tar.gz'));
    assert.throws(() => verifyChecksum(data, `${sha}  other.tar.gz`, 'package.tar.gz'));
    assert.throws(() => verifyChecksum(data, 'invalid  package.tar.gz', 'package.tar.gz'));
});

test('Formula 更新仅替换 URL 与 SHA，保留安装逻辑', () => {
    const next = updateFormula(formula, '1.3.0', newHash, 'example/launcher');
    assert.match(next, /download\/v1\.3\.0\/iterm2-launcher-1\.3\.0.tar.gz/);
    assert.ok(next.includes(newHash));
    assert.ok(next.startsWith('class Iterm2Launcher < Formula\n'));
});

test('旧版本不降级，同版本重试幂等且拒绝摘要变化', () => {
    assert.equal(updateFormula(formula, '1.1.9', newHash, 'example/launcher'), formula);
    assert.equal(updateFormula(formula, '1.2.3', oldHash, 'example/launcher'), formula);
    assert.throws(() => updateFormula(formula, '1.2.3', newHash, 'example/launcher'));
    const next = updateFormula(formula, '1.10.0', newHash, 'example/launcher');
    assert.equal(updateFormula(next, '1.9.0', oldHash, 'example/launcher'), next);
});

test('Formula 格式不匹配时失败，不能静默更新一半', () => {
    assert.throws(() => updateFormula('class Example < Formula\nend', '1.3.0', newHash, 'example/launcher'));
    assert.throws(() => updateFormula(formula + `  sha256 "${oldHash}"\n`, '1.3.0', newHash, 'example/launcher'));
    assert.throws(() => updateFormula(formula, '1.3.0', newHash, 'invalid/repo/extra'));
});
