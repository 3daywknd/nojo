/**
 * Configuration management for nojo installer
 * Functional library for loading and managing disk-based configuration
 */

import * as fs from "fs/promises";
import * as path from "path";

import Ajv from "ajv";
import addFormats from "ajv-formats";

/**
 * Agent-specific configuration
 */
export type AgentConfig = {
  profile?: { baseProfile: string } | null;
};

/**
 * Unified configuration type for nojo
 * Contains all persisted fields from disk plus required installDir
 *
 * Note: Installed agents are derived from the keys of the `agents` object.
 * Use `getInstalledAgents({ config })` to get the list of installed agents.
 */
export type Config = {
  autoupdate?: "enabled" | "disabled" | null;
  installDir: string;
  /** Per-agent configuration settings. Keys indicate which agents are installed. */
  agents?: Record<string, AgentConfig> | null;
  /** Installed version */
  version?: string | null;
};

/**
 * Raw disk config type - represents the JSON structure on disk before transformation
 */
type RawDiskConfig = {
  autoupdate?: "enabled" | "disabled" | null;
  // Legacy profile field - kept for reading old configs (not written anymore)
  profile?: { baseProfile?: string | null } | null;
  installDir?: string | null;
  agents?: Record<string, AgentConfig> | null;
  version?: string | null;
};

/**
 * Get the path to the config file
 * @param args - Configuration arguments
 * @param args.installDir - Installation directory
 *
 * @returns The absolute path to .nojo-config.json
 */
export const getConfigPath = (args: { installDir: string }): string => {
  const { installDir } = args;
  return path.join(installDir, ".claude", ".nojo-config.json");
};

/**
 * Get the legacy config path (for migration)
 * @param args - Configuration arguments
 * @param args.installDir - Installation directory
 *
 * @returns The absolute path to legacy .nojo-config.json at root
 */
export const getLegacyConfigPath = (args: { installDir: string }): string => {
  const { installDir } = args;
  return path.join(installDir, ".nojo-config.json");
};

/**
 * Get default profile
 * @returns Default profile (senior-swe)
 */
export const getDefaultProfile = (): { baseProfile: string } => {
  return {
    baseProfile: "senior-swe",
  };
};
/**
 * Get list of installed agents from config
 * Derives installed agents from the keys of the agents object
 * Returns ['claude-code'] by default for backwards compatibility with older configs
 * @param args - Configuration arguments
 * @param args.config - The config to check
 *
 * @returns Array of installed agent names
 */
export const getInstalledAgents = (args: { config: Config }): Array<string> => {
  const { config } = args;
  const agents = Object.keys(config.agents ?? {});
  return agents.length > 0 ? agents : ["claude-code"];
};

/**
 * Get the profile for a specific agent
 * @param args - Configuration arguments
 * @param args.config - The config to search
 * @param args.agentName - The agent name to get profile for
 *
 * @returns The agent's profile or null if not found
 */
export const getAgentProfile = (args: {
  config: Config;
  agentName: string;
}): { baseProfile: string } | null => {
  const { config, agentName } = args;

  if (config.agents == null) {
    return null;
  }

  const agentConfig = config.agents[agentName];
  if (agentConfig?.profile != null) {
    return agentConfig.profile;
  }

  return null;
};

/**
 * Load existing configuration from disk
 * Uses JSON schema validation for strict type checking.
 * @param args - Configuration arguments
 * @param args.installDir - Installation directory
 *
 * @returns The config if valid, null otherwise
 */
export const loadConfig = async (args: {
  installDir: string;
}): Promise<Config | null> => {
  const { installDir } = args;
  const configPath = getConfigPath({ installDir });

  try {
    await fs.access(configPath);
    const content = await fs.readFile(configPath, "utf-8");
    const rawConfig = JSON.parse(content);

    if (rawConfig == null || typeof rawConfig !== "object") {
      return null;
    }

    // Deep clone to avoid mutating the original during validation
    const configClone = JSON.parse(JSON.stringify(rawConfig)) as Record<
      string,
      unknown
    >;

    // Validate with schema - this applies defaults and removes unknown properties
    const isValid = validateConfigSchema(configClone);
    if (!isValid) {
      // Schema validation failed (e.g., invalid enum values)
      return null;
    }

    // After validation, configClone conforms to RawDiskConfig
    const validated = configClone as unknown as RawDiskConfig;

    // Build the Config result from validated data
    const result: Config = {
      installDir: validated.installDir ?? installDir,
      autoupdate: validated.autoupdate,
      version: validated.version,
    };

    // Set agents if present, or convert legacy profile to agents.claude-code
    if (validated.agents != null) {
      result.agents = validated.agents;
    } else if (validated.profile?.baseProfile != null) {
      // Convert legacy profile to agents.claude-code for backwards compat
      result.agents = {
        "claude-code": {
          profile: { baseProfile: validated.profile.baseProfile },
        },
      };
    }

    // Return result if we have meaningful config data
    if (result.agents != null || result.autoupdate != null) {
      return result;
    }
  } catch {
    // File doesn't exist or is invalid JSON
  }

  return null;
};

