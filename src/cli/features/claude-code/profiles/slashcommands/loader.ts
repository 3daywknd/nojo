/**
 * Slash commands feature loader
 * Registers all nojo slash commands with Claude Code
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

import { getAgentProfile, type Config } from "@/cli/config.js";
import {
  getClaudeDir,
  getClaudeCommandsDir,
} from "@/cli/features/claude-code/paths.js";
import { substituteTemplatePaths } from "@/cli/features/claude-code/template.js";
import { success, info, warn } from "@/cli/logger.js";

import type { ValidationResult } from "@/cli/features/agentRegistry.js";
import type { ProfileLoader } from "@/cli/features/claude-code/profiles/profileLoaderRegistry.js";

// Get directory of this loader file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get config directory for slash commands based on selected profile
 *
 * @param args - Configuration arguments
 * @param args.profileName - Name of the profile to load slash commands from
 * @param args.installDir - Installation directory
 *
 * @returns Path to the slashcommands config directory for the profile
 */
const getConfigDir = (args: {
  profileName: string;
  installDir: string;
}): string => {
  const { profileName, installDir } = args;
  const claudeDir = getClaudeDir({ installDir });
  return path.join(claudeDir, "profiles", profileName, "slashcommands");
};

/**
 * Recursively copy slash commands from source to destination
 * Handles nested directories (e.g., nojo/init-docs.md -> /nojo/init-docs)
 *
 * @param args - Configuration arguments
 * @param args.srcDir - Source directory containing slash commands
 * @param args.destDir - Destination directory to copy commands to
 * @param args.installDir - Installation directory for template substitution
 * @param args.prefix - Command prefix for nested directories (e.g., "nojo")
 *
 * @returns Count of registered and skipped commands
 */
const copySlashCommandsRecursive = async (args: {
  srcDir: string;
  destDir: string;
  installDir: string;
  prefix?: string | null;
}): Promise<{ registered: number; skipped: number }> => {
  const { srcDir, destDir, installDir, prefix } = args;
  let registered = 0;
  let skipped = 0;

  let entries: Array<string>;
  try {
    entries = await fs.readdir(srcDir);
  } catch {
    return { registered, skipped };
  }

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry);
    const stat = await fs.stat(srcPath);

    if (stat.isDirectory()) {
      // Recurse into subdirectory
      const subDestDir = path.join(destDir, entry);
      await fs.mkdir(subDestDir, { recursive: true });
      const subResult = await copySlashCommandsRecursive({
        srcDir: srcPath,
        destDir: subDestDir,
        installDir,
        prefix: prefix ? `${prefix}/${entry}` : entry,
      });
      registered += subResult.registered;
      skipped += subResult.skipped;
    } else if (entry.endsWith(".md") && entry !== "docs.md") {
      // Copy markdown file with template substitution
      const destPath = path.join(destDir, entry);
      try {
        const content = await fs.readFile(srcPath, "utf-8");
        const claudeDir = getClaudeDir({ installDir });
        const substituted = substituteTemplatePaths({
          content,
          installDir: claudeDir,
        });
        await fs.writeFile(destPath, substituted);
        const commandName = entry.replace(/\.md$/, "");
        const fullName = prefix ? `${prefix}/${commandName}` : commandName;
        success({ message: `✓ /${fullName} slash command registered` });
        registered++;
      } catch {
        warn({ message: `Failed to copy ${srcPath}, skipping` });
        skipped++;
      }
    }
  }

  return { registered, skipped };
};

/**
 * Register all slash commands
 * @param args - Configuration arguments
 * @param args.config - Runtime configuration
 */
const registerSlashCommands = async (args: {
  config: Config;
}): Promise<void> => {
  const { config } = args;
  info({ message: "Registering nojo slash commands..." });

  // Get profile name from config - error if not configured
  const profileName = getAgentProfile({
    config,
    agentName: "claude-code",
  })?.baseProfile;
  if (profileName == null) {
    throw new Error(
      "No profile configured for claude-code. Run 'nojo install' to configure a profile.",
    );
  }
  const configDir = getConfigDir({
    profileName,
    installDir: config.installDir,
  });
  const claudeCommandsDir = getClaudeCommandsDir({
    installDir: config.installDir,
  });

  // Create commands directory if it doesn't exist
  await fs.mkdir(claudeCommandsDir, { recursive: true });

  const { registered, skipped } = await copySlashCommandsRecursive({
    srcDir: configDir,
    destDir: claudeCommandsDir,
    installDir: config.installDir,
    prefix: null,
  });

  if (registered > 0) {
    success({
      message: `Successfully registered ${registered} slash command${
        registered === 1 ? "" : "s"
      }`,
    });
  }
  if (skipped > 0) {
    warn({
      message: `Skipped ${skipped} slash command${
        skipped === 1 ? "" : "s"
      } (not found)`,
    });
  }
};

/**
 * Recursively remove slash commands matching source structure
 *
 * @param args - Configuration arguments
 * @param args.srcDir - Source directory to mirror structure from
 * @param args.destDir - Destination directory to remove commands from
 * @param args.prefix - Command prefix for nested directories (e.g., "nojo")
 *
 * @returns Count of removed commands
 */
