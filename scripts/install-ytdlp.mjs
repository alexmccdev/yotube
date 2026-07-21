import { chmod, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

if (!process.env.VERCEL && !process.env.INSTALL_YT_DLP) process.exit(0);

const version = "2026.06.09";
const expectedSha256 = "bf8aac79b72287a6d2043074415132558b43743a8f9461a22b0141e90f16ce66";
const target = path.join(process.cwd(), "vendor", "yt-dlp");
const temporary = `${target}.download`;
const response = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/download/${version}/yt-dlp_linux`);
if (!response.ok) throw new Error(`Could not download pinned yt-dlp ${version} (${response.status})`);
const bytes = Buffer.from(await response.arrayBuffer());
const actualSha256 = createHash("sha256").update(bytes).digest("hex");
if (actualSha256 !== expectedSha256) throw new Error("Pinned yt-dlp checksum did not match");
await mkdir(path.dirname(target), { recursive: true });
await writeFile(temporary, bytes);
await chmod(temporary, 0o755);
await rename(temporary, target).catch(async (error) => {
  await unlink(temporary).catch(() => undefined);
  throw error;
});
console.log(`Installed yt-dlp ${version} for the server runtime`);
