const path = require("path");

/**
 * Resolve the directories the app should use for job state and finalized
 * cards. Defaults to subfolders of the OS-standard per-user app data
 * directory; respects WORK_DIR/CARDS_DIR env overrides if already set.
 * @param {string} userDataPath
 * @param {Record<string, string | undefined>} env
 */
function resolveDataDirs(userDataPath, env = process.env) {
  return {
    workDir: env.WORK_DIR ?? path.join(userDataPath, "work"),
    cardsDir: env.CARDS_DIR ?? path.join(userDataPath, "cards"),
  };
}

module.exports = { resolveDataDirs };
