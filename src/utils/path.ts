/**
 * Path utility functions for configurable installation directories
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Normalize an installation directory path
 * @param args - Configuration arguments
 * @param args.installDir - The installation directory (optional)
 *
 * @returns Absolute path to the base installation directory
 */
export const normalizeInstallDir = (args: {
  installDir?: string | null;
}): string => {
  const { installDir } = args;

  // Use current working directory if no installDir provided or empty
  if (installDir == null || installDir === "") {
    return process.cwd();
  }

  let normalizedPath = installDir;

  // Expand tilde to home directory
  if (normalizedPath.startsWith("~/")) {
    normalizedPath = path.join(os.homedir(), normalizedPath.slice(2));
  } else if (normalizedPath === "~") {
    normalizedPath = os.homedir();
  }

  // Resolve relative paths to absolute
  if (!path.isAbsolute(normalizedPath)) {
    normalizedPath = path.join(process.cwd(), normalizedPath);
  }

  // Normalize the path (resolves . and .., normalizes multiple slashes)
  normalizedPath = path.normalize(normalizedPath);

  // Remove trailing slash if present (except for root)
  if (normalizedPath.length > 1 && normalizedPath.endsWith("/")) {
    normalizedPath = normalizedPath.slice(0, -1);
  }

  // If path ends with .claude, strip it to get the base directory
  if (path.basename(normalizedPath) === ".claude") {
    return path.dirname(normalizedPath);
  }

  return normalizedPath;
};

/**
 * Get all directories that have nojo installations, starting from current directory
 * Searches current directory first, then ancestors
 * @param args - Configuration arguments
 * @param args.currentDir - The directory to start searching from (defaults to process.cwd())
 *
 * @returns Array of paths to directories with nojo installations, ordered from closest to furthest.
 *   Returns empty array if no installations found.
 */
export const getInstallDirs = (args?: {
  currentDir?: string | null;
}): Array<string> => {
  const currentDir = args?.currentDir || process.cwd();
  const results: Array<string> = [];

  // Inline hasNojoInstallation logic
  const hasCurrentInstallation = (() => {
    // Check for .claude/.nojo-config.json (current location)
    const currentConfigPath = path.join(
      currentDir,
      ".claude",
      ".nojo-config.json",
    );
    if (fs.existsSync(currentConfigPath)) {
      return true;
    }

    // Check for .nojo-config.json (legacy - pre-migration)
    const legacyNewConfigPath = path.join(currentDir, ".nojo-config.json");
    if (fs.existsSync(legacyNewConfigPath)) {
      return true;
    }

    // Check for nojo-config.json (legacy - very old)
    const legacyOldConfigPath = path.join(currentDir, "nojo-config.json");
    if (fs.existsSync(legacyOldConfigPath)) {
      return true;
    }

    // Check for .claude/CLAUDE.md with NOJO MANAGED BLOCK
    const claudeMdPath = path.join(currentDir, ".claude", "CLAUDE.md");
    if (fs.existsSync(claudeMdPath)) {
      try {
        const content = fs.readFileSync(claudeMdPath, "utf-8");
        if (content.includes("NOJO MANAGED BLOCK")) {
          return true;
        }
      } catch {
        // Ignore read errors
      }
    }

    return false;
  })();

  if (hasCurrentInstallation) {
    results.push(currentDir);
  }

  // Walk up the directory tree starting from parent
  let checkDir = path.dirname(currentDir);
  let previousDir = "";
  while (checkDir !== previousDir) {
    // Check for nojo installation in this ancestor directory
    const hasAncestorInstallation = (() => {
      // Check for .claude/.nojo-config.json (current location)
      const currentConfigPath = path.join(
        checkDir,
        ".claude",
        ".nojo-config.json",
      );
      if (fs.existsSync(currentConfigPath)) {
        return true;
      }

      // Check for .nojo-config.json (legacy - pre-migration)
      const legacyNewConfigPath = path.join(checkDir, ".nojo-config.json");
      if (fs.existsSync(legacyNewConfigPath)) {
        return true;
      }

      // Check for nojo-config.json (legacy - very old)
      const legacyOldConfigPath = path.join(checkDir, "nojo-config.json");
      if (fs.existsSync(legacyOldConfigPath)) {
        return true;
      }

      // Check for .claude/CLAUDE.md with NOJO MANAGED BLOCK
      const claudeMdPath = path.join(checkDir, ".claude", "CLAUDE.md");
      if (fs.existsSync(claudeMdPath)) {
        try {
          const content = fs.readFileSync(claudeMdPath, "utf-8");
          if (content.includes("NOJO MANAGED BLOCK")) {
            return true;
          }
        } catch {
          // Ignore read errors
        }
      }

      return false;
    })();

    if (hasAncestorInstallation) {
      results.push(checkDir);
    }

    previousDir = checkDir;
    checkDir = path.dirname(checkDir);
  }

  return results;
};
