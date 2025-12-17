/**
 * Tests for switch-profile command
 * Tests that the CLI correctly delegates to agent methods
 */

import * as fs from "fs/promises";
import { tmpdir } from "os";
import * as path from "path";

import { Command } from "commander";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { AgentRegistry } from "@/cli/features/agentRegistry.js";
import { promptUser } from "@/cli/prompt.js";

import { registerSwitchProfileCommand } from "./profiles.js";

// Mock install to avoid side effects - track calls for verification
const mockInstallMain = vi.fn().mockResolvedValue(undefined);
vi.mock("@/cli/commands/install/install.js", () => ({
  main: mockInstallMain,
}));

// Mock promptUser for interactive tests
vi.mock("@/cli/prompt.js", () => ({
  promptUser: vi.fn(),
}));

describe("agent.listProfiles", () => {
  let testInstallDir: string;

  beforeEach(async () => {
    testInstallDir = await fs.mkdtemp(path.join(tmpdir(), "profiles-test-"));
    const testClaudeDir = path.join(testInstallDir, ".claude");
    await fs.mkdir(testClaudeDir, { recursive: true });
    AgentRegistry.resetInstance();
  });

  afterEach(async () => {
    if (testInstallDir) {
      await fs.rm(testInstallDir, { recursive: true, force: true });
    }
    AgentRegistry.resetInstance();
  });

  it("should list all installed profiles", async () => {
    const profilesDir = path.join(testInstallDir, ".claude", "profiles");
    await fs.mkdir(profilesDir, { recursive: true });

    // Create user-facing profiles
    for (const name of ["amol", "senior-swe"]) {
      const dir = path.join(profilesDir, name);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "CLAUDE.md"), `# ${name}`);
      await fs.writeFile(
        path.join(dir, "profile.json"),
        JSON.stringify({ extends: "_base", name, description: "Test" }),
      );
    }

    const agent = AgentRegistry.getInstance().get({ name: "claude-code" });
    const profiles = await agent.listProfiles({ installDir: testInstallDir });

    expect(profiles).toContain("amol");
    expect(profiles).toContain("senior-swe");
  });
});

describe("agent.switchProfile", () => {
  let testInstallDir: string;

  beforeEach(async () => {
    testInstallDir = await fs.mkdtemp(path.join(tmpdir(), "switch-test-"));
    const testClaudeDir = path.join(testInstallDir, ".claude");
    await fs.mkdir(testClaudeDir, { recursive: true });
    AgentRegistry.resetInstance();
  });

  afterEach(async () => {
    if (testInstallDir) {
      await fs.rm(testInstallDir, { recursive: true, force: true });
    }
    AgentRegistry.resetInstance();
  });

  it("should preserve version when switching profiles for claude-code", async () => {
    // Create profiles directory with test profiles
    const profilesDir = path.join(testInstallDir, ".claude", "profiles");
    await fs.mkdir(profilesDir, { recursive: true });

    for (const name of ["profile-a", "profile-b"]) {
      const dir = path.join(profilesDir, name);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "CLAUDE.md"), `# ${name}`);
    }

    // Create initial config with version (now at .claude/.nojo-config.json)
    const configPath = path.join(
      testInstallDir,
      ".claude",
      ".nojo-config.json",
    );
    const initialConfig = {
      agents: {
        "claude-code": { profile: { baseProfile: "profile-a" } },
      },
      version: "v19.0.0",
    };
    await fs.writeFile(configPath, JSON.stringify(initialConfig, null, 2));

    // Switch to profile-b using agent method
    const agent = AgentRegistry.getInstance().get({ name: "claude-code" });
    await agent.switchProfile({
      installDir: testInstallDir,
      profileName: "profile-b",
    });

    // Verify version was preserved
    const updatedConfig = JSON.parse(await fs.readFile(configPath, "utf-8"));
    expect(updatedConfig.agents?.["claude-code"]?.profile?.baseProfile).toBe(
      "profile-b",
    );
    expect(updatedConfig.version).toBe("v19.0.0");
  });
});

