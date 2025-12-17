# nojo

**A solo developer's profiles manager for Claude Code.**

nojo is a lightweight tool for building custom coding agent profiles that are encoded with your development patterns, design standards, and engineering workflows. It's designed for individual developers who want to precisely control how Claude Code behaves.

nojo lets you define consistent agent behavior for different tasks:
- Define consistent agent behavior for areas of development or task types
- Automate repeated steps of your workflow (git, testing, planning)
- Launch custom agents instantly without repeating setup or context

Under the hood, nojo wraps Claude Code with a config management system that automatically defines desired behavior through Claude.md, Skills, and Subagents.

## Installation

```bash
npm install -g cbxm/nojo
nojo install
```

Launch Claude Code from your terminal. nojo features activate automatically.

## Requirements

- Node.js 22 or higher
- Claude Code CLI installed


### Start by testing a profile

During installation, choose a sample profile to try out how nojo works.

Examples:

- **senior-swe**: High-confirmation co-pilot mode
- **product-manager**: Autonomous execution with technical guidance
- **documenter**: Documentation-focused workflows

Switch profiles anytime:

```bash
nojo switch-profile <profile-name>
```

Or use `/nojo/switch-profile` during a conversation.


### How to create your own profile

Define precise scopes of behavior for your development tasks. Your preferences for git automation, PRs creation, testing, and planning, optimized for context using all the best configuration options - agent.md, skills, subagents, and tools.

**Ask Claude Code to build it with you:**

Run

```
/nojo/create-profile
```

Claude will guide you through:
- Understanding your role and development style
- Identifying repeating instructions you give
- Choosing relevant mixins (engineering, product, documentation workflows)
- Writing your custom CLAUDE.md with your preferences
- Setting up the profile structure

**Building a profile explicitly**

1. Create the profile directory:
   ```bash
   mkdir -p ~/.claude/profiles/my-profile
   ```

2. Add a `CLAUDE.md` file with your custom instructions:
   ```markdown
   # My Custom Profile

   Add your workflow preferences here:
   - Testing requirements
   - Git automation rules
   - Code style guidelines
   - Any repeating instructions
   ```

3. Link to mixins (optional):
   ```bash
   # Link to the SWE mixin for engineering workflows
   ln -s ~/.claude/_mixins/_swe ~/.claude/profiles/my-profile/_swe
   ```

   Available mixins: `_swe` (engineering), `_docs` (documentation)

4. Activate your profile:
   ```bash
   nojo switch-profile my-profile
   ```

   Or use `/nojo/switch-profile` during a conversation.

**Profile structure:**

Profiles live in `~/.claude/profiles/` and contain:
- `CLAUDE.md`: Your custom instructions and workflow preferences
- Mixins: Linked configuration options
- Custom skills and slash commands (optional)

Each profile represents a distinct mode of work, letting you instantly tune the agent for different tasks.

## Features

- **Development workflow**: Setup verification → research → plan approval → TDD cycle → implementation → verification
- **32+ engineering skills**: Step-by-step instructions for TDD, debugging, code review, git workflows, architecture decisions
- **3 built-in profiles**: senior-swe, product-manager, documenter
- **Real-time status line**: Git branch, active profile, token usage, conversation cost
- **Slash commands**: Quick access to workflows (`/nojo/info`, `/nojo/debug`, `/nojo/switch-profile`)
- **Specialized subagents**: codebase-locator, codebase-analyzer, codebase-pattern-finder, web-search-researcher

## Commands

```bash
nojo              # Install (default)
nojo install      # Install (explicit)
nojo uninstall    # Uninstall all features
nojo help         # Show help message
nojo check        # Run configuration validation
```

## Special Thanks

- [Simon Willison](https://simonwillison.net/) for inspiration
- [Jesse Vincent](https://blog.fsck.com/) for valuable insight and the superpowers library, which forms the basis of nojo's skills
- The [humanlayer](https://github.com/humanlayer/humanlayer/tree/main) team for great writing on using agents and some subagent implementations
