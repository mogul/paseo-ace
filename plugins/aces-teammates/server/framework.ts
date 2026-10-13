import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PERSONAS } from "../shared/personas";
import {
  AGENTS_SEED,
  BOARD_SEED,
  BOOT_SEED,
  HEARTBEAT_SEED,
  SOUL_SEED,
  USER_SEED,
  baseDir,
  identitySeed,
} from "./teammates";

function run(cmd: string, dir: string): string {
  return execSync(cmd, { cwd: dir, encoding: "utf8" });
}

function writeFile(dir: string, filename: string, content: string): void {
  writeFileSync(join(dir, filename), content, "utf8");
}

function branchExists(dir: string, branch: string): boolean {
  try {
    return run(`git branch --list ${branch}`, dir).trim().length > 0;
  } catch {
    return false;
  }
}

export function ensureFrameworkRepo(): void {
  let dir: string;
  try {
    dir = join(baseDir(), "framework");
    if (existsSync(join(dir, ".git"))) return;

    mkdirSync(dir, { recursive: true });
    run("git init", dir);
    run("git config user.name aces", dir);
    run("git config user.email aces@localhost", dir);

    writeFile(dir, "AGENTS.md", AGENTS_SEED);
    writeFile(dir, "BOOT.md", BOOT_SEED);
    writeFile(dir, "BOARD.md", BOARD_SEED);
    writeFile(dir, "HEARTBEAT.md", HEARTBEAT_SEED);
    writeFile(dir, "SOUL.md", SOUL_SEED);
    writeFile(dir, "USER.md", USER_SEED);
    writeFile(dir, "IDENTITY.md", identitySeed("(name)"));

    run("git add -A", dir);
    run('git commit -m "framework: initial template"', dir);

    const baseBranch = run("git branch --show-current", dir).trim() || "main";

    for (const persona of PERSONAS) {
      const branch = `template/${persona.id}`;
      if (branchExists(dir, branch)) continue;
      run(`git checkout -b ${branch}`, dir);
      writeFile(dir, "SOUL.md", persona.soul);
      writeFile(dir, "USER.md", persona.user);
      writeFile(dir, "IDENTITY.md", persona.identity || identitySeed("(name)"));
      run("git add -A", dir);
      run(`git commit -m "template/${persona.id}: persona ${persona.name}"`, dir);
      run(`git checkout ${baseBranch}`, dir);
    }
  } catch (error) {
    console.warn(`aces-teammates: failed to initialize framework repo: ${error instanceof Error ? error.message : String(error)}`);
  }
}