/**
 * Save configuration to disk
 * @param args - Configuration arguments
 * @param args.autoupdate - Autoupdate setting (null to skip)
 * @param args.agents - Per-agent configuration settings (null to skip). Keys indicate installed agents.
 * @param args.version - Installed version (null to skip)
 * @param args.installDir - Installation directory
 */
export const saveConfig = async (args: {
  autoupdate?: "enabled" | "disabled" | null;
  agents?: Record<string, AgentConfig> | null;
  version?: string | null;
  installDir: string;
}): Promise<void> => {
  const { autoupdate, agents, version, installDir } = args;
  const configPath = getConfigPath({ installDir });

  const config: Record<string, unknown> = {};

  // Add agents if provided
  if (agents != null) {
    config.agents = agents;
  }

  // Add autoupdate if provided
  if (autoupdate != null) {
    config.autoupdate = autoupdate;
  }

  // Add version if provided
  if (version != null) {
    config.version = version;
  }

  // Always save installDir
  config.installDir = installDir;

  // Ensure parent directory exists (.claude/)
  await fs.mkdir(path.dirname(configPath), { recursive: true });

  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
};

/**
 * Validation result type
 */
export type ConfigValidationResult = {
  valid: boolean;
  message: string;
  errors?: Array<string> | null;
};

// JSON schema for nojo-config.json - single source of truth for validation
const configSchema = {
  type: "object",
  properties: {
    autoupdate: {
      type: "string",
      enum: ["enabled", "disabled"],
      default: "disabled",
    },
    // Legacy profile field - kept for reading old configs (not written anymore)
    profile: {
      type: ["object", "null"],
      properties: {
        baseProfile: { type: "string" },
      },
    },
    installDir: { type: "string" },
    agents: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          profile: {
            type: ["object", "null"],
            properties: {
              baseProfile: { type: "string" },
            },
          },
        },
      },
    },
    version: { type: "string" },
  },
  additionalProperties: false,
};

// Configured Ajv instance for schema validation
const ajv = new Ajv({
  allErrors: true,
  useDefaults: true,
  removeAdditional: true,
});
addFormats(ajv);

// Compiled validator for config schema
const validateConfigSchema = ajv.compile(configSchema);

/**
 * Validate configuration file
 * @param args - Configuration arguments
 * @param args.installDir - Installation directory
 *
 * @returns Validation result with details
 */
export const validateConfig = async (args: {
  installDir: string;
}): Promise<ConfigValidationResult> => {
  const { installDir } = args;
  const configPath = getConfigPath({ installDir });
  const errors: Array<string> = [];

  // Check if config file exists
  try {
    await fs.access(configPath);
  } catch {
    return {
      valid: false,
      message: "No nojo-config.json found",
      errors: [
        `Config file not found at ${configPath}`,
        'Run "nojo install" to create configuration',
      ],
    };
  }

  // Try to load config
  let content: string;
  try {
    content = await fs.readFile(configPath, "utf-8");
  } catch (err) {
    return {
      valid: false,
      message: "Unable to read nojo-config.json",
      errors: [`Failed to read config file: ${err}`],
    };
  }

  // Try to parse JSON
  let config: any;
  try {
    config = JSON.parse(content);
  } catch (err) {
    return {
      valid: false,
      message: "Invalid JSON in nojo-config.json",
      errors: [`Config file contains invalid JSON: ${err}`],
    };
  }

  // Check if credentials are present (schema validation will check types)
  const hasUsername = config.username != null;
  const hasPassword = config.password != null;
  const hasOrgUrl = config.organizationUrl != null;

  const credentialsProvided = [hasUsername, hasPassword, hasOrgUrl];
  const someProvided = credentialsProvided.some((v) => v);
  const allProvided = credentialsProvided.every((v) => v);

  // If some credentials are provided but not all, that's an error
  if (someProvided && !allProvided) {
    if (!hasUsername) {
      errors.push(
        'Missing "username" field (required when credentials are provided)',
      );
    }
    if (!hasPassword) {
      errors.push(
        'Missing "password" field (required when credentials are provided)',
      );
    }
    if (!hasOrgUrl) {
      errors.push(
        'Missing "organizationUrl" field (required when credentials are provided)',
      );
    }
    return {
      valid: false,
      message: "Partial credentials provided - all fields are required",
      errors,
    };
  }

  // If no credentials provided, it's free mode
  if (!someProvided) {
    return {
      valid: true,
      message: "Config is valid for free mode (no credentials provided)",
      errors: null,
    };
  }

  // All credentials provided - validate with JSON schema
  // Use shared validator with formats support (format: "uri" validates organizationUrl)
  const configClone = JSON.parse(JSON.stringify(config));
  const valid = validateConfigSchema(configClone);

  // If schema validation failed, collect errors
  if (!valid && validateConfigSchema.errors) {
    for (const error of validateConfigSchema.errors) {
      const path = error.instancePath || "(root)";
      const message = error.message || "unknown error";
      errors.push(`Config validation error at ${path}: ${message}`);
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      message: "Config has validation errors",
      errors,
    };
  }

  return {
    valid: true,
    message: "Config is valid",
    errors: null,
  };
};
