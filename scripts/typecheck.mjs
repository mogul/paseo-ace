import { execSync } from "node:child_process";
import { readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pluginsDir = join(root, "plugins");

execSync(`node ${JSON.stringify(join(root, "scripts", "sync-shared.mjs"))}`, { stdio: "inherit" });

const plugins = readdirSync(pluginsDir).filter((name) =>
  statSync(join(pluginsDir, name)).isDirectory(),
);

let failed = false;
for (const name of plugins) {
  const dir = join(pluginsDir, name);
  if (!existsSync(join(dir, "package.json"))) continue;
  console.log(`\n=== typecheck ${name} ===`);
  try {
    execSync("npm run typecheck", { cwd: dir, stdio: "inherit" });
  } catch {
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("\nAll plugins typecheck cleanly.");
