const { execFileSync } = require("child_process");

// electron-builder skips signing when no Developer ID certificate is
// installed, leaving the bundle with Electron's original ad-hoc signature
// (which expects a resource seal that no longer matches after icon/resource
// changes). That broken seal fails codesign --verify, which on Apple
// Silicon means the app refuses to launch. Re-sign ad-hoc ourselves so a
// locally built, unsigned app still runs.
module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
  execFileSync("codesign", ["--deep", "--force", "--sign", "-", appPath]);
};
