/**
 * Registry of intercepted slash commands
 */

import type { InterceptedSlashCommand } from "./types.js";

import { nojoInstallLocation } from "./nojo-install-location.js";
import { nojoPruneContext } from "./nojo-prune-context.js";
import { nojoSwitchProfile } from "./nojo-switch-profile.js";

export const interceptedSlashCommands: Array<InterceptedSlashCommand> = [
  nojoInstallLocation,
  nojoPruneContext,
  nojoSwitchProfile,
];
