import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const gh = (args: string[], input?: string) => execFileSync('gh', args, { encoding: 'utf8', input });

function verifyPackage(directory: string, releaseVersion: string): string {
    parseVersion(releaseVersion);
    const name = `iterm2-launcher-${releaseVersion}`;
    const filename = `${name}.tar.gz`;
    const archive = resolve(directory, filename);
    const checksum = verifyChecksum(readFileSync(archive), readFileSync(`${archive}.sha256`, 'utf8'), filename);
    const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
    if (entries.some((entry) => !entry.startsWith(`${name}/`) || entry.split('/').includes('..'))) throw new Error('归档包含预期目录外的路径');
    const unpack = mkdtempSync(join(tmpdir(), 'iterm2-release-check-'));
    try {
        execFileSync('tar', ['-xzf', archive, '-C', unpack]);
        const root = join(unpack, name);
        for (const path of ['dist/src/bin.js', 'scripts/iterm/common.applescript', 'scripts/iterm/native.applescript', 'scripts/iterm/herdr.applescript', 'examples/config.toml', 'node_modules/smol-toml/LICENSE']) {
            if (!existsSync(join(root, path))) throw new Error(`归档缺少 ${path}`);
        }
        const cli = join(root, 'dist/src/bin.js');
        const actual = execFileSync(process.execPath, [cli, '--version'], { cwd: unpack, encoding: 'utf8' }).trim();
        if (actual !== releaseVersion) throw new Error('归档内版本不一致');
        execFileSync(process.execPath, [cli, '--help'], { cwd: unpack });
        const config = join(unpack, 'invalid.toml');
        writeFileSync(config, '[native]\ncommands = []\n');
        const invalid = spawnSync(process.execPath, [cli, 'native', '--config', config], { cwd: unpack, encoding: 'utf8' });
        if (invalid.status !== 1 || !invalid.stderr.includes('native')) throw new Error('归档配置校验失败');
    } finally {
        rmSync(unpack, { recursive: true, force: true });
    }
    return checksum;
}

