/**
 * Config file loader
 * Manages the .nojo-config.json file lifecycle
 */

import { unlinkSync, existsSync } from "fs";

import {
  getConfigPath,
  getLegacyConfigPath,
  loadConfig,
  saveConfig,
  getInstalledAgents,
} from "@/cli/config.js";
import { success, info } from "@/cli/logger.js";
import { getCurrentPackageVersion } from "@/cli/version.js";

import type { Config, AgentConfig } from "@/cli/config.js";
import type { Loader } from "@/cli/features/agentRegistry.js";

/**
 * Migrate config from legacy location to new .claude/ location
 * @param args - Migration arguments
 * @param args.installDir - Installation directory
 *
 * @returns The migrated config if found, null otherwise
 */
const migrateFromLegacyLocation = async (args: {
  installDir: string;
}): Promise<Config | null> => {
  const { installDir } = args;
  const legacyConfigPath = getLegacyConfigPath({ installDir });

  // Check if legacy config exists
  if (!existsSync(legacyConfigPath)) {
    return null;
  }

  // Load config from legacy location by temporarily overriding the path
  // We need to read the raw file since loadConfig uses the new path
  const fs = await import("fs/promises");
  try {
    const content = await fs.readFile(legacyConfigPath, "utf-8");
    const rawConfig = JSON.parse(content);

    // Build a Config object from the raw data
    const migratedConfig: Config = {
      installDir,
      autoupdate: rawConfig.autoupdate,
      agents: rawConfig.agents,
      version: rawConfig.version,
    };

    // Delete the legacy file
    unlinkSync(legacyConfigPath);
    info({ message: `✓ Migrated config from legacy location` });

    return migratedConfig;
  } catch {
    // Failed to read or parse - ignore
    return null;
  }
};

/**
 * Install config file - save config to disk
 * @param args - Configuration arguments
 * @param args.config - Runtime configuration
 */
const installConfig = async (args: { config: Config }): Promise<void> => {
  const { config } = args;

  // First, check for and migrate legacy config
  const migratedConfig = await migrateFromLegacyLocation({
    installDir: config.installDir,
  });

  // Load existing config to preserve user preferences (from new location)
  const existingConfig =
    migratedConfig ??
    (await loadConfig({
      installDir: config.installDir,
    }));

  // Merge agents from existing config and new config
  const mergedAgents: Record<string, AgentConfig> = {
    ...(existingConfig?.agents ?? {}),
    ...(config.agents ?? {}),
  };

  // Get current package version to save in config
  const currentVersion = getCurrentPackageVersion();

  // Save config to disk
  await saveConfig({
    agents: Object.keys(mergedAgents).length > 0 ? mergedAgents : null,
    autoupdate: existingConfig?.autoupdate,
    version: currentVersion,
    installDir: config.installDir,
  });

  const configPath = getConfigPath({ installDir: config.installDir });
  success({ message: `✓ Config file created: ${configPath}` });
  if (currentVersion != null) {
    success({ message: `✓ Version ${currentVersion} saved to config` });
  }
};

/**
 * Uninstall config file - remove agent from agents object or delete file
 * @param args - Configuration arguments
 * @param args.config - Runtime configuration (agents contains agents being uninstalled)
 */
const uninstallConfig = async (args: { config: Config }): Promise<void> => {
  const { config } = args;
  const configFile = getConfigPath({ installDir: config.installDir });
  const legacyConfigFile = getLegacyConfigPath({
    installDir: config.installDir,
  });

  // Clean up legacy config file if it exists
  if (existsSync(legacyConfigFile)) {
    unlinkSync(legacyConfigFile);
    info({ message: `✓ Removed legacy config file: ${legacyConfigFile}` });
  }

  if (!existsSync(configFile)) {
    info({ message: "Config file not found (may not exist)" });
    return;
  }

  // Load existing config to check agents
  const existingConfig = await loadConfig({
    installDir: config.installDir,
  });

  // Get installed agents from the agents object
  const installedAgents = existingConfig
    ? getInstalledAgents({ config: existingConfig })
    : [];

  // If no agents in existing config, delete the entire file
  if (installedAgents.length === 0) {
    unlinkSync(configFile);
    success({ message: `✓ Config file removed: ${configFile}` });
    return;
  }

  // Determine which agents are being uninstalled
  const agentsToRemove = config.agents ? Object.keys(config.agents) : [];

  // Create new agents object without the agents being uninstalled
  const remainingAgentsObj: Record<string, AgentConfig> = {};
  for (const agentName of installedAgents) {
    if (!agentsToRemove.includes(agentName) && existingConfig?.agents) {
      remainingAgentsObj[agentName] = existingConfig.agents[agentName];
    }
  }

  const remainingAgentNames = Object.keys(remainingAgentsObj);

  // If no agents remain, delete the config file
  if (remainingAgentNames.length === 0) {
    unlinkSync(configFile);
    success({ message: `✓ Config file removed: ${configFile}` });
    return;
  }

  // Otherwise, update the config with remaining agents (preserve version)
  await saveConfig({
    autoupdate: existingConfig?.autoupdate ?? null,
    agents: remainingAgentsObj,
    version: existingConfig?.version ?? null,
    installDir: config.installDir,
  });

  success({
    message: `✓ Agent removed from config. Remaining agents: ${remainingAgentNames.join(", ")}`,
  });
};

/**
 * Config loader
 */
export const configLoader: Loader = {
  name: "config",
  description: "Configuration file (.nojo-config.json)",
  run: installConfig,
  uninstall: uninstallConfig,
};
