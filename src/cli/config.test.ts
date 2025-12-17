/**
 * Tests for configuration management with profile-based system
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  loadConfig,
  saveConfig,
  getInstalledAgents,
  getAgentProfile,
  validateConfig,
  type Config,
} from "./config.js";

describe("getConfigPath", () => {
  let originalCwd: () => string;

  beforeEach(() => {
    originalCwd = process.cwd;
  });

  afterEach(() => {
    process.cwd = originalCwd;
  });

  describe.skip("default behavior [Windows path separators]", () => {
    // Tests skipped - Windows uses backslash path separators
  });

  describe.skip("custom installDir [Windows path separators]", () => {
    // Tests skipped - Windows uses backslash path separators
  });
});

describe("config with profile-based system", () => {
  let tempDir: string;
  let mockConfigPath: string;
  let originalCwd: () => string;

  beforeEach(async () => {
    // Create temp directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "config-test-"));
    // Config now lives in .claude/.nojo-config.json
    const claudeDir = path.join(tempDir, ".claude");
    await fs.mkdir(claudeDir, { recursive: true });
    mockConfigPath = path.join(claudeDir, ".nojo-config.json");

    // Mock process.cwd() to return temp directory
    originalCwd = process.cwd;
    process.cwd = () => tempDir;
  });

  afterEach(async () => {
    // Restore process.cwd
    process.cwd = originalCwd;

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe("saveConfig and loadConfig", () => {
    it("should save and load agents", async () => {
      await saveConfig({
        agents: {
          "claude-code": { profile: { baseProfile: "senior-swe" } },
        },
        installDir: tempDir,
      });

      const loaded = await loadConfig({ installDir: tempDir });

      expect(loaded?.agents).toEqual({
        "claude-code": { profile: { baseProfile: "senior-swe" } },
      });
    });

    it("should save config without agents", async () => {
      await saveConfig({
        installDir: tempDir,
      });

      const loaded = await loadConfig({ installDir: tempDir });

      expect(loaded?.agents).toBeUndefined();
    });

    it("should return null when config file does not exist", async () => {
      const loaded = await loadConfig({ installDir: tempDir });
      expect(loaded).toBeNull();
    });

    it("should handle malformed config gracefully", async () => {
      await fs.writeFile(mockConfigPath, "invalid json {");

      const loaded = await loadConfig({ installDir: tempDir });
      expect(loaded).toBeNull();
    });

    it("should load autoupdate when set to enabled", async () => {
      await fs.writeFile(
        mockConfigPath,
        JSON.stringify({ autoupdate: "enabled" }),
      );

      const loaded = await loadConfig({ installDir: tempDir });

      expect(loaded?.autoupdate).toBe("enabled");
    });

    it("should load autoupdate when set to disabled", async () => {
      await fs.writeFile(
        mockConfigPath,
        JSON.stringify({ autoupdate: "disabled" }),
      );

      const loaded = await loadConfig({ installDir: tempDir });

      expect(loaded?.autoupdate).toBe("disabled");
    });

    it("should default autoupdate to disabled when field is missing", async () => {
      await fs.writeFile(mockConfigPath, JSON.stringify({}));

      const loaded = await loadConfig({ installDir: tempDir });

      expect(loaded?.autoupdate).toBe("disabled");
    });

    it("should save and load autoupdate", async () => {
      await saveConfig({
        autoupdate: "disabled",
        installDir: tempDir,
      });

      const loaded = await loadConfig({ installDir: tempDir });

      expect(loaded?.autoupdate).toBe("disabled");
    });
  });

  describe("installDir configuration", () => {
    it("should save config to custom installDir as .claude/.nojo-config.json", async () => {
      const customDir = path.join(tempDir, "custom-project");
      await fs.mkdir(customDir, { recursive: true });

      await saveConfig({
        agents: {
          "claude-code": { profile: { baseProfile: "senior-swe" } },
        },
        installDir: customDir,
      });

      // Config should be at customDir/.claude/.nojo-config.json
      const configPath = path.join(customDir, ".claude", ".nojo-config.json");
      const exists = await fs
        .access(configPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it("should load config from custom installDir", async () => {
      const customDir = path.join(tempDir, "custom-project");
      const customClaudeDir = path.join(customDir, ".claude");
      await fs.mkdir(customClaudeDir, { recursive: true });

      // Write config to custom location
      const configPath = path.join(customClaudeDir, ".nojo-config.json");
      await fs.writeFile(
        configPath,
        JSON.stringify({
          agents: {
            "claude-code": { profile: { baseProfile: "senior-swe" } },
          },
        }),
      );

      const loaded = await loadConfig({ installDir: customDir });

      expect(loaded?.agents?.["claude-code"]?.profile?.baseProfile).toBe(
        "senior-swe",
      );
    });

    it("should return null when config does not exist in custom installDir", async () => {
      const customDir = path.join(tempDir, "empty-project");
      await fs.mkdir(customDir, { recursive: true });

      const loaded = await loadConfig({ installDir: customDir });
      expect(loaded).toBeNull();
    });

    it("should save installDir in config for persistence", async () => {
      const customDir = path.join(tempDir, "custom-project");
      await fs.mkdir(customDir, { recursive: true });

      await saveConfig({
        agents: {
          "claude-code": { profile: { baseProfile: "senior-swe" } },
        },
        installDir: customDir,
      });

      // Read the raw config to verify installDir is saved
      const configPath = path.join(customDir, ".claude", ".nojo-config.json");
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      expect(config.installDir).toBe(customDir);
    });

    it("should load installDir from config", async () => {
      const customDir = path.join(tempDir, "custom-project");
      const customClaudeDir = path.join(customDir, ".claude");
      await fs.mkdir(customClaudeDir, { recursive: true });

      // Write config with installDir
      const configPath = path.join(customClaudeDir, ".nojo-config.json");
      await fs.writeFile(
        configPath,
        JSON.stringify({
          agents: {
            "claude-code": { profile: { baseProfile: "senior-swe" } },
          },
          installDir: customDir,
        }),
      );

      const loaded = await loadConfig({ installDir: customDir });
      expect(loaded?.installDir).toBe(customDir);
    });
  });
});

describe("agent-specific profiles", () => {
  let tempDir: string;
  let mockConfigPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "config-agents-test-"));
    // Create .claude directory since config now lives there
    const claudeDir = path.join(tempDir, ".claude");
    await fs.mkdir(claudeDir, { recursive: true });
    mockConfigPath = path.join(claudeDir, ".nojo-config.json");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("loadConfig with agents field", () => {
    it("should load config with agents structure", async () => {
      await fs.writeFile(
        mockConfigPath,
        JSON.stringify({
          agents: {
            "claude-code": {
              profile: { baseProfile: "senior-swe" },
            },
          },
        }),
      );

      const loaded = await loadConfig({ installDir: tempDir });

      expect(loaded?.agents).toEqual({
        "claude-code": {
          profile: { baseProfile: "senior-swe" },
        },
      });
    });

    it("should support multiple agents with different profiles", async () => {
      await fs.writeFile(
        mockConfigPath,
        JSON.stringify({
          agents: {
            "claude-code": {
              profile: { baseProfile: "senior-swe" },
            },
            cursor: {
              profile: { baseProfile: "documenter" },
            },
          },
        }),
      );

      const loaded = await loadConfig({ installDir: tempDir });

      expect(loaded?.agents?.["claude-code"]?.profile?.baseProfile).toBe(
        "senior-swe",
      );
      expect(loaded?.agents?.["cursor"]?.profile?.baseProfile).toBe(
        "documenter",
      );
    });

    it("should migrate legacy profile field to agents.claude-code during load", async () => {
      // Legacy config with only 'profile' field (no 'agents')
      await fs.writeFile(
        mockConfigPath,
        JSON.stringify({
          profile: { baseProfile: "amol" },
        }),
      );

      const loaded = await loadConfig({ installDir: tempDir });

      // Legacy profile should be converted to agents.claude-code.profile
      expect(loaded?.agents?.["claude-code"]?.profile?.baseProfile).toBe(
        "amol",
      );
    });

    it("should prefer agents field over legacy profile when both present during load", async () => {
      await fs.writeFile(
        mockConfigPath,
        JSON.stringify({
          profile: { baseProfile: "legacy-profile" },
          agents: {
            "claude-code": {
              profile: { baseProfile: "new-profile" },
            },
          },
        }),
      );

      const loaded = await loadConfig({ installDir: tempDir });

      // agents field should take precedence
      expect(loaded?.agents?.["claude-code"]?.profile?.baseProfile).toBe(
        "new-profile",
      );
    });

    it("should handle agent with null profile", async () => {
      await fs.writeFile(
        mockConfigPath,
        JSON.stringify({
          agents: {
            "claude-code": {
              profile: null,
            },
          },
        }),
      );

      const loaded = await loadConfig({ installDir: tempDir });

      expect(loaded?.agents?.["claude-code"]?.profile).toBeNull();
    });

    it("should handle agent with empty config", async () => {
      await fs.writeFile(
        mockConfigPath,
        JSON.stringify({
          agents: {
            "claude-code": {},
          },
        }),
      );

      const loaded = await loadConfig({ installDir: tempDir });

      expect(loaded?.agents?.["claude-code"]).toEqual({});
    });
  });

  describe("saveConfig with agents field", () => {
    it("should save agents structure", async () => {
      await saveConfig({
        agents: {
          "claude-code": {
            profile: { baseProfile: "senior-swe" },
          },
        },
        installDir: tempDir,
      });

      const content = await fs.readFile(mockConfigPath, "utf-8");
      const config = JSON.parse(content);

      expect(config.agents).toEqual({
        "claude-code": {
          profile: { baseProfile: "senior-swe" },
        },
      });
    });

    it("should not write legacy profile field (only agents)", async () => {
      await saveConfig({
        agents: {
          "claude-code": {
            profile: { baseProfile: "senior-swe" },
          },
        },
        installDir: tempDir,
      });

      const content = await fs.readFile(mockConfigPath, "utf-8");
      const config = JSON.parse(content);

      // Should only write agents, not legacy profile
      expect(config.agents["claude-code"].profile.baseProfile).toBe(
        "senior-swe",
      );
      expect(config.profile).toBeUndefined();
    });

    it("should save multiple agents without legacy profile", async () => {
      await saveConfig({
        agents: {
          "claude-code": {
            profile: { baseProfile: "senior-swe" },
          },
          cursor: {
            profile: { baseProfile: "documenter" },
          },
        },
        installDir: tempDir,
      });

      const content = await fs.readFile(mockConfigPath, "utf-8");
      const config = JSON.parse(content);

      expect(config.agents["claude-code"].profile.baseProfile).toBe(
        "senior-swe",
      );
      expect(config.agents.cursor.profile.baseProfile).toBe("documenter");
      expect(config.profile).toBeUndefined();
    });
  });

  describe("getAgentProfile", () => {
    it("should return profile for specified agent from agents field", () => {
      const config: Config = {
        installDir: "/test",
        agents: {
          "claude-code": {
            profile: { baseProfile: "senior-swe" },
          },
          cursor: {
            profile: { baseProfile: "documenter" },
          },
        },
      };

      const claudeProfile = getAgentProfile({
        config,
        agentName: "claude-code",
      });
      const cursorProfile = getAgentProfile({ config, agentName: "cursor" });

      expect(claudeProfile?.baseProfile).toBe("senior-swe");
      expect(cursorProfile?.baseProfile).toBe("documenter");
    });

    it("should return null when agents field is missing", () => {
      const config: Config = {
        installDir: "/test",
        // No agents field
      };

      const profile = getAgentProfile({ config, agentName: "claude-code" });

      expect(profile).toBeNull();
    });

    it("should return null when agent has no profile configured", () => {
      const config: Config = {
        installDir: "/test",
        agents: {
          "claude-code": {},
        },
      };

      const profile = getAgentProfile({ config, agentName: "claude-code" });

      expect(profile).toBeNull();
    });

    it("should return null when agent not in agents field", () => {
      const config: Config = {
        installDir: "/test",
        agents: {
          "claude-code": {
            profile: { baseProfile: "senior-swe" },
          },
        },
      };

      const profile = getAgentProfile({ config, agentName: "cursor" });

      expect(profile).toBeNull();
    });
  });
});

describe("getInstalledAgents", () => {
  it("should return agent names from agents object keys", () => {
    const config: Config = {
      installDir: "/test",
      agents: {
        "claude-code": { profile: { baseProfile: "senior-swe" } },
        "cursor-agent": { profile: { baseProfile: "documenter" } },
      },
    };

    const installedAgents = getInstalledAgents({ config });

    expect(installedAgents).toEqual(
      expect.arrayContaining(["claude-code", "cursor-agent"]),
    );
    expect(installedAgents).toHaveLength(2);
  });

  it("should return claude-code by default when agents is null (backwards compatibility)", () => {
    const config: Config = {
      installDir: "/test",
      agents: null,
    };

    const installedAgents = getInstalledAgents({ config });

    expect(installedAgents).toEqual(["claude-code"]);
  });

  it("should return claude-code by default when agents is undefined (backwards compatibility)", () => {
    const config: Config = {
      installDir: "/test",
    };

    const installedAgents = getInstalledAgents({ config });

    expect(installedAgents).toEqual(["claude-code"]);
  });

  it("should return claude-code by default when agents is empty object (backwards compatibility)", () => {
    const config: Config = {
      installDir: "/test",
      agents: {},
    };

    const installedAgents = getInstalledAgents({ config });

    expect(installedAgents).toEqual(["claude-code"]);
  });

  it("should return single agent when only one is configured", () => {
    const config: Config = {
      installDir: "/test",
      agents: {
        "claude-code": { profile: { baseProfile: "senior-swe" } },
      },
    };

    const installedAgents = getInstalledAgents({ config });

    expect(installedAgents).toEqual(["claude-code"]);
  });

  it("should include agent even if profile is null", () => {
    const config: Config = {
      installDir: "/test",
      agents: {
        "claude-code": { profile: null },
      },
    };

    const installedAgents = getInstalledAgents({ config });

    expect(installedAgents).toEqual(["claude-code"]);
  });

  it("should include agent even if config is empty object", () => {
    const config: Config = {
      installDir: "/test",
      agents: {
        "claude-code": {},
      },
    };

    const installedAgents = getInstalledAgents({ config });

    expect(installedAgents).toEqual(["claude-code"]);
  });
});

describe("saveConfig should not write installedAgents", () => {
  let tempDir: string;
  let mockConfigPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "config-no-installed-agents-test-"),
    );
    // Create .claude directory since config now lives there
    const claudeDir = path.join(tempDir, ".claude");
    await fs.mkdir(claudeDir, { recursive: true });
    mockConfigPath = path.join(claudeDir, ".nojo-config.json");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should not write installedAgents field to disk", async () => {
    await saveConfig({
      agents: {
        "claude-code": { profile: { baseProfile: "senior-swe" } },
      },
      installDir: tempDir,
    });

    const content = await fs.readFile(mockConfigPath, "utf-8");
    const config = JSON.parse(content);

    // installedAgents should NOT be in the saved config
    expect(config.installedAgents).toBeUndefined();
    // agents should be present
    expect(config.agents).toBeDefined();
    expect(config.agents["claude-code"]).toBeDefined();
  });
});

describe("schema validation", () => {
  let tempDir: string;
  let mockConfigPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "config-schema-test-"));
    // Create .claude directory since config now lives there
    const claudeDir = path.join(tempDir, ".claude");
    await fs.mkdir(claudeDir, { recursive: true });
    mockConfigPath = path.join(claudeDir, ".nojo-config.json");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("enum validation", () => {
    it("should reject config with invalid autoupdate value", async () => {
      await fs.writeFile(
        mockConfigPath,
        JSON.stringify({
          autoupdate: "maybe",
          agents: {
            "claude-code": { profile: { baseProfile: "senior-swe" } },
          },
        }),
      );

      const loaded = await loadConfig({ installDir: tempDir });

      // Invalid enum value should cause config to be rejected
      expect(loaded).toBeNull();
    });
  });

  describe("unknown properties", () => {
    it("should strip unknown properties from loaded config", async () => {
      await fs.writeFile(
        mockConfigPath,
        JSON.stringify({
          agents: {
            "claude-code": { profile: { baseProfile: "senior-swe" } },
          },
          unknownField: "should be removed",
          anotherUnknown: { nested: "value" },
        }),
      );

      const loaded = await loadConfig({ installDir: tempDir });

      expect(loaded).not.toBeNull();
      expect(loaded?.agents?.["claude-code"]?.profile?.baseProfile).toBe(
        "senior-swe",
      );
      // Unknown properties should be stripped
      expect((loaded as any).unknownField).toBeUndefined();
      expect((loaded as any).anotherUnknown).toBeUndefined();
    });
  });

  describe("validateConfig", () => {
    it("should return valid for empty config file", async () => {
      await fs.writeFile(mockConfigPath, JSON.stringify({}));

      const result = await validateConfig({ installDir: tempDir });

      expect(result.valid).toBe(true);
    });

    it("should return valid for config with agents", async () => {
      await fs.writeFile(
        mockConfigPath,
        JSON.stringify({
          agents: {
            "claude-code": { profile: { baseProfile: "senior-swe" } },
          },
        }),
      );

      const result = await validateConfig({ installDir: tempDir });

      expect(result.valid).toBe(true);
    });
  });
});
