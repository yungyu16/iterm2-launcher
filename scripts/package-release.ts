import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// 只打包明确列出的运行文件，不携带开发依赖、个人配置或 Git 历史。
const version: string = JSON.parse(readFileSync('package.json', 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('发布版本必须为 x.y.z');
const name = `iterm2-launcher-${version}`;
const output = resolve('.release');
const stage = join(output, name);
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const path of ['examples', 'package.json', 'LICENSE', 'README.md', 'CONTRIBUTING.md']) {
    cpSync(path, join(stage, path), { recursive: true });
}
mkdirSync(join(stage, 'dist'));
for (const path of ['src']) cpSync(join('dist', path), join(stage, 'dist', path), { recursive: true });
mkdirSync(join(stage, 'scripts'));
cpSync('scripts/iterm', join(stage, 'scripts/iterm'), { recursive: true });
mkdirSync(join(stage, 'node_modules'));
cpSync('node_modules/smol-toml', join(stage, 'node_modules/smol-toml'), { recursive: true });
const archive = join(output, `${name}.tar.gz`);
execFileSync('tar', ['-czf', archive, '-C', output, name], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
// 校验实际上传的归档；重新打包可能改变 gzip 元数据，必须同步更新 Formula。
const checksum = createHash('sha256').update(readFileSync(archive)).digest('hex');
writeFileSync(`${archive}.sha256`, `${checksum}  ${name}.tar.gz\n`);
console.log(archive);
console.log(`SHA256 ${checksum}`);
