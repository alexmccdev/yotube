import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const projectRoot = process.cwd();
const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");

const build = spawn(process.execPath, [nextCli, "build"], {
  cwd: projectRoot,
  env: { ...process.env, YOTUBE_DESKTOP_BUILD: "1" },
  stdio: "inherit",
});

const exitCode = await new Promise((resolve, reject) => {
  build.once("error", reject);
  build.once("close", (code) => resolve(code ?? 1));
});
if (exitCode !== 0) process.exit(exitCode);

const standalone = path.join(projectRoot, ".next", "standalone");
await mkdir(path.join(standalone, ".next"), { recursive: true });
await cp(path.join(projectRoot, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
await cp(path.join(projectRoot, "public"), path.join(standalone, "public"), { recursive: true });
