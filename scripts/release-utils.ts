import { createHash } from 'node:crypto';

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
