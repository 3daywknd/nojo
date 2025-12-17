/**
 * Manifest loader
 * Manages the .nojo-manifest.json file lifecycle
 *
 * The manifest tracks all files installed by nojo, their content hashes,
 * and source information. This enables non-destructive installs by detecting
 * user modifications and preserving them during upgrades.
 */

import { existsSync, unlinkSync } from "fs";

import { success, info } from "@/cli/logger.js";

import type { Manifest } from "./types.js";
import type { Config } from "@/cli/config.js";
import type { Loader } from "@/cli/features/agentRegistry.js";

import {
  createManifest,
  createPreInstallSnapshot,
  getManifestPath,
  loadManifest,
  saveManifest,
} from "./manifest.js";

/**
 * Get or create the manifest
 * @param args - Arguments
 * @param args.installDir - Installation directory
 *
 * @returns The manifest (loaded or newly created)
 */
export const getOrCreateManifest = async (args: {
  installDir: string;
}): Promise<{ manifest: Manifest; isNew: boolean }> => {
  const { installDir } = args;

  const existing = await loadManifest({ installDir });
  if (existing != null) {
    return { manifest: existing, isNew: false };
  }

  return { manifest: createManifest(), isNew: true };
};

/**
 * Install manifest - create manifest if it doesn't exist
 * @param args - Configuration arguments
 * @param args.config - Runtime configuration
 */
const installManifest = async (args: { config: Config }): Promise<void> => {
  const { config } = args;
  const { installDir } = config;

  const { manifest, isNew } = await getOrCreateManifest({ installDir });

  if (isNew) {
    // Check if there's an existing .claude directory to snapshot
    const claudeDir = `${installDir}/.claude`;
    if (existsSync(claudeDir)) {
      info({
        message: "Existing .claude directory detected, creating snapshot...",
      });
      manifest.preInstallSnapshot = await createPreInstallSnapshot({
        installDir,
        claudeDir,
      });
      info({
        message: `✓ Snapshot created with ${manifest.preInstallSnapshot.files.length} files`,
      });
    }

    await saveManifest({ installDir, manifest });
    const manifestPath = getManifestPath({ installDir });
    success({ message: `✓ Manifest created: ${manifestPath}` });
  } else {
    // Manifest exists, just update timestamp
    await saveManifest({ installDir, manifest });
    success({ message: "✓ Manifest updated" });
  }
};

/**
 * Uninstall manifest - remove the manifest file and clean up empty .claude dir
 * @param args - Configuration arguments
 * @param args.config - Runtime configuration
 */
const uninstallManifest = async (args: { config: Config }): Promise<void> => {
  const { config } = args;
  const manifestPath = getManifestPath({ installDir: config.installDir });
  const claudeDir = `${config.installDir}/.claude`;

  if (!existsSync(manifestPath)) {
    info({ message: "Manifest file not found (may not exist)" });
  } else {
    unlinkSync(manifestPath);
    success({ message: `✓ Manifest file removed: ${manifestPath}` });
  }

  // Clean up .claude directory if it's empty (only contains no files)
  if (existsSync(claudeDir)) {
    const { readdirSync, rmdirSync } = await import("fs");
    const entries = readdirSync(claudeDir);
    if (entries.length === 0) {
      rmdirSync(claudeDir);
      info({ message: "✓ Removed empty .claude directory" });
    }
  }
};

/**
 * Manifest loader
 */
export const manifestLoader: Loader = {
  name: "manifest",
  description: "File tracking manifest (.nojo-manifest.json)",
  run: installManifest,
  uninstall: uninstallManifest,
};
