import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseVersion, updateFormula, validateTag, verifyChecksum } from './release-utils.ts';

const version: string = JSON.parse(readFileSync('package.json', 'utf8')).version;
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

function publish(): void {
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

function publishFormula(): void {
    const [releaseVersion, checksum] = process.argv.slice(3);
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

try {
    const action = process.argv[2];
    if (action === 'check-tag') validateTag(process.env.GITHUB_REF_NAME ?? '', version);
    else if (action === 'verify-package') console.log(`SHA256 ${verifyPackage('.release', version)}`);
    else if (action === 'publish') publish();
    else if (action === 'update-formula') publishFormula();
    else throw new Error('需要 check-tag / verify-package / publish / update-formula');
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