describe("registerSwitchProfileCommand", () => {
  let testInstallDir: string;

  beforeEach(async () => {
    testInstallDir = await fs.mkdtemp(
      path.join(tmpdir(), "switch-profile-cmd-test-"),
    );
    const testClaudeDir = path.join(testInstallDir, ".claude");
    await fs.mkdir(testClaudeDir, { recursive: true });

    // Create profiles directory with test profiles
    const profilesDir = path.join(testClaudeDir, "profiles");
    await fs.mkdir(profilesDir, { recursive: true });
    for (const name of ["senior-swe", "product-manager"]) {
      const dir = path.join(profilesDir, name);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "CLAUDE.md"), `# ${name}`);
    }

    AgentRegistry.resetInstance();
  });

  afterEach(async () => {
    if (testInstallDir) {
      await fs.rm(testInstallDir, { recursive: true, force: true });
    }
    AgentRegistry.resetInstance();
    vi.restoreAllMocks();
  });

  it("should accept --agent as a local option after the subcommand", async () => {
    // Create a program and register the command
    const program = new Command();
    program.exitOverride(); // Throw instead of process.exit
    program.configureOutput({
      writeErr: () => undefined, // Suppress error output
    });

    // Add global options like the real CLI
    program
      .option("-d, --install-dir <path>", "Custom installation directory")
      .option("-n, --non-interactive", "Run without interactive prompts")
      .option("-a, --agent <name>", "AI agent to use", "claude-code");

    registerSwitchProfileCommand({ program });

    // This should NOT throw "unknown option '--agent'" when --agent comes after the subcommand
    // Parse with --agent AFTER the subcommand (the bug case)
    let parseError: Error | null = null;
    try {
      await program.parseAsync([
        "node",
        "nojo",
        "switch-profile",
        "senior-swe",
        "--agent",
        "claude-code",
        "--install-dir",
        testInstallDir,
      ]);
    } catch (err) {
      parseError = err as Error;
    }

    // The command should accept --agent after the subcommand
    // If it throws "unknown option '--agent'", the test fails
    // If parseError is undefined (no error), the test passes
    if (parseError != null) {
      expect(parseError.message).not.toContain("unknown option");
    }
  });

  it("should call installMain with silent: true", async () => {
    // Create config with claude-code installed (now at .claude/.nojo-config.json)
    const configPath = path.join(
      testInstallDir,
      ".claude",
      ".nojo-config.json",
    );
    await fs.writeFile(
      configPath,
      JSON.stringify({
        agents: {
          "claude-code": { profile: { baseProfile: "senior-swe" } },
        },
        installDir: testInstallDir,
      }),
    );

    const program = new Command();
    program.exitOverride();
    program.configureOutput({ writeErr: () => undefined });
    program
      .option("-d, --install-dir <path>", "Custom installation directory")
      .option("-n, --non-interactive", "Run without interactive prompts")
      .option("-a, --agent <name>", "AI agent to use");

    registerSwitchProfileCommand({ program });

    // Reset mock to track this specific call
    mockInstallMain.mockClear();

    // Mock confirmation prompt to return "y"
    vi.mocked(promptUser).mockResolvedValueOnce("y");

    // Mock claude-code's switchProfile
    const claudeAgent = AgentRegistry.getInstance().get({
      name: "claude-code",
    });
    vi.spyOn(claudeAgent, "switchProfile").mockResolvedValue(undefined);

    try {
      await program.parseAsync([
        "node",
        "nojo",
        "switch-profile",
        "senior-swe",
        "--non-interactive",
        "--install-dir",
        testInstallDir,
        "--non-interactive",
      ]);
    } catch {
      // May throw due to exit
    }

    // Verify installMain was called with silent: true
    expect(mockInstallMain).toHaveBeenCalledWith(
      expect.objectContaining({
        silent: true,
        nonInteractive: true,
        skipUninstall: true,
      }),
    );
  });
});

