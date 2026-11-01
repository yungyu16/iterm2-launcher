import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { parse } from 'smol-toml';

export type Mode = 'native' | 'herdr';

export interface LaunchConfig {
  profile: string;
  commands: string[];
}

export function configPath(env: NodeJS.ProcessEnv = process.env, home = homedir()) {
  const root = env.XDG_CONFIG_HOME || join(home, '.config');
  if (!isAbsolute(root)) throw new Error('XDG_CONFIG_HOME 必须是绝对路径');
  return join(root, 'iterm2-launcher', 'config.toml');
}

export function validateConfig(data: Record<string, unknown>, mode: Mode, profileOverride?: string): LaunchConfig {
  const profile = profileOverride ?? data.profile ?? 'Default';
  if (typeof profile !== 'string' || !profile.trim()) throw new Error('profile 必须是非空字符串');
  const section = data[mode];
  const commands = section && typeof section === 'object' ? (section as Record<string, unknown>).commands : undefined;
  if (!Array.isArray(commands) || commands.some(c => typeof c !== 'string' || !c.trim() || c.includes('\0'))) {
    throw new Error(`[${mode}].commands 必须是非空命令组成的数组`);
  }
  if (mode === 'native' ? commands.length < 1 || commands.length > 4 : commands.length !== 2) {
    throw new Error(mode === 'native' ? 'native 需要 1～4 个命令' : 'herdr 需要恰好两个命令');
  }
  return { profile, commands };
}

export function loadConfig(path: string, mode: Mode, profile?: string): LaunchConfig {
  try { return validateConfig(parse(readFileSync(path, 'utf8')), mode, profile); }
  catch (error) { throw new Error(`配置 ${path}: ${error instanceof Error ? error.message : String(error)}`); }
}
