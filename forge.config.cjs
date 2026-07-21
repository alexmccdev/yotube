const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { flipFuses, FuseV1Options, FuseVersion } = require("@electron/fuses");

const binaryName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
const notarize = process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID
  ? {
    tool: "notarytool",
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  }
  : undefined;

module.exports = {
  packagerConfig: {
    asar: true,
    name: "Yotube",
    executableName: "yotube",
    appBundleId: "tech.yotube.desktop",
    appCategoryType: "public.app-category.music",
    ignore: [
      /^\/(?:\.agents|\.claude|\.codex|\.git|\.next|app|build|cards|dist|lib|out|public|scripts|vendor|work)(?:\/|$)/,
      /^\/\.env(?:\.|$)/,
      /^\/(?:\.gitignore|AGENTS\.md|CLAUDE\.md|CONTEXT\.md|README\.md|eslint\.config\.mjs|forge\.config\.cjs|next-env\.d\.ts|next\.config\.ts|postcss\.config\.mjs|tsconfig\.json|tsconfig\.tsbuildinfo|vitest\.config\.ts)$/,
      /^\/node_modules(?:\/|$)/,
      /(?:^|\/)\.codex-worktrees(?:\/|$)/,
      /^\/desktop\/.*\.test\.[^/]+$/,
    ],
    extraResource: [
      path.join(__dirname, "vendor", "desktop", binaryName),
      path.join(__dirname, ".next", "standalone"),
    ],
    osxSign: process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false" ? { identity: "-" } : {},
    osxNotarize: notarize,
  },
  makers: [
    { name: "@electron-forge/maker-dmg", platforms: ["darwin"] },
    { name: "@electron-forge/maker-zip", platforms: ["darwin"] },
    {
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: {
        certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
        certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
      },
    },
    { name: "@electron-forge/maker-deb", platforms: ["linux"] },
  ],
  hooks: {
    packageAfterCopy: async (forgeConfig, buildPath, _electronVersion, platform, arch) => {
      const electronName = platform === "darwin" || platform === "mas" ? "Electron" : "electron";
      const executable = platform === "darwin" || platform === "mas"
        ? path.join(path.resolve(buildPath, "..", ".."), "MacOS", electronName)
        : path.join(path.resolve(buildPath, ".."), `${electronName}${platform === "win32" ? ".exe" : ""}`);
      const osxSign = forgeConfig.packagerConfig.osxSign;
      const signsMac = Boolean(osxSign && (typeof osxSign !== "object" || Object.keys(osxSign).length));
      await flipFuses(executable, {
      version: FuseVersion.V1,
      resetAdHocDarwinSignature: !signsMac && platform === "darwin" && arch === "arm64",
      strictlyRequireAllFuses: true,
      [FuseV1Options.RunAsNode]: true,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
      [FuseV1Options.WasmTrapHandlers]: false,
      });
    },
    postPackage: async (_forgeConfig, result) => {
      if (result.platform !== "darwin" || process.env.CSC_IDENTITY_AUTO_DISCOVERY !== "false") return;
      for (const outputPath of result.outputPaths) {
        const appPath = path.join(outputPath, "Yotube.app");
        execFileSync("codesign", ["--force", "--deep", "--sign", "-", "--timestamp=none", appPath]);
      }
    },
  },
};