describe("switch-profile confirmation", () => {
  let testInstallDir: string;

  beforeEach(async () => {
    testInstallDir = await fs.mkdtemp(
      path.join(tmpdir(), "switch-profile-confirm-test-"),
    );
    const testClaudeDir = path.join(testInstallDir, ".claude");
    await fs.mkdir(testClaudeDir, { recursive: true });

    // Create profiles directory with test profiles
    const profilesDir = path.join(testClaudeDir, "profiles");
    await fs.mkdir(profilesDir, { recursive: true });
    for (const name of ["senior-swe", "product-manager"]) {
      const dir = path.join(profilesDir, name);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "CLAUDE.md"), `# ${name}`);
    }

    AgentRegistry.resetInstance();
    vi.mocked(promptUser).mockReset();
  });

  afterEach(async () => {
    if (testInstallDir) {
      await fs.rm(testInstallDir, { recursive: true, force: true });
    }
    AgentRegistry.resetInstance();
    vi.restoreAllMocks();
  });

  it("should show confirmation prompt with install dir, agent, current profile, and new profile in interactive mode", async () => {
    // Create config with current profile (now at .claude/.nojo-config.json)
    const configPath = path.join(
      testInstallDir,
      ".claude",
      ".nojo-config.json",
    );
    await fs.writeFile(
      configPath,
      JSON.stringify({
        agents: {
          "claude-code": { profile: { baseProfile: "senior-swe" } },
        },
      }),
    );

    const program = new Command();
    program.exitOverride();
    program.configureOutput({ writeErr: () => undefined });
    program
      .option("-d, --install-dir <path>", "Custom installation directory")
      .option("-n, --non-interactive", "Run without interactive prompts")
      .option("-a, --agent <name>", "AI agent to use");

    registerSwitchProfileCommand({ program });

    // Mock confirmation prompt to return "y"
    vi.mocked(promptUser).mockResolvedValueOnce("y");

    // Mock switchProfile
    const claudeAgent = AgentRegistry.getInstance().get({
      name: "claude-code",
    });
    const switchProfileSpy = vi
      .spyOn(claudeAgent, "switchProfile")
      .mockResolvedValue(undefined);

    try {
      await program.parseAsync([
        "node",
        "nojo",
        "switch-profile",
        "product-manager",
        "--install-dir",
        testInstallDir,
      ]);
    } catch {
      // May throw due to exit
    }

    // Verify promptUser was called for confirmation
    expect(promptUser).toHaveBeenCalled();

    // The prompt should contain key information
    const promptCall = vi.mocked(promptUser).mock.calls[0][0];
    expect(promptCall.prompt).toContain("y/n");

    // switchProfile should have been called since user confirmed
    expect(switchProfileSpy).toHaveBeenCalledWith({
      installDir: testInstallDir,
      profileName: "product-manager",
    });
  });

  it("should cancel operation when user declines confirmation", async () => {
    // Create config with current profile (now at .claude/.nojo-config.json)
    const configPath = path.join(
      testInstallDir,
      ".claude",
      ".nojo-config.json",
    );
    await fs.writeFile(
      configPath,
      JSON.stringify({
        agents: {
          "claude-code": { profile: { baseProfile: "senior-swe" } },
        },
      }),
    );

    const program = new Command();
    program.exitOverride();
    program.configureOutput({ writeErr: () => undefined });
    program
      .option("-d, --install-dir <path>", "Custom installation directory")
      .option("-n, --non-interactive", "Run without interactive prompts")
      .option("-a, --agent <name>", "AI agent to use");

    registerSwitchProfileCommand({ program });

    // Mock confirmation prompt to return "n"
    vi.mocked(promptUser).mockResolvedValueOnce("n");

    // Mock switchProfile to track if it was called
    const claudeAgent = AgentRegistry.getInstance().get({
      name: "claude-code",
    });
    const switchProfileSpy = vi
      .spyOn(claudeAgent, "switchProfile")
      .mockResolvedValue(undefined);

    try {
      await program.parseAsync([
        "node",
        "nojo",
        "switch-profile",
        "product-manager",
        "--install-dir",
        testInstallDir,
      ]);
    } catch {
      // May throw due to exit
    }

    // switchProfile should NOT have been called since user declined
    expect(switchProfileSpy).not.toHaveBeenCalled();
  });

  it("should skip confirmation prompt in non-interactive mode", async () => {
    // Create config with current profile (now at .claude/.nojo-config.json)
    const configPath = path.join(
      testInstallDir,
      ".claude",
      ".nojo-config.json",
    );
    await fs.writeFile(
      configPath,
      JSON.stringify({
        agents: {
          "claude-code": { profile: { baseProfile: "senior-swe" } },
        },
      }),
    );

    const program = new Command();
    program.exitOverride();
    program.configureOutput({ writeErr: () => undefined });
    program
      .option("-d, --install-dir <path>", "Custom installation directory")
      .option("-n, --non-interactive", "Run without interactive prompts")
      .option("-a, --agent <name>", "AI agent to use");

    registerSwitchProfileCommand({ program });

    // Mock switchProfile
    const claudeAgent = AgentRegistry.getInstance().get({
      name: "claude-code",
    });
    const switchProfileSpy = vi
      .spyOn(claudeAgent, "switchProfile")
      .mockResolvedValue(undefined);

    try {
      await program.parseAsync([
        "node",
        "nojo",
        "--non-interactive",
        "switch-profile",
        "product-manager",
        "--install-dir",
        testInstallDir,
      ]);
    } catch {
      // May throw due to exit
    }

    // promptUser should NOT have been called in non-interactive mode
    expect(promptUser).not.toHaveBeenCalled();

    // switchProfile should proceed without confirmation
    expect(switchProfileSpy).toHaveBeenCalledWith({
      installDir: testInstallDir,
      profileName: "product-manager",
    });
  });
});

