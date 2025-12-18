#!/bin/bash

# nojo Status Line
# Format: 📁 dir 🌿 branch 👤 profile 💭 model [context bar] %

# Read input JSON from stdin
input=$(cat)

# === CHECK FOR JQ DEPENDENCY ===
if ! command -v jq >/dev/null 2>&1; then
    echo -e "\033[33m⚠️  nojo statusline requires jq. Install: brew install jq (macOS) or apt install jq (Linux)\033[0m"
    exit 0
fi

# === FIND INSTALL DIRECTORY (for profile detection) ===
find_install_dir() {
    local current_dir="$1"
    local max_depth=50
    local depth=0

    while [ "$depth" -lt "$max_depth" ]; do
        if [ -f "$current_dir/.nojo-config.json" ]; then
            echo "$current_dir"
            return 0
        fi
        if [ -f "$current_dir/.nori-config.json" ]; then
            echo "$current_dir"
            return 0
        fi

        local parent_dir="$(dirname "$current_dir")"
        if [ "$parent_dir" = "$current_dir" ]; then
            break
        fi

        current_dir="$parent_dir"
        depth=$((depth + 1))
    done

    return 1
}

# Extract values from JSON
dir=$(echo "$input" | jq -r '.workspace.current_dir')
model=$(echo "$input" | jq -r '.model.display_name')
usage=$(echo "$input" | jq '.context_window.current_usage')

# === PROFILE DETECTION ===
profile=""
config_file=""

# First, try to find config by searching upward from workspace
if [ -n "$dir" ] && [ -d "$dir" ]; then
    install_dir=$(find_install_dir "$dir")
    if [ -n "$install_dir" ]; then
        config_file="$install_dir/.nojo-config.json"
    fi
fi

# Fallback: check ~/.claude/.nojo-config.json
if [ -z "$config_file" ] || [ ! -f "$config_file" ]; then
    config_file="$HOME/.claude/.nojo-config.json"
fi

# Read profile from config
if [ -f "$config_file" ]; then
    profile=$(jq -r '.agents["claude-code"].profile.baseProfile // .profile.baseProfile // ""' "$config_file" 2>/dev/null)
fi

# === CONTEXT BAR ===
ctx_info=""
if [ "$usage" != "null" ]; then
    current=$(echo "$input" | jq '.context_window.current_usage | .input_tokens + .cache_creation_input_tokens + .cache_read_input_tokens')
    size=$(echo "$input" | jq '.context_window.context_window_size')
    pct=$((current * 100 / size))

    # Build dynamic loading bar (20 segments)
    segments=20
    filled=$((pct * segments / 100))

    # Thresholds: 0-40% = green, 40-65% = yellow, 65-100% = red
    green_max=8    # 40% of 20
    yellow_max=13  # 65% of 20

    green_filled=$((filled <= green_max ? filled : green_max))
    yellow_filled=$((filled > green_max ? (filled <= yellow_max ? filled - green_max : yellow_max - green_max) : 0))
    red_filled=$((filled > yellow_max ? filled - yellow_max : 0))
    empty=$((segments - filled))

    bar="["
    for ((i=0; i<green_filled; i++)); do
        bar="${bar}\e[32m█\e[0m"
    done
    for ((i=0; i<yellow_filled; i++)); do
        bar="${bar}\e[33m█\e[0m"
    done
    for ((i=0; i<red_filled; i++)); do
        bar="${bar}\e[31m█\e[0m"
    done
    for ((i=0; i<empty; i++)); do
        bar="${bar}\e[90m░\e[0m"
    done
    bar="${bar}]"

    ctx_info=$(printf ' %b \e[37m%d%%\e[0m' "$bar" "$pct")
fi

# === GIT BRANCH ===
git_info=""
if [ -n "$dir" ] && [ -d "$dir" ]; then
    branch=$(cd "$dir" 2>/dev/null && git --no-optional-locks branch --show-current 2>/dev/null)
    if [ -n "$branch" ]; then
        git_info=$(printf ' 🌿 \e[35m%s\e[0m' "$branch")
    fi
fi

# === PROFILE INFO ===
profile_info=""
if [ -n "$profile" ]; then
    profile_info=$(printf ' 👤 \e[33m%s\e[0m' "$profile")
fi

# === BUILD AND PRINT STATUS LINE ===
printf '📁 \e[36m%s\e[0m%s%s 💭 \e[34m%s\e[0m%s' \
    "$(basename "$dir")" \
    "$git_info" \
    "$profile_info" \
    "$model" \
    "$ctx_info"
