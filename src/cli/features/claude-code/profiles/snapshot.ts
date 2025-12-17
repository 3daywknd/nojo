/**
 * Profile snapshot utilities
 * Creates custom profiles from existing Claude Code configurations
 */

import * as fs from "fs/promises";
import * as path from "path";

import {
  getClaudeSkillsDir,
  getClaudeProfilesDir,
  getClaudeMdFile,
  getClaudeCommandsDir,
  getClaudeAgentsDir,
} from "@/cli/features/claude-code/paths.js";
import { info, success, warn } from "@/cli/logger.js";

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
 * Copy a directory recursively if it exists
 *
 * @param args - Copy arguments
 * @param args.src - Source path
 * @param args.dest - Destination path
 *
 * @returns Number of files copied
 */
const copyDirIfExists = async (args: {
  src: string;
  dest: string;
}): Promise<number> => {
  const { src, dest } = args;

  if (!(await pathExists(src))) {
    return 0;
  }

  let count = 0;

  const copyRecursive = async (
    srcDir: string,
    destDir: string,
  ): Promise<void> => {
    await fs.mkdir(destDir, { recursive: true });

    const entries = await fs.readdir(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);

      if (entry.isDirectory()) {
        await copyRecursive(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
        count++;
      }
    }
  };

  await copyRecursive(src, dest);
  return count;
};

/**
 * Create a custom profile from the existing Claude Code configuration
 *
 * This function snapshots the current .claude/ configuration into a new
 * profile that can be switched to later.
 *
 * @param args - Snapshot arguments
 * @param args.installDir - Installation directory
 * @param args.profileName - Name for the new profile
 *
 * @returns True if profile was created successfully
 */
export const createProfileFromExisting = async (args: {
  installDir: string;
  profileName: string;
}): Promise<boolean> => {
  const { installDir, profileName } = args;

  const profilesDir = getClaudeProfilesDir({ installDir });
  const newProfileDir = path.join(profilesDir, profileName);

  // Check if profile already exists
  if (await pathExists(newProfileDir)) {
    warn({ message: `Profile "${profileName}" already exists.` });
    return false;
  }

  info({ message: `Creating profile "${profileName}" from existing setup...` });

  // Create profile directory
  await fs.mkdir(newProfileDir, { recursive: true });

  let totalFiles = 0;

  // 1. Copy existing skills
  const existingSkillsDir = getClaudeSkillsDir({ installDir });
  const profileSkillsDir = path.join(newProfileDir, "skills");
  const skillsCount = await copyDirIfExists({
    src: existingSkillsDir,
    dest: profileSkillsDir,
  });
  if (skillsCount > 0) {
    info({ message: `  ✓ Copied ${skillsCount} skill files` });
    totalFiles += skillsCount;
  }

  // 2. Copy existing CLAUDE.md
  const existingClaudeMd = getClaudeMdFile({ installDir });
  if (await pathExists(existingClaudeMd)) {
    const profileClaudeMd = path.join(newProfileDir, "CLAUDE.md");
    await fs.copyFile(existingClaudeMd, profileClaudeMd);
    info({ message: "  ✓ Copied CLAUDE.md" });
    totalFiles++;
  }

  // 3. Copy existing commands
  const existingCommandsDir = getClaudeCommandsDir({ installDir });
  const profileCommandsDir = path.join(newProfileDir, "slashcommands");
  const commandsCount = await copyDirIfExists({
    src: existingCommandsDir,
    dest: profileCommandsDir,
  });
  if (commandsCount > 0) {
    info({ message: `  ✓ Copied ${commandsCount} command files` });
    totalFiles += commandsCount;
  }

  // 4. Copy existing agents/subagents
  const existingAgentsDir = getClaudeAgentsDir({ installDir });
  const profileAgentsDir = path.join(newProfileDir, "subagents");
  const agentsCount = await copyDirIfExists({
    src: existingAgentsDir,
    dest: profileAgentsDir,
  });
  if (agentsCount > 0) {
    info({ message: `  ✓ Copied ${agentsCount} subagent files` });
    totalFiles += agentsCount;
  }

  // 5. Create profile.json
  const profileJson = {
    builtin: false,
    description: `Custom profile created from existing setup`,
    mixins: {},
  };
  const profileJsonPath = path.join(newProfileDir, "profile.json");
  await fs.writeFile(profileJsonPath, JSON.stringify(profileJson, null, 2));

  if (totalFiles === 0) {
    warn({ message: "No existing configuration found to snapshot." });
    // Clean up empty profile directory
    await fs.rm(newProfileDir, { recursive: true, force: true });
    return false;
  }

  success({
    message: `✓ Profile "${profileName}" created with ${totalFiles} files`,
  });
  info({ message: `  Location: ${newProfileDir}` });

  return true;
};

/**
 * List all custom (non-builtin) profiles
 *
 * @param args - List arguments
 * @param args.installDir - Installation directory
 *
 * @returns Array of custom profile names
 */
export const listCustomProfiles = async (args: {
  installDir: string;
}): Promise<Array<string>> => {
  const { installDir } = args;
  const profilesDir = getClaudeProfilesDir({ installDir });

  if (!(await pathExists(profilesDir))) {
    return [];
  }

  const customProfiles: Array<string> = [];
  const entries = await fs.readdir(profilesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const profileJsonPath = path.join(profilesDir, entry.name, "profile.json");
    try {
      const content = await fs.readFile(profileJsonPath, "utf-8");
      const profileData = JSON.parse(content);

      if (profileData.builtin === false) {
        customProfiles.push(entry.name);
      }
    } catch {
      // No profile.json or invalid - skip
    }
  }

  return customProfiles;
};