function publish(version: string): void {
    const tag = process.env.GITHUB_REF_NAME ?? '';
    const repository = process.env.GITHUB_REPOSITORY ?? '';
    validateTag(tag, version);
    if (!repository) throw new Error('缺少 GITHUB_REPOSITORY');
    const name = `iterm2-launcher-${version}.tar.gz`;
    const probe = spawnSync('gh', ['release', 'view', tag, '--repo', repository, '--json', 'isDraft'], { encoding: 'utf8' });
    let directory = '.release';
    let draft = true;
    if (probe.status === 0) {
        // 重试使用远端原资产；不使用本次重新打包的字节覆盖同版本文件。
        draft = JSON.parse(probe.stdout).isDraft;
        directory = mkdtempSync(join(tmpdir(), 'iterm2-existing-release-'));
        gh(['release', 'download', tag, '--repo', repository, '--dir', directory, '--pattern', name, '--pattern', `${name}.sha256`]);
    } else {
        verifyPackage(directory, version);
        gh(['release', 'create', tag, join(directory, name), join(directory, `${name}.sha256`), '--repo', repository, '--verify-tag', '--draft', '--title', tag, '--generate-notes']);
    }
    try {
        const checksum = verifyPackage(directory, version);
        if (draft) gh(['release', 'edit', tag, '--repo', repository, '--draft=false']);
        if (!process.env.GITHUB_OUTPUT) throw new Error('缺少 GITHUB_OUTPUT');
        appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nchecksum=${checksum}\n`);
    } finally {
        if (directory !== '.release') rmSync(directory, { recursive: true, force: true });
    }
}

function publishFormula(releaseVersion: string, checksum: string): void {
    parseVersion(releaseVersion);
    const repository = process.env.GITHUB_REPOSITORY ?? '';
    const branch = process.env.DEFAULT_BRANCH ?? '';
    if (!branch || !repository) throw new Error('缺少默认分支或仓库');
    const endpoint = `repos/${repository}/contents/Formula/iterm2-launcher.rb`;
    // Contents API 使用文件 SHA 做乐观锁；并发发布时重新读取版本，避免降级或覆盖。
    for (let attempt = 0; attempt < 3; attempt++) {
        const current = JSON.parse(gh(['api', `${endpoint}?ref=${encodeURIComponent(branch)}`]));
        const content = Buffer.from(current.content, 'base64').toString('utf8');
        const next = updateFormula(content, releaseVersion, checksum, repository);
        if (next === content) {
            console.log('Formula 已是该版本或更高版本，无需更新');
            return;
        }
        const body = JSON.stringify({ message: `chore: 更新 Homebrew 至 ${releaseVersion}`, content: Buffer.from(next).toString('base64'), sha: current.sha, branch });
        const result = spawnSync('gh', ['api', '--method', 'PUT', endpoint, '--input', '-'], { input: body, encoding: 'utf8' });
        if (result.status === 0) {
            console.log(`Formula 已更新至 ${releaseVersion}`);
            return;
        }
        if (!result.stderr.includes('409') || attempt === 2) throw new Error(result.stderr || 'Formula 更新失败');
    }
}

// 发布规则保持纯函数，供测试直接调用；导入模块不会读取项目文件或访问 GitHub。
export function parseVersion(value: string): number[] {
    if (value !== value.trim() || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error(`版本必须为 x.y.z：${value}`);
    return value.split('.').map(Number);
}

export function validateTag(tag: string, version: string): void {
    parseVersion(version);
    if (tag !== `v${version}`) throw new Error(`tag ${tag} 与 package.json 版本 ${version} 不一致`);
}

export function verifyChecksum(archive: Uint8Array, checksumFile: string, filename: string): string {
    const expected = checksumFile.trim().split(/\s+/);
    if (expected.length !== 2 || expected[1] !== filename || !/^[a-f0-9]{64}$/.test(expected[0])) throw new Error('校验文件格式或归档名称不正确');
    const actual = createHash('sha256').update(archive).digest('hex');
    if (actual !== expected[0]) throw new Error('发布归档 SHA-256 不匹配');
    return actual;
}

export function updateFormula(formula: string, version: string, checksum: string, repository: string): string {
    const target = parseVersion(version);
    if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error('无效 SHA-256');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('无效 GitHub 仓库名');
    const urls = [...formula.matchAll(/^  url "([^"]+)"$/gm)];
    const hashes = [...formula.matchAll(/^  sha256 "([a-f0-9]{64})"$/gm)];
    if (urls.length !== 1 || hashes.length !== 1) throw new Error('Formula 必须有唯一的 URL 和 SHA-256');
    const currentMatch = urls[0][1].match(/\/releases\/download\/v([^/]+)\//);
    if (!currentMatch) throw new Error('Formula 当前版本无法识别');
    const current = parseVersion(currentMatch[1]);
    for (let i = 0; i < 3; i++) {
        if (current[i] > target[i]) return formula; // 旧 tag 的重试不能让 Tap 降级。
        if (current[i] < target[i]) break;
        if (i === 2) {
            if (hashes[0][1] !== checksum) throw new Error('同一版本的校验和不同，拒绝覆盖已发布版本');
            return formula;
        }
    }
    const url = `https://github.com/${repository}/releases/download/v${version}/iterm2-launcher-${version}.tar.gz`;
    return formula.replace(urls[0][0], () => `  url "${url}"`).replace(hashes[0][0], () => `  sha256 "${checksum}"`);
}

function main(): void {
    const version: string = JSON.parse(readFileSync('package.json', 'utf8')).version;
    const [action, releaseVersion = '', checksum = ''] = process.argv.slice(2);
    switch (action) {
        case 'check-tag':
            validateTag(process.env.GITHUB_REF_NAME ?? '', version);
            break;
        case 'verify-package':
            console.log('SHA256 ' + verifyPackage('.release', version));
            break;
        case 'publish':
            publish(version);
            break;
        case 'update-formula':
            publishFormula(releaseVersion, checksum);
            break;
        default:
            throw new Error('需要 check-tag / verify-package / publish / update-formula');
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        main();
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
