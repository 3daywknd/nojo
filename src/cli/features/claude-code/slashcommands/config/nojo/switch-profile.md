---
description: Switch between nojo configuration profiles (amol, senior-swe, product-manager, documenter, none)
---

Switch to a different nojo configuration profile.

This command is intercepted by a hook and executed directly without LLM processing.

**Usage:** `/nojo/switch-profile <profile-name>`

**Examples:**
- `/nojo/switch-profile senior-swe`
- `/nojo/switch-profile product-manager`
- `/nojo/switch-profile` (shows available profiles)

After switching, restart Claude Code to apply the new profile.
