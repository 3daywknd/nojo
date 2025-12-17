---
description: Validate nojo installation and configuration
allowed-tools: Bash(nojo:*)
---

!`nojo check`

This validates the nojo installation:

- Config file structure
- Hooks configuration in .claude/settings.json
- Subagent files in ~/.claude/agents/
- Slash command files in ~/.claude/commands/
- CLAUDE.md managed block

## Troubleshooting

If you encounter installation issues, check the log file:

```bash
cat $TMPDIR/nojo.log
```

This log contains detailed information about the installation process and any errors encountered.
