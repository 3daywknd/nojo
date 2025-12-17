/**
 * Manifest management for nojo installer
 * Tracks installed files and their content hashes for non-destructive updates
 */

import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";

import { getCurrentPackageVersion } from "@/cli/version.js";

import type {
  AddToManifestOptions,
  Manifest,
  ManifestEntry,
  PreInstallSnapshot,
} from "./types.js";

/**
 * Get the path to the manifest file
 * @param args - Configuration arguments
 * @param args.installDir - Installation directory
 *
 * @returns The absolute path to .claude/.nojo-manifest.json
 */
export const getManifestPath = (args: { installDir: string }): string => {
  const { installDir } = args;
  return path.join(installDir, ".claude", ".nojo-manifest.json");
};

/**
 * Compute SHA-256 hash of a file's contents
 * @param args - Hash arguments
 * @param args.filePath - Path to the file
 *
 * @returns Hex-encoded SHA-256 hash
 */
export const computeFileHash = async (args: {
  filePath: string;
}): Promise<string> => {
  const { filePath } = args;
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
};

/**
 * Check if a file has been modified from its expected hash
 * @param args - Check arguments
 * @param args.filePath - Path to the file
 * @param args.expectedHash - Expected SHA-256 hash
 *
 * @returns True if file exists and hash doesn't match expected
 */
export const isFileModified = async (args: {
  filePath: string;
  expectedHash: string;
}): Promise<boolean> => {
  const { filePath, expectedHash } = args;

  try {
    const currentHash = await computeFileHash({ filePath });
    return currentHash !== expectedHash;
  } catch {
    // File doesn't exist - not modified (it was deleted)
    return false;
  }
};

/**
 * Check if a file exists
 * @param args - Check arguments
 * @param args.filePath - Path to the file
 *
 * @returns True if file exists
 */
export const fileExists = async (args: {
  filePath: string;
}): Promise<boolean> => {
  const { filePath } = args;
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Create a new empty manifest
 * @returns New manifest with current version and timestamp
 */
export const createManifest = (): Manifest => {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    nojoVersion: getCurrentPackageVersion() ?? "unknown",
    createdAt: now,
    updatedAt: now,
    files: {},
    preInstallSnapshot: null,
  };
};

/**
 * Load existing manifest from disk
 * @param args - Load arguments
 * @param args.installDir - Installation directory
 *
 * @returns The manifest if valid, null otherwise
 */
export const loadManifest = async (args: {
  installDir: string;
}): Promise<Manifest | null> => {
  const { installDir } = args;
  const manifestPath = getManifestPath({ installDir });

  try {
    await fs.access(manifestPath);
    const content = await fs.readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(content) as Manifest;

    // Basic validation
    if (
      manifest == null ||
      typeof manifest !== "object" ||
      manifest.schemaVersion !== 1 ||
      typeof manifest.files !== "object"
    ) {
      return null;
    }

    return manifest;
  } catch {
    // File doesn't exist or is invalid JSON
    return null;
  }
};

/**
 * Save manifest to disk
 * @param args - Save arguments
 * @param args.installDir - Installation directory
 * @param args.manifest - Manifest to save
 */
export const saveManifest = async (args: {
  installDir: string;
  manifest: Manifest;
}): Promise<void> => {
  const { installDir, manifest } = args;
  const manifestPath = getManifestPath({ installDir });

  // Ensure .claude directory exists
  const claudeDir = path.dirname(manifestPath);
  await fs.mkdir(claudeDir, { recursive: true });

  // Update timestamp
  manifest.updatedAt = new Date().toISOString();
  manifest.nojoVersion = getCurrentPackageVersion() ?? "unknown";

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
};

/**
 * Add or update a file entry in the manifest
 * @param args - Add options
 *
 * @returns Updated manifest (mutates in place)
 */
export const addToManifest = (args: AddToManifestOptions): Manifest => {
  const { manifest, path: filePath, hash, source, profile, version } = args;

  const entry: ManifestEntry = {
    path: filePath,
    hash,
    source,
    profile: profile ?? null,
    version,
    installedAt: new Date().toISOString(),
  };

  manifest.files[filePath] = entry;
  return manifest;
};

/**
 * Remove a file entry from the manifest
 * @param args - Remove arguments
 * @param args.manifest - Manifest to update
 * @param args.path - Relative path to remove
 *
 * @returns Updated manifest (mutates in place)
 */
export const removeFromManifest = (args: {
  manifest: Manifest;
  path: string;
}): Manifest => {
  const { manifest, path: filePath } = args;
  delete manifest.files[filePath];
  return manifest;
};

/**
 * Get a file entry from the manifest
 * @param args - Get arguments
 * @param args.manifest - Manifest to search
 * @param args.path - Relative path to find
 *
 * @returns ManifestEntry if found, null otherwise
 */
export const getManifestEntry = (args: {
  manifest: Manifest;
  path: string;
}): ManifestEntry | null => {
  const { manifest, path: filePath } = args;
  return manifest.files[filePath] ?? null;
};

/**
 * Create a pre-install snapshot of existing files
 * @param args - Snapshot arguments
 * @param args.installDir - Installation directory
 * @param args.claudeDir - Path to .claude directory
 *
 * @returns Snapshot of existing files with hashes
 */
export const createPreInstallSnapshot = async (args: {
  installDir: string;
  claudeDir: string;
}): Promise<PreInstallSnapshot> => {
  const { installDir, claudeDir } = args;
  const files: Array<{ path: string; hash: string }> = [];

  const scanDirectory = async (dir: string): Promise<void> => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(installDir, fullPath);

        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          try {
            const hash = await computeFileHash({ filePath: fullPath });
            files.push({ path: relativePath, hash });
          } catch {
            // Skip files we can't read
          }
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
  };

  await scanDirectory(claudeDir);

  return {
    createdAt: new Date().toISOString(),
    files,
  };
};

/**
 * Get all manifest entries for a specific profile
 * @param args - Filter arguments
 * @param args.manifest - Manifest to search
 * @param args.profileName - Profile name to filter by
 *
 * @returns Array of entries belonging to the profile
 */
export const getEntriesForProfile = (args: {
  manifest: Manifest;
  profileName: string;
}): Array<ManifestEntry> => {
  const { manifest, profileName } = args;
  return Object.values(manifest.files).filter(
    (entry) => entry.profile === profileName,
  );
};

/**
 * Get all nojo-managed entries from the manifest
 * @param args - Filter arguments
 * @param args.manifest - Manifest to search
 *
 * @returns Array of nojo-managed entries
 */
export const getNojoManagedEntries = (args: {
  manifest: Manifest;
}): Array<ManifestEntry> => {
  const { manifest } = args;
  return Object.values(manifest.files).filter(
    (entry) => entry.source === "nojo",
  );
};
