/**
 * Types for the nojo manifest system
 *
 * The manifest tracks all files installed by nojo, their content hashes,
 * and source information. This enables non-destructive installs by detecting
 * user modifications and preserving them during upgrades.
 */

/**
 * Individual file entry in the manifest
 */
export type ManifestEntry = {
  /** Relative path from installDir (e.g., ".claude/skills/using-skills/SKILL.md") */
  path: string;
  /** SHA-256 hash of file content at install time */
  hash: string;
  /** Source of the file */
  source: "nojo" | "user" | "existing";
  /** Profile this file belongs to (if any) */
  profile?: string | null;
  /** nojo version that installed this file */
  version: string;
  /** ISO timestamp of installation */
  installedAt: string;
};

/**
 * Pre-install snapshot of existing files
 */
export type PreInstallSnapshot = {
  /** When the snapshot was taken */
  createdAt: string;
  /** Files that existed before nojo was installed */
  files: Array<{ path: string; hash: string }>;
};

/**
 * Manifest file structure
 */
export type Manifest = {
  /** Schema version for future migrations */
  schemaVersion: 1;
  /** nojo version that created this manifest */
  nojoVersion: string;
  /** When manifest was created */
  createdAt: string;
  /** When manifest was last updated */
  updatedAt: string;
  /** Map of relative path -> ManifestEntry */
  files: Record<string, ManifestEntry>;
  /** Snapshot of existing files before first nojo install */
  preInstallSnapshot?: PreInstallSnapshot | null;
};

/**
 * Options for adding a file to the manifest
 */
export type AddToManifestOptions = {
  manifest: Manifest;
  path: string;
  hash: string;
  source: ManifestEntry["source"];
  profile?: string | null;
  version: string;
};
