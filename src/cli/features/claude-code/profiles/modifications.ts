/**
 * Profile modification detection and saving
 * Tracks changes made to installed files and saves them back to profiles
 */

import * as fs from "fs/promises";
import * as path from "path";

import {
  getClaudeSkillsDir,
  getClaudeProfilesDir,
} from "@/cli/features/claude-code/paths.js";
import {
  loadManifest,
  computeFileHash,
  getEntriesForProfile,
} from "@/cli/features/manifest/manifest.js";
import { info, success, warn } from "@/cli/logger.js";

import type { Manifest } from "@/cli/features/manifest/types.js";

/**
 * Type of modification detected
 */
export type ModificationType = "added" | "modified" | "deleted";

/**
 * A detected modification to a profile's files
 */
export type ProfileModification = {
  type: ModificationType;
  path: string;
  absolutePath: string;
};

/**
 * Check if a path exists
 * @param filePath - Path to check
 *
 * @returns True if exists
 */
const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Detect modifications to files belonging to a specific profile
 *
 * Compares current file hashes against manifest to find:
 * - Modified files (hash changed)
 * - Deleted files (in manifest but missing)
 * - Added files (in skills/commands dir but not in manifest)
 *
 * @param args - Detection arguments
 * @param args.installDir - Installation directory
 * @param args.profileName - Name of the profile to check
 *
 * @returns Array of detected modifications
 */
export const detectProfileModifications = async (args: {
  installDir: string;
  profileName: string;
}): Promise<Array<ProfileModification>> => {
  const { installDir, profileName } = args;

  const manifest = await loadManifest({ installDir });
  if (manifest == null) {
    return [];
  }

  const modifications: Array<ProfileModification> = [];

  // Get all entries for this profile
  const profileEntries = getEntriesForProfile({ manifest, profileName });

  // Check each tracked file
  for (const entry of profileEntries) {
    const absolutePath = path.join(installDir, entry.path);

    if (!(await pathExists(absolutePath))) {
      // File deleted
      modifications.push({
        type: "deleted",
        path: entry.path,
        absolutePath,
      });
    } else {
      // Check if modified
      const currentHash = await computeFileHash({ filePath: absolutePath });
      if (currentHash !== entry.hash) {
        modifications.push({
          type: "modified",
          path: entry.path,
          absolutePath,
        });
      }
    }
  }

  // Check for added files in skills directory
  const skillsDir = getClaudeSkillsDir({ installDir });
  const addedInSkills = await findAddedFiles({
    dir: skillsDir,
    manifest,
    prefix: ".claude/skills",
  });
  modifications.push(...addedInSkills);

  return modifications;
};

/**
 * Find files in a directory that are not tracked in the manifest
 *
 * @param args - Find arguments
 * @param args.dir - Directory to scan
 * @param args.manifest - Current manifest
 * @param args.prefix - Path prefix for relative paths
 *
 * @returns Array of added file modifications
 */
const findAddedFiles = async (args: {
  dir: string;
  manifest: Manifest;
  prefix: string;
}): Promise<Array<ProfileModification>> => {
  const { dir, manifest, prefix } = args;
  const added: Array<ProfileModification> = [];

  if (!(await pathExists(dir))) {
    return added;
  }

  const scanDir = async (
    currentDir: string,
    currentPrefix: string,
  ): Promise<void> => {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = `${currentPrefix}/${entry.name}`;

      if (entry.isDirectory()) {
        await scanDir(absolutePath, relativePath);
      } else if (manifest.files[relativePath] == null) {
        // File not tracked in manifest - it was added by user
        added.push({
          type: "added",
          path: relativePath,
          absolutePath,
        });
      }
    }
  };

  await scanDir(dir, prefix);
  return added;
};

/**
 * Save profile modifications back to the profile directory
 *
 * This copies modified/added files to the profile's directory so they
 * persist when switching profiles.
 *
 * @param args - Save arguments
 * @param args.installDir - Installation directory
 * @param args.profileName - Name of the profile to save to
 * @param args.modifications - List of modifications to save
 *
 * @returns Number of files saved
 */
export const saveModificationsToProfile = async (args: {
  installDir: string;
  profileName: string;
  modifications: Array<ProfileModification>;
}): Promise<number> => {
  const { installDir, profileName, modifications } = args;

  const profilesDir = getClaudeProfilesDir({ installDir });
  const profileDir = path.join(profilesDir, profileName);

  // Check if profile exists
  if (!(await pathExists(profileDir))) {
    warn({
      message: `Profile "${profileName}" not found, cannot save modifications.`,
    });
    return 0;
  }

  let savedCount = 0;

  for (const mod of modifications) {
    if (mod.type === "deleted") {
      // For deleted files, we could remove from profile too
      // But for now, we'll skip - user explicitly deleted
      continue;
    }

    // Determine destination path in profile
    let destPath: string | null = null;

    if (mod.path.startsWith(".claude/skills/")) {
      // Skills go to profile/skills/
      const skillPath = mod.path.replace(".claude/skills/", "");
      destPath = path.join(profileDir, "skills", skillPath);
    } else if (mod.path === ".claude/CLAUDE.md") {
      // CLAUDE.md goes to profile root
      destPath = path.join(profileDir, "CLAUDE.md");
    }

    if (destPath == null) {
      continue;
    }

    try {
      // Create parent directory
      await fs.mkdir(path.dirname(destPath), { recursive: true });

      // Copy the file
      await fs.copyFile(mod.absolutePath, destPath);
      savedCount++;
    } catch (err) {
      warn({ message: `Failed to save ${mod.path}: ${err}` });
    }
  }

  return savedCount;
};

/**
 * Check for modifications and prompt user to save them
 *
 * @param args - Check arguments
 * @param args.installDir - Installation directory
 * @param args.profileName - Current profile name
 *
 * @returns True if there were modifications (saved or not)
 */
export const checkAndSaveModifications = async (args: {
  installDir: string;
  profileName: string;
}): Promise<boolean> => {
  const { installDir, profileName } = args;

  const modifications = await detectProfileModifications({
    installDir,
    profileName,
  });

  if (modifications.length === 0) {
    return false;
  }

  info({
    message: `Found ${modifications.length} modification(s) to current profile:`,
  });

  for (const mod of modifications) {
    const icon =
      mod.type === "added" ? "+" : mod.type === "modified" ? "~" : "-";
    info({ message: `  ${icon} ${mod.path}` });
  }

  // Save modifications
  const savedCount = await saveModificationsToProfile({
    installDir,
    profileName,
    modifications,
  });

  if (savedCount > 0) {
    success({
      message: `✓ Saved ${savedCount} modification(s) to profile "${profileName}"`,
    });
  }

  return true;
};
