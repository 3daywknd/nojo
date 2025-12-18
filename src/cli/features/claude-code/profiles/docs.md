# nojo-doc: Profiles

Path: @/src/cli/features/claude-code/profiles

### Overview

Profile system that provides complete, self-contained nojo configurations composed from modular mixins. Each profile is built by combining multiple mixins (_base, _docs, _swe) that contain skills/, subagents/, and slashcommands/ directories. Profiles are composed and copied to `~/.claude/profiles/` during installation and serve as the single source of truth for all feature loaders.

### How it fits into the larger codebase

The profiles loader executes FIRST in both interactive and non-interactive installation modes (see @/src/cli/commands/install/install.ts) to populate `~/.claude/profiles/` before any other loaders run. In interactive mode, @/src/cli/commands/install/install.ts prompts for profile selection by reading directories from @/src/cli/features/claude-code/profiles/config/, then saves the selection to `.nojo-config.json` via @/src/cli/config.ts. All subsequent feature loaders (@/src/cli/features/claude-code/profiles/claudemd/loader.ts, @/src/cli/features/claude-code/profiles/skills/loader.ts, @/src/cli/features/claude-code/profiles/subagents/loader.ts, @/src/cli/features/claude-code/profiles/slashcommands/loader.ts) read from `~/.claude/profiles/{selectedProfile}/` to install their components. Profile switching is handled by @/src/cli/commands/switch-profile/profiles.ts which updates `.nojo-config.json`, then re-runs installation. The statusline (@/src/cli/features/claude-code/statusline) displays the active profile name. The `/nojo/switch-profile` slash command enables in-conversation profile switching.

### Core Implementation

**Profile Structure**: Each profile directory contains `CLAUDE.md` (behavioral instructions) and `profile.json` (metadata with mixins configuration and optional builtin field). Profile content is composed from mixins defined in `_mixins/` directory: `_base` (essential skills/commands), `_docs` (documentation workflows), and `_swe` (software engineering skills). Markdown files in profiles use template placeholders like `{{skills_dir}}`, `{{profiles_dir}}`, `{{commands_dir}}`, and `{{install_dir}}` which are substituted with actual paths during installation.

**Built-in Profile Metadata**: All built-in profiles include `"builtin": true` in their profile.json files. This field is used by the uninstall process to distinguish built-in profiles from custom user profiles. During uninstall, only profiles with `"builtin": true` are removed.

**Built-in Profiles**: Multiple profiles ship with the package at @/src/cli/features/claude-code/profiles/config/, including `senior-swe`, `amol`, `product-manager`, `documenter`, and `none`. The default profile fallback `senior-swe` is only used in interactive mode when an existing config has no profile field.

**Installation Flow**: The `installProfiles()` function reads profile directories from config/, loads profile.json metadata, then composes the profile by merging content from all mixins in alphabetical order. Mixins are located in `config/_mixins/` with names like `_base`, `_docs`, `_swe`. Directories are merged (union of contents) while files use last-writer-wins. Profile-specific content (CLAUDE.md) is overlaid last.

**Profile Lookup in Loaders**: All feature loaders use `getAgentProfile({ config, agentName: "claude-code" })` from @/src/cli/config.ts to determine the active profile name.

### Things to Know

**~/.claude/profiles/ is the single source of truth**: All feature loaders read from `~/.claude/profiles/` instead of the npx package location. This enables users to create custom profiles or modify built-in ones.

**Missing profile directories are valid**: Feature loaders treat missing profile directories as valid with zero items. This allows minimal profiles (like "none") to omit any directory they do not need.

**Custom profile preservation**: Built-in profiles are identified by the `"builtin": true` field in their profile.json files. During uninstall, the loader only removes profiles with `"builtin": true`, preserving any custom user profiles.

**Skill installation testing**: Tests verify that skills from all mixins are correctly installed. Each new skill in a mixin should have corresponding tests verifying: (1) the skill exists after installation, (2) frontmatter is properly formatted, and (3) the skill is installed in the expected location.

**CLAUDE.md as validation marker**: A directory is only a valid profile if it contains CLAUDE.md.

**Template placeholders in profile files**: Source markdown files use placeholders like `{{skills_dir}}` instead of hardcoded paths. Placeholders are replaced during installation.

**Hook-intercepted slash commands**: Several global slash commands are intercepted by the slash-command-intercept hook and executed directly without LLM processing.

**Global vs profile slash commands**: Slash commands are split between two loaders:
- **Global commands** (@/src/cli/features/claude-code/slashcommands/): Profile-agnostic utilities installed regardless of profile selection.
- **Profile commands** (@/src/cli/features/claude-code/profiles/slashcommands/): Commands from profile mixins that vary by profile.

**Mixin Composition**: Profiles specify mixins in profile.json as `{"mixins": {"base": {}, "docs": {}, "swe": {}}}`. The loader processes mixins in alphabetical order for deterministic precedence.

**Mixin Categories**: Available mixins in `config/_mixins/`:
- `_base`: Core infrastructure (using-skills, creating-skills skills, web-search-researcher subagent)
- `_docs`: Documentation workflows (updating-nojodocs skill, nojo-initial-documenter/nojo-change-documenter subagents, nojo-init-docs command)
- `_swe`: Software engineering (skills like TDD/debugging/git-worktrees/building-ui-ux, codebase-analysis subagents)

**Paid-prefixed skills are skipped**: The skills loader unconditionally skips any skill directory with a `paid-` prefix. Any remaining `paid-` prefixed directories in mixins are ignored during installation.

## Usage

```bash
npx nojo@latest switch-profile senior-swe
npx nojo@latest switch-profile amol
npx nojo@latest switch-profile my-custom-profile
```

### Via Slash Command

Use `/nojo/switch-profile` in Claude Code to list and switch profiles.

## Install Flow

1. **Profiles loader runs FIRST** (before profile selection)
   - Reads profile.json from each profile to get mixins configuration
   - Composes profile by copying content from mixins in alphabetical order
   - Overlays profile-specific content (CLAUDE.md, profile.json)
   - Copies composed profiles to `~/.claude/profiles/`

2. **User selects profile** - Reads available profiles from `~/.claude/profiles/`

3. **Feature loaders run** - Install CLAUDE.md, skills, slashcommands, subagents from the selected profile

## Validation

The `validate()` function checks:
- `~/.claude/profiles/` directory exists
- Required built-in profiles (`senior-swe`, `amol`, `product-manager`, `documenter`, `none`) are present

## Uninstallation

During `npx nojo@latest uninstall`, only built-in profiles are removed. Custom user profiles are preserved.
