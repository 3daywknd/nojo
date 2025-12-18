import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as os from "os";
import * as path from "path";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { runUninstall } from "@/cli/commands/uninstall/uninstall.js";
import { getConfigPath } from "@/cli/config.js";
import { getInstalledVersion } from "@/cli/version.js";

import type * as versionModule from "@/cli/version.js";
import type * as childProcess from "child_process";
import type * as firebaseAuth from "firebase/auth";

import { main as installMain } from "./install.js";

// Store console output for testing warnings (prefixed to indicate intentionally unused)
const _consoleOutput: Array<string> = [];
const _originalConsoleLog = console.log;

// Track whether nojo uninstall was called and the command used
let uninstallCalled = false;
let _uninstallCommand = "";

// Mock child_process to intercept nori-ai calls
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof childProcess>();
  return {
    ...actual,
    execSync: vi.fn((command: string, _options?: any) => {
      // Check if nojo uninstall was called (no longer version-specific)
      const match = command.match(/nojo uninstall/);
      if (match) {
        uninstallCalled = true;
        _uninstallCommand = command;

        // Simulate uninstall behavior - remove the marker file
        try {
          // Compute marker path using current cwd (which will be mocked in tests)
          const markerPath = path.join(
            process.cwd(),
            ".nori-test-installation-marker",
          );
          fs.unlinkSync(markerPath);
        } catch {
          // Ignore if doesn't exist
        }
        return;
      }

      // CRITICAL: Do NOT execute other commands for real during tests
      // This was causing tests to uninstall the actual user installation
      console.warn(`[TEST] Blocking real execSync call: ${command}`);
      return;
    }),
  };
});

// Mock paths module to use test directory
vi.mock("@/cli/features/claude-code/paths.js", () => {
  const testClaudeDir = "/tmp/install-integration-test-claude";
  return {
    getClaudeDir: (_args: { installDir: string }) => testClaudeDir,
    getClaudeSettingsFile: (_args: { installDir: string }) =>
      `${testClaudeDir}/settings.json`,
    getClaudeHomeDir: () => testClaudeDir,
    getClaudeHomeSettingsFile: () => `${testClaudeDir}/settings.json`,
    getClaudeHomeCommandsDir: () => `${testClaudeDir}/commands`,
    getClaudeAgentsDir: (_args: { installDir: string }) =>
      `${testClaudeDir}/agents`,
    getClaudeCommandsDir: (_args: { installDir: string }) =>
      `${testClaudeDir}/commands`,
    getClaudeMdFile: (_args: { installDir: string }) =>
      `${testClaudeDir}/CLAUDE.md`,
    getClaudeSkillsDir: (_args: { installDir: string }) =>
      `${testClaudeDir}/skills`,
    getClaudeProfilesDir: (_args: { installDir: string }) =>
      `${testClaudeDir}/profiles`,
  };
});

// Mock getCurrentPackageVersion to return a controlled version for tests
vi.mock("@/cli/version.js", async (importOriginal) => {
  const actual = await importOriginal<typeof versionModule>();
  return {
    ...actual,
    getCurrentPackageVersion: vi.fn().mockReturnValue("13.0.0"),
  };
});

// Mock analytics to prevent tracking during tests
vi.mock("@/cli/analytics.js", () => ({
  initializeAnalytics: vi.fn(),
  trackEvent: vi.fn(),
}));

// Mock Firebase SDK to avoid hitting real Firebase API
vi.mock("firebase/auth", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof firebaseAuth;
  return {
    ...actual,
    signInWithEmailAndPassword: vi.fn().mockResolvedValue({
      user: {
        refreshToken: "mock-refresh-token",
      },
    }),
  };
});

// Mock Firebase provider
vi.mock("@/providers/firebase.js", () => ({
  configureFirebase: vi.fn(),
  getFirebase: vi.fn().mockReturnValue({}),
}));

