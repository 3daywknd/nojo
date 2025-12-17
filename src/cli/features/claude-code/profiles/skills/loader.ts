/**
 * Skills feature loader
 * Installs skill configuration files to ~/.claude/skills/
 *
 * This loader is manifest-aware and non-destructive:
 * - User-modified skills are preserved during updates
 * - Pre-existing skills (before nojo install) are preserved
 * - Only nojo-managed, unmodified skills are updated
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

import { getAgentProfile, type Config } from "@/cli/config.js";
import {
  getClaudeDir,
  getClaudeSkillsDir,
  getClaudeSettingsFile,
} from "@/cli/features/claude-code/paths.js";
import { substituteTemplatePaths } from "@/cli/features/claude-code/template.js";
import {
  loadManifest,
  saveManifest,
  computeFileHash,
  addToManifest,
  getManifestEntry,
  createManifest,
} from "@/cli/features/manifest/manifest.js";
import { success, info, warn } from "@/cli/logger.js";
import { getCurrentPackageVersion } from "@/cli/version.js";

import type { ValidationResult } from "@/cli/features/agentRegistry.js";
import type { ProfileLoader } from "@/cli/features/claude-code/profiles/profileLoaderRegistry.js";
import type { Manifest } from "@/cli/features/manifest/types.js";
import type { Dirent } from "fs";

// Get directory of this loader file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Check if a file exists
 * @param filePath - Path to check
 *
 * @returns True if file exists, false otherwise
 */
const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Copy a directory recursively with manifest tracking
 *
 * @param args - Copy arguments
 * @param args.src - Source directory path
 * @param args.dest - Destination directory path
 * @param args.installDir - Installation directory for template substitution
 * @param args.manifest - Manifest to track installed files
 * @param args.profileName - Profile name for manifest tracking
 *
 * @returns Object with counts of preserved and installed files
 */
const copyDirWithManifestTracking = async (args: {
  src: string;
  dest: string;
  installDir: string;
  manifest: Manifest;
  profileName: string;
}): Promise<{ preserved: number; installed: number }> => {
  const { src, dest, installDir, manifest, profileName } = args;
  let preserved = 0;
  let installed = 0;

  await fs.mkdir(dest, { recursive: true });

  const entries = await fs.readdir(src, { withFileTypes: true });
  const version = getCurrentPackageVersion() ?? "unknown";

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    const relativePath = path.relative(installDir, destPath);

    if (entry.isDirectory()) {
      const subResult = await copyDirWithManifestTracking({
        src: srcPath,
        dest: destPath,
        installDir,
        manifest,
        profileName,
      });
      preserved += subResult.preserved;
      installed += subResult.installed;
    } else {
      // Get the content that would be written
      let newContent: string;
      if (entry.name.endsWith(".md")) {
        const content = await fs.readFile(srcPath, "utf-8");
        newContent = substituteTemplatePaths({ content, installDir });
      } else {
        newContent = await fs.readFile(srcPath, "utf-8");
      }

      // Check if file exists and whether to preserve it
      const destExists = await fileExists(destPath);
      const manifestEntry = getManifestEntry({ manifest, path: relativePath });

      if (destExists) {
        if (manifestEntry != null) {
          // File is tracked by manifest - check if user modified it
          const currentHash = await computeFileHash({ filePath: destPath });
          if (currentHash !== manifestEntry.hash) {
            // User modified a nojo-managed file - PRESERVE
            info({ message: `  Preserving user-modified: ${entry.name}` });
            preserved++;
            continue;
          }
          // Not modified - safe to update
        } else {
          // File exists but not in manifest - pre-existing or user-created
          // PRESERVE
          info({ message: `  Preserving existing: ${entry.name}` });
          preserved++;
          continue;
        }
      }

      // Safe to install/update
      if (entry.name.endsWith(".md")) {
        await fs.writeFile(destPath, newContent);
      } else {
        await fs.copyFile(srcPath, destPath);
      }

      // Track in manifest
      const newHash = await computeFileHash({ filePath: destPath });
      addToManifest({
        manifest,
        path: relativePath,
        hash: newHash,
        source: "nojo",
        profile: profileName,
        version,
      });
      installed++;
    }
  }

  return { preserved, installed };
};

