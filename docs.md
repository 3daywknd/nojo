# nojo - Solo Profiles Manager

Path: @/

### Overview

Claude Code plugin package providing profile management through a directory-based profile system. Each profile is a complete, self-contained configuration with its own CLAUDE.md instructions, skills, subagents, and slash commands. The nojo CLI manages profile installation and switching.

### How it fits into the larger codebase

This package is a complete Claude Code plugin that installs multiple components to enhance Claude's capabilities. The nojo installer CLI (defined in @/package.json bin) prompts users to select a profile, then installs that profile's complete configuration to ~/.claude/. Profiles are stored in @/src/cli/features/claude-code/profiles/config/ as directory structures containing CLAUDE.md, skills/, subagents/, and slashcommands/ subdirectories. The `features/` directory is organized by agent type (currently `claude-code/`). Built-in profiles include senior-swe (default), amol, product-manager, documenter, and none. The installer copies the selected profile directory to ~/.claude/profiles/ (making it the source of truth for future installs), then feature loaders read from ~/.claude/profiles/ to install skills to ~/.claude/skills/, subagents to ~/.claude/agents/, slash commands to ~/.claude/commands/nojo/, and generate CLAUDE.md by combining the profile's base instructions with a dynamically-generated skills list.

### Core Implementation

The src directory contains the installer CLI and feature loaders. The package.json defines the nojo bin executable that runs the installer. The build process (scripts/build.sh) compiles TypeScript, copies profile directories (CRITICAL: must mkdir -p and cp config directories or installer fails with ENOENT), sets permissions, and injects version strings. The installer flow: (1) display banner, (2) run profiles loader to copy all profile directories to ~/.claude/profiles/, (3) prompt for profile selection (reads from ~/.claude/profiles/), (4) save config with selected profile name to .nojo-config.json, (5) run remaining feature loaders which all read from ~/.claude/profiles/{selectedProfile}/. The profiles loader (runs first before profile selection) copies all built-in profile directories from @/src/cli/features/claude-code/profiles/config/ to ~/.claude/profiles/, making ~/.claude/profiles/ the single source of truth. The claudemd loader reads the selected profile's CLAUDE.md, generates a skills list by globbing the profile's skills/ directory for SKILL.md files, extracts frontmatter metadata (name, description) from each skill, and embeds the complete skills list in the managed block. The skills, subagents, and slashcommands loaders copy files from ~/.claude/profiles/{profileName}/{skills|subagents|slashcommands}/ to their respective ~/.claude/ installation directories. The statusline loader installs a bash script that displays git branch, profile name (from .nojo-config.json), token usage, cost, and nojo branding.

Testing infrastructure includes unit tests (Vitest-based, run via `npm test`).

### Things to Know

The package is published to npm as nojo and installed globally. The directory-based profile system uses complete, self-contained configurations that can be copied and modified by users. The installer is idempotent - re-running it updates built-in profiles but preserves custom user profiles. Profile switching via `nojo switch-profile` or `/nojo/switch-profile` slash command updates the selected profile, then re-runs installation non-interactively. The profile architecture makes ~/.claude/profiles/ the source of truth - all feature loaders read from there instead of the npx package location, enabling users to create and modify custom profiles. Skills are discovered at installation time via glob pattern \*\*/SKILL.md, so adding new skills to a profile requires re-running installation to regenerate the CLAUDE.md skills list. The statusline displays the active profile name alongside git branch, cost, and token metrics. Changes to CLAUDE.md take effect in new conversations without requiring a Claude Code restart, but profile switching triggers a restart to fully reload the configuration.