const removeSlashCommandsRecursive = async (args: {
  srcDir: string;
  destDir: string;
  prefix?: string | null;
}): Promise<number> => {
  const { srcDir, destDir, prefix } = args;
  let removed = 0;

  let entries: Array<string>;
  try {
    entries = await fs.readdir(srcDir);
  } catch {
    return removed;
  }

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry);
    const destPath = path.join(destDir, entry);
    const stat = await fs.stat(srcPath);

    if (stat.isDirectory()) {
      // Recurse into subdirectory
      const subRemoved = await removeSlashCommandsRecursive({
        srcDir: srcPath,
        destDir: destPath,
        prefix: prefix ? `${prefix}/${entry}` : entry,
      });
      removed += subRemoved;

      // Try to remove empty subdirectory
      try {
        const files = await fs.readdir(destPath);
        if (files.length === 0) {
          await fs.rmdir(destPath);
          success({ message: `✓ Removed empty directory: ${destPath}` });
        }
      } catch {
        // Directory doesn't exist or couldn't be removed
      }
    } else if (entry.endsWith(".md") && entry !== "docs.md") {
      try {
        await fs.access(destPath);
        await fs.unlink(destPath);
        const commandName = entry.replace(/\.md$/, "");
        const fullName = prefix ? `${prefix}/${commandName}` : commandName;
        success({ message: `✓ /${fullName} slash command removed` });
        removed++;
      } catch {
        // File not found, which is fine
      }
    }
  }

  return removed;
};

/**
 * Unregister all slash commands
 * @param args - Configuration arguments
 * @param args.config - Runtime configuration
 */
const unregisterSlashCommands = async (args: {
  config: Config;
}): Promise<void> => {
  const { config } = args;
  info({ message: "Removing nojo slash commands..." });

  // Get profile name from config - skip gracefully if not configured
  // (uninstall should be permissive and clean up whatever is possible)
  const profileName = getAgentProfile({
    config,
    agentName: "claude-code",
  })?.baseProfile;
  if (profileName == null) {
    info({
      message:
        "No profile configured for claude-code, skipping slash commands cleanup",
    });
    return;
  }
  const configDir = getConfigDir({
    profileName,
    installDir: config.installDir,
  });
  const claudeCommandsDir = getClaudeCommandsDir({
    installDir: config.installDir,
  });

  const removedCount = await removeSlashCommandsRecursive({
    srcDir: configDir,
    destDir: claudeCommandsDir,
    prefix: null,
  });

  if (removedCount > 0) {
    success({
      message: `Successfully removed ${removedCount} slash command${
        removedCount === 1 ? "" : "s"
      }`,
    });
  }

  // Remove parent directory if empty
  try {
    const files = await fs.readdir(claudeCommandsDir);
    if (files.length === 0) {
      await fs.rmdir(claudeCommandsDir);
      success({ message: `✓ Removed empty directory: ${claudeCommandsDir}` });
    }
  } catch {
    // Directory doesn't exist or couldn't be removed, which is fine
  }
};

/**
 * Recursively validate slash commands exist
 *
 * @param args - Configuration arguments
 * @param args.srcDir - Source directory to check structure from
 * @param args.destDir - Destination directory to validate commands in
 * @param args.prefix - Command prefix for nested directories (e.g., "nojo")
 *
 * @returns Expected count and list of missing commands
 */
const validateSlashCommandsRecursive = async (args: {
  srcDir: string;
  destDir: string;
  prefix?: string | null;
}): Promise<{ expected: number; missing: Array<string> }> => {
  const { srcDir, destDir, prefix } = args;
  let expected = 0;
  const missing: Array<string> = [];

  let entries: Array<string>;
  try {
    entries = await fs.readdir(srcDir);
  } catch {
    return { expected, missing };
  }

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry);
    const destPath = path.join(destDir, entry);
    const stat = await fs.stat(srcPath);

    if (stat.isDirectory()) {
      const subResult = await validateSlashCommandsRecursive({
        srcDir: srcPath,
        destDir: destPath,
        prefix: prefix ? `${prefix}/${entry}` : entry,
      });
      expected += subResult.expected;
      missing.push(...subResult.missing);
    } else if (entry.endsWith(".md") && entry !== "docs.md") {
      expected++;
      try {
        await fs.access(destPath);
      } catch {
        const commandName = entry.replace(/\.md$/, "");
        const fullName = prefix ? `${prefix}/${commandName}` : commandName;
        missing.push(fullName);
      }
    }
  }

  return { expected, missing };
};

/**
 * Validate slash commands installation
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

  const claudeCommandsDir = getClaudeCommandsDir({
    installDir: config.installDir,
  });

  // Check if commands directory exists
  try {
    await fs.access(claudeCommandsDir);
  } catch {
    errors.push(`Commands directory not found at ${claudeCommandsDir}`);
    errors.push('Run "nojo install" to create the commands directory');
    return {
      valid: false,
      message: "Commands directory not found",
      errors,
    };
  }

  // Get profile name from config - error if not configured
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

  const { expected, missing } = await validateSlashCommandsRecursive({
    srcDir: configDir,
    destDir: claudeCommandsDir,
    prefix: null,
  });

  if (expected === 0) {
    return {
      valid: true,
      message: "No slash commands configured for this profile",
      errors: null,
    };
  }

  if (missing.length > 0) {
    errors.push(
      `Missing ${missing.length} slash command(s): ${missing.join(", ")}`,
    );
    errors.push('Run "nojo install" to register missing commands');
    return {
      valid: false,
      message: "Some slash commands are not installed",
      errors,
    };
  }

  return {
    valid: true,
    message: `All ${expected} slash commands are properly installed`,
    errors: null,
  };
};

/**
 * Slash commands feature loader
 */
export const slashCommandsLoader: ProfileLoader = {
  name: "slashcommands",
  description: "Register all Nori slash commands with Claude Code",
  install: async (args: { config: Config }) => {
    const { config } = args;
    await registerSlashCommands({ config });
  },
  uninstall: async (args: { config: Config }) => {
    const { config } = args;
    await unregisterSlashCommands({ config });
  },
  validate,
};