/**
 * Get config directory for skills based on selected profile
 *
 * @param args - Configuration arguments
 * @param args.profileName - Name of the profile to load skills from
 * @param args.installDir - Installation directory
 *
 * @returns Path to the skills config directory for the profile
 */
const getConfigDir = (args: {
  profileName: string;
  installDir: string;
}): string => {
  const { profileName, installDir } = args;
  const claudeDir = getClaudeDir({ installDir });
  return path.join(claudeDir, "profiles", profileName, "skills");
};

/**
 * Install skills (non-destructive)
 *
 * This function preserves:
 * - User-modified skills (detected via manifest hash comparison)
 * - Pre-existing skills (files not in manifest)
 *
 * @param args - Configuration arguments
 * @param args.config - Runtime configuration
 */
const installSkills = async (args: { config: Config }): Promise<void> => {
  const { config } = args;
  info({ message: "Installing nojo skills..." });

  // Get profile name from config - error if not configured
  const maybeProfileName = getAgentProfile({
    config,
    agentName: "claude-code",
  })?.baseProfile;
  if (maybeProfileName == null) {
    throw new Error(
      "No profile configured for claude-code. Run 'nojo install' to configure a profile.",
    );
  }
  const profileName: string = maybeProfileName;
  const configDir = getConfigDir({
    profileName,
    installDir: config.installDir,
  });
  const claudeSkillsDir = getClaudeSkillsDir({ installDir: config.installDir });

  // Load or create manifest
  const existingManifest = await loadManifest({
    installDir: config.installDir,
  });
  const manifest: Manifest = existingManifest ?? createManifest();

  // Create skills directory if it doesn't exist
  await fs.mkdir(claudeSkillsDir, { recursive: true });

  // Read all entries from config directory
  let entries: Array<Dirent>;
  try {
    entries = await fs.readdir(configDir, { withFileTypes: true });
  } catch {
    info({ message: "Profile skills directory not found, skipping" });
    // Still configure permissions for the empty skills directory
    await configureSkillsPermissions({ config });
    return;
  }

  let totalPreserved = 0;
  let totalInstalled = 0;
  const version = getCurrentPackageVersion() ?? "unknown";

  for (const entry of entries) {
    const sourcePath = path.join(configDir, entry.name);

    if (!entry.isDirectory()) {
      // Handle non-directory files (like docs.md) with manifest tracking
      const destPath = path.join(claudeSkillsDir, entry.name);
      const relativePath = path.relative(config.installDir, destPath);
      const destExists = await fileExists(destPath);
      const manifestEntry = getManifestEntry({ manifest, path: relativePath });

      if (destExists) {
        if (manifestEntry != null) {
          const currentHash = await computeFileHash({ filePath: destPath });
          if (currentHash !== manifestEntry.hash) {
            info({ message: `  Preserving user-modified: ${entry.name}` });
            totalPreserved++;
            continue;
          }
        } else {
          info({ message: `  Preserving existing: ${entry.name}` });
          totalPreserved++;
          continue;
        }
      }

      // Safe to install
      if (entry.name.endsWith(".md")) {
        const content = await fs.readFile(sourcePath, "utf-8");
        const substituted = substituteTemplatePaths({
          content,
          installDir: config.installDir,
        });
        await fs.writeFile(destPath, substituted);
      } else {
        await fs.copyFile(sourcePath, destPath);
      }

      const newHash = await computeFileHash({ filePath: destPath });
      addToManifest({
        manifest,
        path: relativePath,
        hash: newHash,
        source: "nojo",
        profile: profileName,
        version,
      });
      totalInstalled++;
      continue;
    }

    // Handle paid-prefixed skills
    //
    // IMPORTANT: Paid skill scripts are BUNDLED before installation.
    // The script.js files we're copying here are standalone executables created
    // by scripts/bundle-skills.ts during the build process. They contain all
    // dependencies inlined by esbuild, making them portable and executable from
    // ~/.claude/skills/ without requiring the MCP package context.
    //
    // @see scripts/bundle-skills.ts - The bundler that creates standalone scripts
    // @see src/cli/features/claude-code/profiles/config/_mixins/_paid/skills/paid-recall/script.ts - Bundling docs
    if (entry.name.startsWith("paid-")) {
      if (false) {
        // Strip paid- prefix when copying
        const destName = entry.name.replace(/^paid-/, "");
        const destPath = path.join(claudeSkillsDir, destName);
        const result = await copyDirWithManifestTracking({
          src: sourcePath,
          dest: destPath,
          installDir: config.installDir,
          manifest,
          profileName,
        });
        totalPreserved += result.preserved;
        totalInstalled += result.installed;
      }
      // Skip if free tier
    } else {
      // Copy non-paid skills for all tiers
      const destPath = path.join(claudeSkillsDir, entry.name);
      const result = await copyDirWithManifestTracking({
        src: sourcePath,
        dest: destPath,
        installDir: config.installDir,
        manifest,
        profileName,
      });
      totalPreserved += result.preserved;
      totalInstalled += result.installed;
    }
  }

  // Save updated manifest
  await saveManifest({ installDir: config.installDir, manifest });

  if (totalPreserved > 0) {
    success({
      message: `✓ Installed skills (${totalInstalled} installed, ${totalPreserved} preserved)`,
    });
  } else {
    success({ message: `✓ Installed ${totalInstalled} skills` });
  }

  // Configure permissions for skills directory
  await configureSkillsPermissions({ config });
};

