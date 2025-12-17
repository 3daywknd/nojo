/**
 * Installation state detection and utilities
 * Determines the current state of the nojo installation
 */

import { existsSync, readdirSync } from "fs";
import * as path from "path";

import { getConfigPath } from "@/cli/config.js";
import { loadManifest } from "@/cli/features/manifest/manifest.js";

import type { Manifest } from "@/cli/features/manifest/types.js";

/**
 * Possible installation states
 */
export type InstallationState =
  | { type: "fresh" } // No .claude directory
  | { type: "nojo-existing"; manifest: Manifest } // Has nojo manifest
  | { type: "claude-existing"; files: Array<string> }; // Has .claude but no manifest

/**
 * Check if there's an existing installation
 * An installation exists if:
 * - Config file exists at <installDir>/.nojo-config.json
 *
 * @param args - Configuration arguments
 * @param args.installDir - Installation directory
 *
 * @returns true if an installation exists, false otherwise
 */
export const hasExistingInstallation = (args: {
  installDir: string;
}): boolean => {
  const { installDir } = args;
  return existsSync(getConfigPath({ installDir }));
};

/**
 * Detect the current installation state
 *
 * @param args - Detection arguments
 * @param args.installDir - Installation directory
 *
 * @returns The detected installation state
 */
export const detectInstallationState = async (args: {
  installDir: string;
}): Promise<InstallationState> => {
  const { installDir } = args;
  const claudeDir = path.join(installDir, ".claude");

  // Check if .claude directory exists
  if (!existsSync(claudeDir)) {
    return { type: "fresh" };
  }

  // Check if nojo manifest exists
  const manifest = await loadManifest({ installDir });
  if (manifest != null) {
    return { type: "nojo-existing", manifest };
  }

  // .claude directory exists but no manifest - existing Claude Code setup
  const files = listClaudeFiles({ claudeDir });
  return { type: "claude-existing", files };
};

/**
 * List all files in the .claude directory (excluding hidden files)
 *
 * @param args - List arguments
 * @param args.claudeDir - Path to .claude directory
 *
 * @returns Array of relative file paths
 */
const listClaudeFiles = (args: { claudeDir: string }): Array<string> => {
  const { claudeDir } = args;
  const files: Array<string> = [];

  const walk = (dir: string, prefix = ""): void => {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        // Skip hidden files starting with .
        if (entry.name.startsWith(".")) {
          continue;
        }

        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          files.push(relativePath + "/");
          walk(path.join(dir, entry.name), relativePath);
        } else {
          files.push(relativePath);
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
  };

  walk(claudeDir);
  return files.sort();
};

/**
 * Check if there are existing files that would be affected by installation
 *
 * @param args - Check arguments
 * @param args.installDir - Installation directory
 *
 * @returns True if there are existing files that could be affected
 */
export const hasExistingConfiguration = async (args: {
  installDir: string;
}): Promise<boolean> => {
  const { installDir } = args;
  const state = await detectInstallationState({ installDir });

  switch (state.type) {
    case "fresh":
      return false;
    case "nojo-existing":
      // Has manifest - nojo already installed
      return true;
    case "claude-existing":
      // Has files but no manifest - existing Claude Code setup
      return state.files.length > 0;
  }
};

/**
 * Get a summary of what exists in the .claude directory
 *
 * @param args - Summary arguments
 * @param args.installDir - Installation directory
 *
 * @returns Human-readable summary of existing configuration
 */
export const getExistingSummary = async (args: {
  installDir: string;
}): Promise<string | null> => {
  const { installDir } = args;
  const state = await detectInstallationState({ installDir });

  switch (state.type) {
    case "fresh":
      return null;
    case "nojo-existing": {
      const fileCount = Object.keys(state.manifest.files).length;
      return `nojo is already installed (tracking ${fileCount} files)`;
    }
    case "claude-existing": {
      const hasSkills = state.files.some((f) => f.startsWith("skills/"));
      const hasCommands = state.files.some((f) => f.startsWith("commands/"));
      const hasAgents = state.files.some((f) => f.startsWith("agents/"));
      const hasClaudeMd = state.files.includes("CLAUDE.md");
      const hasSettings = state.files.includes("settings.json");

      const parts: Array<string> = [];
      if (hasSkills) parts.push("skills");
      if (hasCommands) parts.push("commands");
      if (hasAgents) parts.push("agents");
      if (hasClaudeMd) parts.push("CLAUDE.md");
      if (hasSettings) parts.push("settings");

      if (parts.length === 0) {
        return `Existing .claude directory with ${state.files.length} file(s)`;
      }
      return `Existing Claude Code configuration: ${parts.join(", ")}`;
    }
  }
};