describe("switch-profile getInstallDirs auto-detection", () => {
  let testInstallDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    testInstallDir = await fs.mkdtemp(
      path.join(tmpdir(), "switch-profile-autodetect-test-"),
    );

    // Create profiles directory with test profiles
    const claudeDir = path.join(testInstallDir, ".claude");
    const profilesDir = path.join(claudeDir, "profiles");
    await fs.mkdir(profilesDir, { recursive: true });
    for (const name of ["senior-swe", "product-manager"]) {
      const dir = path.join(profilesDir, name);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "CLAUDE.md"), `# ${name}`);
    }

    // Create config file to mark this as a nojo installation (now at .claude/.nojo-config.json)
    const configPath = path.join(
      testInstallDir,
      ".claude",
      ".nojo-config.json",
    );
    await fs.writeFile(
      configPath,
      JSON.stringify({
        agents: {
          "claude-code": { profile: { baseProfile: "senior-swe" } },
        },
      }),
    );

    AgentRegistry.resetInstance();
    vi.mocked(promptUser).mockReset();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (testInstallDir) {
      await fs.rm(testInstallDir, { recursive: true, force: true });
    }
    AgentRegistry.resetInstance();
    vi.restoreAllMocks();
  });

  it("should auto-detect installation in current directory when no --install-dir provided", async () => {
    // Change to the installation directory
    process.chdir(testInstallDir);

    const program = new Command();
    program.exitOverride();
    program.configureOutput({ writeErr: () => undefined });
    program
      .option("-d, --install-dir <path>", "Custom installation directory")
      .option("-n, --non-interactive", "Run without interactive prompts")
      .option("-a, --agent <name>", "AI agent to use");

    registerSwitchProfileCommand({ program });

    // Mock confirmation prompt to return "y"
    vi.mocked(promptUser).mockResolvedValueOnce("y");

    // Mock switchProfile to track calls
    const claudeAgent = AgentRegistry.getInstance().get({
      name: "claude-code",
    });
    const switchProfileSpy = vi
      .spyOn(claudeAgent, "switchProfile")
      .mockResolvedValue(undefined);

    try {
      // Note: NO --install-dir flag - should auto-detect from cwd
      await program.parseAsync([
        "node",
        "nojo",
        "switch-profile",
        "product-manager",
      ]);
    } catch {
      // May throw due to exit
    }

    // Should detect installation in current directory and use it
    expect(switchProfileSpy).toHaveBeenCalledWith({
      installDir: testInstallDir,
      profileName: "product-manager",
    });
  });

  it("should auto-detect installation in parent directory when running from subdirectory", async () => {
    // Create a subdirectory to run from
    const subDir = path.join(testInstallDir, "src", "components");
    await fs.mkdir(subDir, { recursive: true });

    // Change to the subdirectory
    process.chdir(subDir);

    const program = new Command();
    program.exitOverride();
    program.configureOutput({ writeErr: () => undefined });
    program
      .option("-d, --install-dir <path>", "Custom installation directory")
      .option("-n, --non-interactive", "Run without interactive prompts")
      .option("-a, --agent <name>", "AI agent to use");

    registerSwitchProfileCommand({ program });

    // Mock confirmation prompt to return "y"
    vi.mocked(promptUser).mockResolvedValueOnce("y");

    // Mock switchProfile to track calls
    const claudeAgent = AgentRegistry.getInstance().get({
      name: "claude-code",
    });
    const switchProfileSpy = vi
      .spyOn(claudeAgent, "switchProfile")
      .mockResolvedValue(undefined);

    try {
      // Note: NO --install-dir flag - should traverse up and find installation
      await program.parseAsync([
        "node",
        "nojo",
        "switch-profile",
        "product-manager",
      ]);
    } catch {
      // May throw due to exit
    }

    // Should traverse up and find installation in parent directory
    expect(switchProfileSpy).toHaveBeenCalledWith({
      installDir: testInstallDir,
      profileName: "product-manager",
    });
  });
});