/**
 * Configure permissions for skills directory
 * Adds skills directory to permissions.additionalDirectories in settings.json
 *
 * @param args - Configuration arguments
 * @param args.config - Runtime configuration
 */
const configureSkillsPermissions = async (args: {
  config: Config;
}): Promise<void> => {
  const { config } = args;
  info({ message: "Configuring permissions for skills directory..." });

  const claudeSettingsFile = getClaudeSettingsFile({
    installDir: config.installDir,
  });
  const claudeSkillsDir = getClaudeSkillsDir({ installDir: config.installDir });

  // Create .claude directory if it doesn't exist
  await fs.mkdir(path.dirname(claudeSettingsFile), { recursive: true });

  // Read or initialize settings
  let settings: any = {};
  try {
    const content = await fs.readFile(claudeSettingsFile, "utf-8");
    settings = JSON.parse(content);
  } catch {
    settings = {
      $schema: "https://json.schemastore.org/claude-code-settings.json",
    };
  }

  // Initialize permissions object if needed
  if (!settings.permissions) {
    settings.permissions = {};
  }

  // Initialize additionalDirectories array if needed
  if (!settings.permissions.additionalDirectories) {
    settings.permissions.additionalDirectories = [];
  }

  // Add skills directory if not already present
  if (!settings.permissions.additionalDirectories.includes(claudeSkillsDir)) {
    settings.permissions.additionalDirectories.push(claudeSkillsDir);
  }

  // Write back to file
  await fs.writeFile(claudeSettingsFile, JSON.stringify(settings, null, 2));
  success({ message: `✓ Configured permissions for ${claudeSkillsDir}` });
};

/**
 * Uninstall skills
 *
 * @param args - Configuration arguments
 * @param args.config - Runtime configuration
 */
const uninstallSkills = async (args: { config: Config }): Promise<void> => {
  const { config } = args;
  info({ message: "Removing nojo skills..." });

  const claudeSkillsDir = getClaudeSkillsDir({ installDir: config.installDir });

  try {
    await fs.access(claudeSkillsDir);
    await fs.rm(claudeSkillsDir, { recursive: true, force: true });
    success({ message: "✓ Removed skills directory" });
  } catch {
    info({
      message: "Skills directory not found (may not have been installed)",
    });
  }

  // Remove permissions configuration
  await removeSkillsPermissions({ config });
};

/**
 * Remove skills directory permissions
 * Removes skills directory from permissions.additionalDirectories in settings.json
 *
 * @param args - Configuration arguments
 * @param args.config - Runtime configuration
 */
