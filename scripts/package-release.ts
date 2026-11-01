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
for (const path of ['bin', 'src']) cpSync(join('dist', path), join(stage, 'dist', path), { recursive: true });
mkdirSync(join(stage, 'scripts'));
cpSync('scripts/iterm', join(stage, 'scripts/iterm'), { recursive: true });
mkdirSync(join(stage, 'node_modules'));
cpSync('node_modules/smol-toml', join(stage, 'node_modules/smol-toml'), { recursive: true });
const archive = join(output, `${name}.tar.gz`);
execFileSync('tar', ['-czf', archive, '-C', output, name], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
const checksum = createHash('sha256').update(readFileSync(archive)).digest('hex');
writeFileSync(`${archive}.sha256`, `${checksum}  ${name}.tar.gz\n`);
// Formula 手工维护安装逻辑，发布脚本只更新版本 URL 与校验和。
const formulaPath = 'Formula/iterm2-launcher.rb';
const formula = readFileSync(formulaPath, 'utf8')
  .replace(/  url ".*"/, '  url "https://github.com/yungyu16/iterm2-launcher/releases/download/v' + version + '/' + name + '.tar.gz"')
  .replace(/  sha256 ".*"/, '  sha256 "' + checksum + '"');
writeFileSync(formulaPath, formula);
console.log(archive);
console.log(`SHA256 ${checksum}`);