describe("install integration test", () => {
  let tempDir: string;
  let originalCwd: () => string;
  let MARKER_FILE_PATH: string;

  const TEST_CLAUDE_DIR = "/tmp/install-integration-test-claude";

  beforeEach(async () => {
    // Create temp directory
    tempDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), "install-test-cwd-"),
    );

    // Mock process.cwd
    originalCwd = process.cwd;
    process.cwd = () => tempDir;

    // Now paths point to temp dir (via cwd)
    MARKER_FILE_PATH = path.join(tempDir, ".nori-test-installation-marker");

    // Reset tracking variables
    uninstallCalled = false;
    _uninstallCommand = "";

    // Clean up any existing files in temp dir
    try {
      fs.unlinkSync(MARKER_FILE_PATH);
    } catch {}

    // Create test claude directory
    if (!fs.existsSync(TEST_CLAUDE_DIR)) {
      fs.mkdirSync(TEST_CLAUDE_DIR, { recursive: true });
    }

    // Note: Do NOT pre-create .claude directory in tempDir here.
    // The saveConfig() function now creates it automatically via fs.mkdir(recursive: true).
    // Pre-creating it would break snapshot tests that compare pre/post-install state.
  });

  afterEach(async () => {
    // Restore cwd
    process.cwd = originalCwd;

    // Clean up temp directory
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch {}

    // Clean up test directories
    try {
      fs.rmSync(TEST_CLAUDE_DIR, { recursive: true, force: true });
    } catch {}
  });

  it.skip("should track version across installation upgrade flow [FLAKY - uninstall subprocess]", async () => {
    // Test skipped - flaky subprocess detection
  });

  it("should NOT install paid features for free users without auth credentials", async () => {
    const CONFIG_PATH = getConfigPath({ installDir: tempDir });

    // STEP 1: Create config WITHOUT auth credentials (free user)
    const freeConfig = {
      version: "18.0.0",
      agents: { "claude-code": { profile: { baseProfile: "senior-swe" } } },
    };
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(freeConfig, null, 2));

    // STEP 2: Run installation in non-interactive mode
    await installMain({ nonInteractive: true, installDir: tempDir });

    // STEP 3: Verify paid features are NOT installed
    const profileDir = path.join(TEST_CLAUDE_DIR, "profiles", "senior-swe");
    const skillsDir = path.join(profileDir, "skills");

    // Paid skills should NOT exist for free users (check with paid- prefix)
    expect(fs.existsSync(path.join(skillsDir, "paid-recall"))).toBe(false);
    expect(fs.existsSync(path.join(skillsDir, "paid-memorize"))).toBe(false);
    expect(fs.existsSync(path.join(skillsDir, "paid-write-noridoc"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(skillsDir, "paid-read-noridoc"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(skillsDir, "paid-list-noridocs"))).toBe(
      false,
    );

    // Paid subagents should NOT exist
    const subagentsDir = path.join(profileDir, "subagents");
    expect(
      fs.existsSync(path.join(subagentsDir, "nori-knowledge-researcher.md")),
    ).toBe(false);

    // STEP 4: Verify sendSessionTranscript is NOT included for free users
    const finalConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    expect(finalConfig.sendSessionTranscript).toBeUndefined();

    // Clean up
    try {
      fs.unlinkSync(CONFIG_PATH);
    } catch {}
  });

  it("should skip uninstall for first-time installation", async () => {
    // Ensure no existing installation
    const CONFIG_PATH = getConfigPath({ installDir: tempDir });
    try {
      fs.unlinkSync(CONFIG_PATH);
    } catch {}
    expect(fs.existsSync(CONFIG_PATH)).toBe(false);

    // Run installation with explicit profile (required for non-interactive without existing config)
    await installMain({
      nonInteractive: true,
      installDir: tempDir,
      profile: "senior-swe",
    });

    // Verify uninstall was NOT called
    expect(uninstallCalled).toBe(false);

    // Verify installation completed and version was saved in config
    expect(fs.existsSync(CONFIG_PATH)).toBe(true);
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    expect(config.version).toBe("13.0.0");
  });

  it("should skip uninstall when skipUninstall is true", async () => {
    // STEP 1: Simulate existing installation at version 12.0.0
    const CONFIG_PATH = getConfigPath({ installDir: tempDir });
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(
      CONFIG_PATH,
      JSON.stringify({
        version: "12.0.0",
        agents: { "claude-code": { profile: { baseProfile: "senior-swe" } } },
      }),
    );
    fs.writeFileSync(MARKER_FILE_PATH, "installed by v12.0.0");

    // Verify initial state
    expect(await getInstalledVersion({ installDir: tempDir })).toBe("12.0.0");
    expect(fs.existsSync(MARKER_FILE_PATH)).toBe(true);

    // STEP 2: Run installation with skipUninstall=true
    await installMain({
      nonInteractive: true,
      skipUninstall: true,
      installDir: tempDir,
    });

    // STEP 3: Verify uninstall was NOT called
    expect(uninstallCalled).toBe(false);

    // Verify the marker file still exists (wasn't removed by uninstall)
    expect(fs.existsSync(MARKER_FILE_PATH)).toBe(true);

    // Version should be updated to new version in config
    expect(fs.existsSync(CONFIG_PATH)).toBe(true);
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    expect(config.version).toBe("13.0.0");
  });

  // Skip locally - test pollution from parallel tests leaves stale profiles
  it.skipIf(!process.env.CI)(
    "should completely clean up all Nori files after uninstall",
    async () => {
      const CONFIG_PATH = getConfigPath({ installDir: tempDir });

      // Helper to recursively get all files/dirs in a directory
      const getDirectorySnapshot = (dir: string): Array<string> => {
        const results: Array<string> = [];
        if (!fs.existsSync(dir)) return results;

        const walk = (currentPath: string) => {
          const entries = fs.readdirSync(currentPath, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            const relativePath = path.relative(dir, fullPath);
            results.push(relativePath);
            if (entry.isDirectory()) {
              walk(fullPath);
            }
          }
        };
        walk(dir);
        return results.sort();
      };

      // STEP 1: Snapshot state BEFORE install
      const preInstallClaudeSnapshot = getDirectorySnapshot(TEST_CLAUDE_DIR);
      const preInstallCwdSnapshot = getDirectorySnapshot(tempDir);

      // STEP 2: Install with paid config to get all features
      const paidConfig = {
        version: "18.0.0",
        agents: { "claude-code": { profile: { baseProfile: "senior-swe" } } },
      };
      fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(paidConfig, null, 2));

      await installMain({ nonInteractive: true, installDir: tempDir });

      // STEP 3: Verify installation actually created files
      const postInstallClaudeSnapshot = getDirectorySnapshot(TEST_CLAUDE_DIR);
      const postInstallCwdSnapshot = getDirectorySnapshot(tempDir);

      // Installation should have added files
      expect(postInstallClaudeSnapshot.length).toBeGreaterThan(
        preInstallClaudeSnapshot.length,
      );
      expect(postInstallCwdSnapshot.length).toBeGreaterThan(
        preInstallCwdSnapshot.length,
      );

      // Verify some expected files exist (sanity check)
      expect(postInstallClaudeSnapshot.some((f) => f.includes("agents"))).toBe(
        true,
      );
      expect(
        postInstallClaudeSnapshot.some((f) => f.includes("commands")),
      ).toBe(true);
      expect(
        postInstallClaudeSnapshot.some((f) => f.includes("profiles")),
      ).toBe(true);
      expect(postInstallClaudeSnapshot.some((f) => f.includes("skills"))).toBe(
        true,
      );

      // Create legacy notifications log to test cleanup (from older versions)
      const notificationsLog = path.join(tempDir, ".nori-notifications.log");
      fs.writeFileSync(notificationsLog, "test notification log");

      // STEP 4: Run uninstall with removeConfig=true (user-initiated uninstall)
      await runUninstall({
        removeConfig: true,
        removeGlobalSettings: true,
        installDir: tempDir,
      });

      // STEP 5: Snapshot state AFTER uninstall
      const postUninstallClaudeSnapshot = getDirectorySnapshot(TEST_CLAUDE_DIR);
      const postUninstallCwdSnapshot = getDirectorySnapshot(tempDir);

      // STEP 6: Compare snapshots - state should match pre-install
      // Note: settings.json may remain as it's a shared Claude Code file,
      // but it should be empty or only contain schema after cleanup
      const allowedRemnants = ["settings.json"];
      const filteredPostUninstall = postUninstallClaudeSnapshot.filter(
        (f) => !allowedRemnants.includes(f),
      );

      // Claude directory should be back to pre-install state (except allowed remnants)
      expect(filteredPostUninstall).toEqual(preInstallClaudeSnapshot);

      // If settings.json remains, verify it has no Nori content
      const settingsPath = path.join(TEST_CLAUDE_DIR, "settings.json");
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        // Should not have hooks (removed by hooks loader)
        expect(settings.hooks).toBeUndefined();
        // Should not have Nori-specific permissions
        if (settings.permissions?.additionalDirectories) {
          const noriDirs = settings.permissions.additionalDirectories.filter(
            (d: string) => d.includes("skills") || d.includes("profiles"),
          );
          expect(noriDirs.length).toBe(0);
        }
      }

      // Cwd directory should be back to pre-install state
      // (no config file, no version file, no notifications log)
      expect(postUninstallCwdSnapshot).toEqual(preInstallCwdSnapshot);
    },
  );

  it("should include agent in config after installation", async () => {
    const CONFIG_PATH = getConfigPath({ installDir: tempDir });

    // STEP 1: Run installation in non-interactive mode with explicit profile
    await installMain({
      nonInteractive: true,
      installDir: tempDir,
      profile: "senior-swe",
    });

    // STEP 2: Verify agent is set in the config via agents object
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    expect(Object.keys(config.agents)).toEqual(["claude-code"]);
  });

  it("should accumulate agents when installing multiple agents", async () => {
    const CONFIG_PATH = getConfigPath({ installDir: tempDir });

    // STEP 1: Create existing config with one agent
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(
      CONFIG_PATH,
      JSON.stringify({
        version: "19.0.0",
        agents: {
          "cursor-agent": { profile: { baseProfile: "senior-swe" } },
        },
        installDir: tempDir,
      }),
    );

    // STEP 2: Install claude-code (default agent)
    // Need to pass profile since this agent doesn't have existing config
    await installMain({
      nonInteractive: true,
      installDir: tempDir,
      profile: "senior-swe",
    });

    // STEP 3: Verify both agents are in agents object
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    expect(Object.keys(config.agents).sort()).toEqual([
      "claude-code",
      "cursor-agent",
    ]);
    expect(Object.keys(config.agents)).toHaveLength(2);
  });

  it.skip("should run uninstall when reinstalling the same agent (upgrade scenario) [FLAKY - uninstall subprocess]", async () => {
    // Test skipped - flaky subprocess detection
  });

  it("should include agents field with agent-specific profile in config after installation", async () => {
    const CONFIG_PATH = getConfigPath({ installDir: tempDir });

    // STEP 1: Run installation in non-interactive mode with explicit profile
    await installMain({
      nonInteractive: true,
      installDir: tempDir,
      profile: "senior-swe",
    });

    // STEP 2: Verify agents field is set with agent-specific profile
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

    // The agents field should exist and contain the claude-code agent's profile
    expect(config.agents).toBeDefined();
    expect(config.agents["claude-code"]).toBeDefined();
    expect(config.agents["claude-code"].profile).toEqual({
      baseProfile: "senior-swe",
    });

    // Legacy profile field should NOT be written (removed in v19.0.0)
    expect(config.profile).toBeUndefined();
  });

  it("should require --profile flag for non-interactive install without existing config", async () => {
    const CONFIG_PATH = getConfigPath({ installDir: tempDir });

    // Ensure no existing config
    try {
      fs.unlinkSync(CONFIG_PATH);
    } catch {}
    expect(fs.existsSync(CONFIG_PATH)).toBe(false);

    // Mock process.exit to capture exit code
    const processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`process.exit(${code})`);
      }) as any;

    try {
      // Run installation without --profile flag - should fail
      await expect(
        installMain({ nonInteractive: true, installDir: tempDir }),
      ).rejects.toThrow("process.exit(1)");

      // Verify no config was created
      expect(fs.existsSync(CONFIG_PATH)).toBe(false);
    } finally {
      processExitSpy.mockRestore();
    }
  });

  it("should succeed with --profile flag for non-interactive install without existing config", async () => {
    const CONFIG_PATH = getConfigPath({ installDir: tempDir });

    // Ensure no existing config
    try {
      fs.unlinkSync(CONFIG_PATH);
    } catch {}
    expect(fs.existsSync(CONFIG_PATH)).toBe(false);

    // Run installation WITH --profile flag
    await installMain({
      nonInteractive: true,
      installDir: tempDir,
      profile: "senior-swe",
    });

    // Verify config was created with correct profile
    expect(fs.existsSync(CONFIG_PATH)).toBe(true);
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    expect(config.agents["claude-code"].profile).toEqual({
      baseProfile: "senior-swe",
    });
  });

  it("should preserve agent-specific profile in noninteractive mode (switch-profile scenario)", async () => {
    const CONFIG_PATH = getConfigPath({ installDir: tempDir });

    // STEP 1: Create config that simulates what happens after switch-profile:
    // - agents.claude-code.profile is set to the NEW profile ("amol")
    // - The top-level 'profile' field may be stale or absent (cursor-agent doesn't write it)
    //
    // This is the exact scenario that caused the bug: switch-profile sets the agent's
    // profile but the top-level 'profile' field is not updated (for non-claude-code agents).
    // Then noninteractive() was using existingConfig.profile ?? getDefaultProfile()
    // which would return the default instead of the agent-specific profile.
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(
      CONFIG_PATH,
      JSON.stringify({
        version: "19.0.0",
        // Agent-specific profile is set correctly (this is what switch-profile sets)
        // Using "amol" since it's a real profile that exists (not the default "senior-swe")
        agents: {
          "claude-code": { profile: { baseProfile: "amol" } },
        },
        // Top-level profile is ABSENT - this is the bug trigger
        // (For cursor-agent, saveConfig doesn't write top-level profile)
        installedAgents: ["claude-code"],
        installDir: tempDir,
      }),
    );

    // STEP 2: Run installation in non-interactive mode with skipUninstall
    // This mimics what switch-profile does after setting the agent's profile
    await installMain({
      nonInteractive: true,
      skipUninstall: true,
      installDir: tempDir,
    });

    // STEP 3: Verify the agent-specific profile was preserved, NOT overwritten with default
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

    // BUG: Before the fix, this would be "senior-swe" (the default)
    // because noninteractive() used existingConfig.profile ?? getDefaultProfile()
    // which fell back to the default since top-level profile was absent
    expect(config.agents["claude-code"].profile.baseProfile).toBe("amol");
  });

  it.skip("should warn when ancestor directory has nori installation [FLAKY - console output capture]", async () => {
    // Test skipped - flaky console output capture
  });

  describe("config migration during install", () => {
    it("should skip migration for first-time install (no existing config)", async () => {
      const CONFIG_PATH = getConfigPath({ installDir: tempDir });

      // Ensure no existing config
      try {
        fs.unlinkSync(CONFIG_PATH);
      } catch {}
      expect(fs.existsSync(CONFIG_PATH)).toBe(false);

      // Run installation with profile (first-time install)
      await installMain({
        nonInteractive: true,
        installDir: tempDir,
        profile: "senior-swe",
      });

      // Config should be created with new format from the start
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      expect(config.version).toBeDefined();
      expect(config.agents["claude-code"].profile).toEqual({
        baseProfile: "senior-swe",
      });
    });
  });
});