const removeSkillsPermissions = async (args: {
  config: Config;
}): Promise<void> => {
  const { config } = args;
  info({ message: "Removing skills directory permissions..." });

  const claudeSettingsFile = getClaudeSettingsFile({
    installDir: config.installDir,
  });
  const claudeSkillsDir = getClaudeSkillsDir({ installDir: config.installDir });

  try {
    const content = await fs.readFile(claudeSettingsFile, "utf-8");
    const settings = JSON.parse(content);

    if (settings.permissions?.additionalDirectories) {
      settings.permissions.additionalDirectories =
        settings.permissions.additionalDirectories.filter(
          (dir: string) => dir !== claudeSkillsDir,
        );

      // Clean up empty arrays/objects
      if (settings.permissions.additionalDirectories.length === 0) {
        delete settings.permissions.additionalDirectories;
      }
      if (Object.keys(settings.permissions).length === 0) {
        delete settings.permissions;
      }

      await fs.writeFile(claudeSettingsFile, JSON.stringify(settings, null, 2));
      success({ message: "✓ Removed skills directory permissions" });
    } else {
      info({ message: "No permissions found in settings.json" });
    }
  } catch (err) {
    warn({ message: `Could not remove permissions: ${err}` });
  }
};

/**
 * Validate skills installation
 * @param args - Configuration arguments
 * @param args.config - Runtime configuration
 *
 * @returns Validation result
 */
const validate = async (args: {
  config: Config;
}): Promise<ValidationResult> => {
  const { config } = args;
  const errors: Array<string> = [];

  const claudeSkillsDir = getClaudeSkillsDir({ installDir: config.installDir });
  const claudeSettingsFile = getClaudeSettingsFile({
    installDir: config.installDir,
  });

  // Check if skills directory exists
  try {
    await fs.access(claudeSkillsDir);
  } catch {
    errors.push(`Skills directory not found at ${claudeSkillsDir}`);
    errors.push('Run "nojo install" to install skills');
    return {
      valid: false,
      message: "Skills directory not found",
      errors,
    };
  }

  // Verify expected skills exist based on tier
  const profileName = getAgentProfile({
    config,
    agentName: "claude-code",
  })?.baseProfile;
  if (profileName == null) {
    errors.push("No profile configured for claude-code");
    errors.push("Run 'nojo install' to configure a profile");
    return {
      valid: false,
      message: "No profile configured",
      errors,
    };
  }
  const configDir = getConfigDir({
    profileName,
    installDir: config.installDir,
  });

  // Check expected skills from profile config (if directory exists)
  try {
    const sourceEntries = await fs.readdir(configDir, { withFileTypes: true });

    for (const entry of sourceEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      // For paid-prefixed skills, check if they exist without prefix (paid tier only)
      if (entry.name.startsWith("paid-")) {
        if (false) {
          const destName = entry.name.replace(/^paid-/, "");
          try {
            await fs.access(path.join(claudeSkillsDir, destName));
          } catch {
            errors.push(`Expected skill '${destName}' not found (paid tier)`);
          }
        }
      } else {
        // Non-paid skills should exist for all tiers
        try {
          await fs.access(path.join(claudeSkillsDir, entry.name));
        } catch {
          errors.push(`Expected skill '${entry.name}' not found`);
        }
      }
    }

    if (errors.length > 0) {
      errors.push('Run "nojo install" to reinstall skills');
      return {
        valid: false,
        message: "Skills directory incomplete",
        errors,
      };
    }
  } catch {
    // Profile skills directory not found - this is valid (0 skills expected)
    // Continue to check permissions
  }

  // Check if permissions are configured in settings.json
  try {
    const content = await fs.readFile(claudeSettingsFile, "utf-8");
    const settings = JSON.parse(content);

    if (
      !settings.permissions?.additionalDirectories?.includes(claudeSkillsDir)
    ) {
      errors.push(
        "Skills directory not configured in permissions.additionalDirectories",
      );
      errors.push('Run "nojo install" to configure permissions');
      return {
        valid: false,
        message: "Skills permissions not configured",
        errors,
      };
    }
  } catch {
    errors.push("Could not read or parse settings.json");
    return {
      valid: false,
      message: "Settings file error",
      errors,
    };
  }

  return {
    valid: true,
    message: "Skills are properly installed",
    errors: null,
  };
};

/**
 * Skills feature loader
 */
export const skillsLoader: ProfileLoader = {
  name: "skills",
  description: "Install skill configuration files",
  install: async (args: { config: Config }) => {
    const { config } = args;
    await installSkills({ config });
  },
  uninstall: async (args: { config: Config }) => {
    const { config } = args;
    await uninstallSkills({ config });
  },
  validate,
};
