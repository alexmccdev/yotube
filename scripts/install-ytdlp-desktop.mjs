import { createHash } from "node:crypto";
import { access, chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const version = "2026.06.09";
const assets = {
  darwin: "yt-dlp_macos",
  win32: "yt-dlp.exe",
  linux: process.arch === "arm64" ? "yt-dlp_linux_aarch64" : "yt-dlp_linux",
};
const asset = assets[process.platform];
if (!asset) throw new Error(`Desktop yt-dlp is not configured for ${process.platform}`);

const directory = path.join(process.cwd(), "vendor", "desktop");
const filename = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
const target = path.join(directory, filename);
const marker = path.join(directory, ".version");

try {
  if ((await readFile(marker, "utf8")).trim() === `${version}:${asset}`) {
    await access(target);
    process.exit(0);
  }
} catch {}

const baseUrl = `https://github.com/yt-dlp/yt-dlp/releases/download/${version}`;
const [checksumsResponse, binaryResponse] = await Promise.all([
  fetch(`${baseUrl}/SHA2-256SUMS`),
  fetch(`${baseUrl}/${asset}`),
]);
if (!checksumsResponse.ok || !binaryResponse.ok) {
  throw new Error(`Could not download pinned desktop yt-dlp ${version}`);
}
const checksums = await checksumsResponse.text();
const expected = checksums
  .split("\n")
  .find((line) => line.trim().endsWith(` ${asset}`))
  ?.trim()
  .split(/\s+/)[0];
if (!expected) throw new Error(`The yt-dlp checksum for ${asset} was not published`);

const bytes = Buffer.from(await binaryResponse.arrayBuffer());
const actual = createHash("sha256").update(bytes).digest("hex");
if (actual !== expected) throw new Error("The desktop yt-dlp checksum did not match");

await mkdir(directory, { recursive: true });
const temporary = `${target}.download`;
await writeFile(temporary, bytes, { mode: 0o755 });
if (process.platform !== "win32") await chmod(temporary, 0o755);
await rename(temporary, target).catch(async (error) => {
  await unlink(temporary).catch(() => undefined);
  throw error;
});
await writeFile(marker, `${version}:${asset}\n`);
console.log(`Installed yt-dlp ${version} for ${process.platform}/${process.arch}`);
