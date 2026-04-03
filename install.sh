#!/usr/bin/env bash
# =============================================================================
# Odin (Tesla V4) — Production Installer
# One-command install: curl -fsSL <repo-url>/install.sh | bash
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
INSTALLER_VERSION="4.3.0"
DEFAULT_INSTALL_DIR="${HOME}/odin-core"
DEFAULT_WORKSPACE_DIR="${HOME}/.openclaw-odin"
REPO_URL="${ODIN_REPO_URL:-}"          # override via env for CI
OPENCLAW_MIN_VERSION="2026.3.0"
NODE_MIN_MAJOR=22
NODE_MIN_MINOR=12
LOG_FILE="/tmp/odin-install-$(date +%Y%m%d-%H%M%S).log"

# ANSI colours
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

# Functional agent IDs — NEVER change these
AGENT_IDS=("odin" "loki")
declare -A AGENT_DEFAULT_NAMES=(["odin"]="Odin" ["loki"]="Loki")

# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------
log()      { echo -e "${DIM}[$(date +%H:%M:%S)]${RESET} $*" | tee -a "$LOG_FILE"; }
info()     { echo -e "${CYAN}${BOLD}▸${RESET} $*" | tee -a "$LOG_FILE"; }
success()  { echo -e "${GREEN}${BOLD}✔${RESET} $*" | tee -a "$LOG_FILE"; }
warn()     { echo -e "${YELLOW}${BOLD}⚠${RESET}  $*" | tee -a "$LOG_FILE"; }
error()    { echo -e "${RED}${BOLD}✖${RESET} $*" | tee -a "$LOG_FILE" >&2; }
fatal()    { error "$*"; echo -e "${RED}Install log: ${LOG_FILE}${RESET}"; exit 1; }
section()  { echo -e "\n${BOLD}${CYAN}══════════════════════════════════════${RESET}"; \
             echo -e "${BOLD}${CYAN}  $*${RESET}"; \
             echo -e "${BOLD}${CYAN}══════════════════════════════════════${RESET}\n"; }
hr()       { echo -e "${DIM}──────────────────────────────────────${RESET}"; }

# ---------------------------------------------------------------------------
# Utility: ask with default
# ---------------------------------------------------------------------------
ask() {
    local prompt="$1" default="${2:-}" var_name="$3"
    local full_prompt
    if [[ -n "$default" ]]; then
        full_prompt="${BOLD}${prompt}${RESET} ${DIM}[${default}]${RESET}: "
    else
        full_prompt="${BOLD}${prompt}${RESET}: "
    fi
    while true; do
        printf "%b" "$full_prompt"
        IFS= read -r input < /dev/tty
        input="${input:-$default}"
        if [[ -n "$input" ]]; then
            printf -v "$var_name" '%s' "$input"
            return 0
        fi
        warn "Value required."
    done
}

ask_secret() {
    local prompt="$1" var_name="$2"
    printf "%b" "${BOLD}${prompt}${RESET}: "
    IFS= read -rs input < /dev/tty
    echo
    if [[ -z "$input" ]]; then fatal "Secret value required — cannot be empty."; fi
    printf -v "$var_name" '%s' "$input"
}

ask_yn() {
    local prompt="$1" default="${2:-y}"
    local full_prompt="${BOLD}${prompt}${RESET} ${DIM}[$(echo "$default" | tr '[:lower:]' '[:upper:]')/$([ "$default" = "y" ] && echo "n" || echo "Y")]${RESET}: "
    printf "%b" "$full_prompt"
    IFS= read -r ans < /dev/tty
    ans="${ans:-$default}"
    [[ "${ans,,}" =~ ^y(es)?$ ]]
}

ask_choice() {
    # ask_choice "prompt" result_var option1 option2 ...
    local prompt="$1" var_name="$2"; shift 2
    local options=("$@")
    echo -e "${BOLD}${prompt}${RESET}"
    local i=1
    for opt in "${options[@]}"; do
        echo -e "  ${CYAN}${i})${RESET} ${opt}"
        ((i++))
    done
    while true; do
        printf "%b" "${BOLD}Choice [1-${#options[@]}]${RESET}: "
        IFS= read -r choice < /dev/tty
        if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#options[@]} )); then
            printf -v "$var_name" '%s' "${options[$((choice-1))]}"
            return 0
        fi
        warn "Enter a number between 1 and ${#options[@]}."
    done
}

# ---------------------------------------------------------------------------
# Utility: version comparison
# ---------------------------------------------------------------------------
version_ge() {
    # Returns 0 if $1 >= $2
    printf '%s\n%s\n' "$2" "$1" | sort -V -C
}

# ---------------------------------------------------------------------------
# Utility: require a command
# ---------------------------------------------------------------------------
require_cmd() {
    command -v "$1" &>/dev/null || fatal "Required command not found: ${1}. Please install it and re-run."
}

# ---------------------------------------------------------------------------
# Utility: safe JSON string escape (no jq dependency)
# ---------------------------------------------------------------------------
json_escape() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\n'/\\n}"
    s="${s//$'\r'/\\r}"
    s="${s//$'\t'/\\t}"
    echo "$s"
}

# ---------------------------------------------------------------------------
# Trap for unclean exit
# ---------------------------------------------------------------------------
_on_error() {
    local exit_code=$? line="$1"
    error "Script failed at line ${line} (exit ${exit_code})."
    echo -e "${YELLOW}Full install log:${RESET} ${LOG_FILE}"
    exit "$exit_code"
}
trap '_on_error $LINENO' ERR

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
print_banner() {
    echo -e "${BOLD}${CYAN}"
    cat <<'EOF'
  ██████╗ ██████╗ ██╗███╗   ██╗    ████████╗███████╗███████╗██╗      █████╗      ██╗   ██╗ ██╗
 ██╔═══██╗██╔══██╗██║████╗  ██║    ╚══██╔══╝██╔════╝██╔════╝██║     ██╔══██╗     ██║   ██║███║
 ██║   ██║██║  ██║██║██╔██╗ ██║       ██║   █████╗  ███████╗██║     ███████║     ██║   ██║╚██║
 ██║   ██║██║  ██║██║██║╚██╗██║       ██║   ██╔══╝  ╚════██║██║     ██╔══██║     ╚██╗ ██╔╝ ██║
 ╚██████╔╝██████╔╝██║██║ ╚████║       ██║   ███████╗███████║███████╗██║  ██║      ╚████╔╝  ██║
  ╚═════╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝       ╚═╝   ╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝       ╚═══╝   ╚═╝
EOF
    echo -e "${RESET}"
    echo -e "  ${BOLD}Tesla V4 Installer${RESET} ${DIM}v${INSTALLER_VERSION}${RESET}"
    echo -e "  ${DIM}Log: ${LOG_FILE}${RESET}\n"
}

# =============================================================================
# PRE-STEP — Ensure Node.js 22.12+ is available (auto-install via NodeSource)
# =============================================================================
ensure_node() {
    section "Pre-Step — Node.js 22.12+ Check"

    local need_install=0

    if command -v node &>/dev/null; then
        local ver major minor
        ver=$(node --version | tr -d 'v')
        major="${ver%%.*}"
        minor="${ver#*.}"; minor="${minor%%.*}"
        if (( major > NODE_MIN_MAJOR )) || { (( major == NODE_MIN_MAJOR )) && (( minor >= NODE_MIN_MINOR )); }; then
            success "Node.js ${ver} satisfies requirement (>= ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR})"
            return 0
        else
            warn "Node.js ${ver} is below ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR} — will upgrade."
            need_install=1
        fi
    else
        warn "Node.js not found — will install."
        need_install=1
    fi

    if (( need_install )); then
        if [[ "$(uname -s)" == "Linux" ]]; then
            info "Installing Node.js ${NODE_MIN_MAJOR}.x via NodeSource…"
            if command -v curl &>/dev/null; then
                curl -fsSL "https://deb.nodesource.com/setup_${NODE_MIN_MAJOR}.x" | bash - 2>&1 | tee -a "$LOG_FILE" \
                    || fatal "NodeSource setup script failed."
            elif command -v wget &>/dev/null; then
                wget -qO- "https://deb.nodesource.com/setup_${NODE_MIN_MAJOR}.x" | bash - 2>&1 | tee -a "$LOG_FILE" \
                    || fatal "NodeSource setup script failed."
            else
                fatal "Neither curl nor wget found — cannot auto-install Node.js. Install manually: https://nodejs.org"
            fi

            if command -v apt-get &>/dev/null; then
                apt-get install -y nodejs 2>&1 | tee -a "$LOG_FILE" || fatal "apt-get install nodejs failed."
            elif command -v yum &>/dev/null; then
                yum install -y nodejs 2>&1 | tee -a "$LOG_FILE" || fatal "yum install nodejs failed."
            else
                fatal "No supported package manager (apt/yum) found. Install Node.js manually."
            fi
        else
            fatal "Node.js ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR}+ required. Install from https://nodejs.org and re-run."
        fi

        # Verify post-install
        local ver_after major_after minor_after
        ver_after=$(node --version 2>/dev/null | tr -d 'v') || fatal "Node.js still not available after install attempt."
        major_after="${ver_after%%.*}"
        minor_after="${ver_after#*.}"; minor_after="${minor_after%%.*}"
        if (( major_after > NODE_MIN_MAJOR )) || { (( major_after == NODE_MIN_MAJOR )) && (( minor_after >= NODE_MIN_MINOR )); }; then
            success "Node.js ${ver_after} installed successfully."
        else
            fatal "Node.js ${ver_after} still below required ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR} after install."
        fi
    fi
}

# =============================================================================
# PRE-STEP — Ensure npm is available
# =============================================================================
ensure_npm() {
    if command -v npm &>/dev/null; then
        success "npm $(npm --version) available"
        return 0
    fi

    warn "npm not found — attempting to install…"
    if [[ "$(uname -s)" == "Linux" ]]; then
        if command -v apt-get &>/dev/null; then
            apt-get install -y npm 2>&1 | tee -a "$LOG_FILE" || fatal "Failed to install npm via apt-get."
        elif command -v yum &>/dev/null; then
            yum install -y npm 2>&1 | tee -a "$LOG_FILE" || fatal "Failed to install npm via yum."
        else
            fatal "Cannot auto-install npm — no supported package manager found."
        fi
    else
        fatal "npm not found. Install Node.js from https://nodejs.org (npm is included)."
    fi

    command -v npm &>/dev/null || fatal "npm still not available after install attempt."
    success "npm $(npm --version) installed."
}

# =============================================================================
# STEP 1 — Prerequisite validation
# =============================================================================
check_prerequisites() {
    section "Step 1 — Checking prerequisites"

    # bash version
    if (( BASH_VERSINFO[0] < 4 )); then
        fatal "Bash 4+ required (you have ${BASH_VERSION}). On macOS: brew install bash"
    fi
    success "Bash ${BASH_VERSION}"

    # git
    require_cmd git
    GIT_VER=$(git --version | awk '{print $3}')
    success "git ${GIT_VER}"

    # Node.js — version already enforced by ensure_node()
    require_cmd node
    NODE_VER=$(node --version | tr -d 'v')
    success "Node.js ${NODE_VER}"

    # npm — availability already enforced by ensure_npm()
    require_cmd npm
    NPM_VER=$(npm --version)
    success "npm ${NPM_VER}"

    # jq (optional but used for config writes if available)
    if command -v jq &>/dev/null; then
        JQ_AVAILABLE=1
        success "jq $(jq --version)"
    else
        JQ_AVAILABLE=0
        warn "jq not found — config will be written via bash. Consider: brew install jq"
    fi
}

# =============================================================================
# STEP 2 — Install OpenClaw CLI
# =============================================================================
install_openclaw() {
    section "Step 2 — OpenClaw CLI"

    if command -v openclaw &>/dev/null; then
        OC_VER=$(openclaw --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
        info "openclaw already installed: ${OC_VER}"
        # Version gate — warn but don't fatal; workspace config may still work
        if [[ "$OC_VER" != "unknown" ]]; then
            if version_ge "$OC_VER" "$OPENCLAW_MIN_VERSION"; then
                success "openclaw ${OC_VER} meets minimum ${OPENCLAW_MIN_VERSION}"
            else
                warn "openclaw ${OC_VER} is below recommended ${OPENCLAW_MIN_VERSION}. Upgrading…"
                npm install -g --unsafe-perm=true openclaw 2>&1 | tee -a "$LOG_FILE" || warn "Upgrade failed — continuing with existing version."
            fi
        fi
    else
        info "Installing openclaw globally via npm…"
        npm install -g --unsafe-perm=true openclaw 2>&1 | tee -a "$LOG_FILE" \
            || fatal "Failed to install openclaw. Try: sudo npm install -g --unsafe-perm=true openclaw"
        success "openclaw installed"
    fi

    # ---------------------------------------------------------------------------
    # CLI fix: resolve binary path and create symlink if openclaw not in PATH
    # ---------------------------------------------------------------------------
    if ! command -v openclaw &>/dev/null; then
        warn "openclaw binary not found in PATH — attempting to resolve and symlink…"
        local npm_prefix bin_path pkg_bin
        npm_prefix=$(npm config get prefix 2>/dev/null || echo "")
        if [[ -n "$npm_prefix" ]]; then
            # Try standard npm bin location
            bin_path="${npm_prefix}/bin/openclaw"
            if [[ ! -f "$bin_path" ]]; then
                # Try resolving from package.json bin field
                pkg_bin=$(node -e "try{const p=require('${npm_prefix}/lib/node_modules/openclaw/package.json');const b=p.bin;const k=Object.keys(b)[0];console.log('${npm_prefix}/lib/node_modules/openclaw/'+b[k]);}catch(e){}" 2>/dev/null || echo "")
                if [[ -n "$pkg_bin" && -f "$pkg_bin" ]]; then
                    bin_path="$pkg_bin"
                fi
            fi
            if [[ -f "$bin_path" ]]; then
                chmod +x "$bin_path"
                ln -sf "$bin_path" /usr/local/bin/openclaw 2>/dev/null \
                    || ln -sf "$bin_path" /usr/bin/openclaw 2>/dev/null \
                    || warn "Could not create symlink — you may need to add ${npm_prefix}/bin to PATH manually."
                export PATH="${npm_prefix}/bin:${PATH}"
                success "openclaw symlinked from ${bin_path}"
            else
                warn "Could not locate openclaw binary — continuing; manual PATH fix may be needed."
            fi
        fi
    fi

    require_cmd openclaw
    log "openclaw path: $(command -v openclaw)"
}

# =============================================================================
# STEP 2b — Validate OpenClaw CLI is functional
# =============================================================================
validate_openclaw() {
    info "Validating openclaw CLI…"
    local oc_path
    oc_path=$(command -v openclaw 2>/dev/null) || fatal "openclaw not found in PATH after install."
    log "openclaw resolved at: ${oc_path}"

    local oc_ver
    oc_ver=$(openclaw --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
    if [[ "$oc_ver" == "unknown" ]]; then
        warn "openclaw --version returned unexpected output — binary may be broken."
    else
        success "openclaw ${oc_ver} validated OK"
    fi
}

# =============================================================================
# STEP 3 — Clone or reuse repo
# =============================================================================
setup_repo() {
    section "Step 3 — Repository"

    ask "Install directory" "$DEFAULT_INSTALL_DIR" INSTALL_DIR
    INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"   # expand tilde

    if [[ -d "$INSTALL_DIR" ]]; then
        warn "Directory already exists: ${INSTALL_DIR}"
        if ask_yn "Reuse existing directory (skip clone)?"; then
            info "Reusing ${INSTALL_DIR}"
            CLONED=0
        else
            if ask_yn "DELETE and re-clone?"; then
                info "Removing ${INSTALL_DIR}…"
                rm -rf "$INSTALL_DIR"
                CLONED=1
            else
                fatal "Install aborted — directory conflict."
            fi
        fi
    else
        CLONED=1
    fi

    if (( CLONED )); then
        if [[ -z "$REPO_URL" ]]; then
            ask "Git repository URL" "" REPO_URL
        fi
        info "Cloning ${REPO_URL} → ${INSTALL_DIR}…"
        git clone "$REPO_URL" "$INSTALL_DIR" 2>&1 | tee -a "$LOG_FILE" \
            || fatal "git clone failed. Check URL and network."
        success "Repository cloned"
    fi

    # Confirm structure
    if [[ ! -d "${INSTALL_DIR}/agents" ]]; then
        warn "agents/ directory not found in ${INSTALL_DIR} — creating placeholder structure."
        mkdir -p "${INSTALL_DIR}/agents"
    fi

    # Discover actual agent IDs on disk; fall back to defaults
    DISCOVERED_AGENTS=()
    while IFS= read -r -d '' dir; do
        agent_id=$(basename "$dir")
        DISCOVERED_AGENTS+=("$agent_id")
    done < <(find "${INSTALL_DIR}/agents" -maxdepth 1 -mindepth 1 -type d -print0 2>/dev/null || true)

    if (( ${#DISCOVERED_AGENTS[@]} > 0 )); then
        info "Discovered agents: ${DISCOVERED_AGENTS[*]}"
        AGENT_IDS=("${DISCOVERED_AGENTS[@]}")
    else
        warn "No agent directories found — using defaults: ${AGENT_IDS[*]}"
        for id in "${AGENT_IDS[@]}"; do
            mkdir -p "${INSTALL_DIR}/agents/${id}"
        done
    fi
}

# =============================================================================
# STEP 4 — npm install
# =============================================================================
install_dependencies() {
    section "Step 4 — Installing dependencies"

    local roots=()
    [[ -f "${INSTALL_DIR}/package.json" ]] && roots+=("$INSTALL_DIR")

    # Agent-level package.json files
    for id in "${AGENT_IDS[@]}"; do
        local agent_dir="${INSTALL_DIR}/agents/${id}"
        [[ -f "${agent_dir}/package.json" ]] && roots+=("$agent_dir")
    done

    if (( ${#roots[@]} == 0 )); then
        warn "No package.json files found — skipping npm install."
        return
    fi

    for dir in "${roots[@]}"; do
        info "npm install in ${dir}…"
        (cd "$dir" && npm install 2>&1 | tee -a "$LOG_FILE") \
            || fatal "npm install failed in ${dir}"
        success "Dependencies installed: ${dir}"
    done
}

# =============================================================================
# STEP 5 — Interactive configuration gathering
# =============================================================================
gather_config() {
    section "Step 5 — Configuration"

    echo -e "${DIM}You will be prompted for system settings. Press Enter to accept defaults where shown.${RESET}\n"

    # A. System name
    hr
    ask "System / environment name" "odin" SYSTEM_NAME

    # Workspace dir
    local default_ws="${HOME}/.openclaw-${SYSTEM_NAME}"
    ask "OpenClaw workspace directory" "$default_ws" WORKSPACE_DIR
    WORKSPACE_DIR="${WORKSPACE_DIR/#\~/$HOME}"

    # B. Agent display names
    hr
    info "Agent display names (functional IDs are preserved):"
    declare -gA AGENT_DISPLAY_NAMES
    for id in "${AGENT_IDS[@]}"; do
        local default_name="${AGENT_DEFAULT_NAMES[$id]:-${id^}}"
        ask "  Display name for agent '${id}'" "$default_name" tmp_name
        AGENT_DISPLAY_NAMES["$id"]="$tmp_name"
    done

    # C. Discord tokens per agent
    hr
    info "Discord bot tokens (from Discord Developer Portal):"
    declare -gA AGENT_DISCORD_TOKENS
    for id in "${AGENT_IDS[@]}"; do
        local dname="${AGENT_DISPLAY_NAMES[$id]}"
        if ask_yn "  Configure Discord bot for '${dname}' (${id})?"; then
            ask_secret "    Bot token for ${dname}" tmp_token
            AGENT_DISCORD_TOKENS["$id"]="$tmp_token"
        else
            AGENT_DISCORD_TOKENS["$id"]=""
        fi
    done

    # D. Discord channel IDs per agent
    hr
    info "Discord channel IDs (the channel this agent monitors):"
    declare -gA AGENT_DISCORD_CHANNELS
    declare -gA AGENT_DISCORD_GUILD_IDS
    for id in "${AGENT_IDS[@]}"; do
        if [[ -n "${AGENT_DISCORD_TOKENS[$id]:-}" ]]; then
            local dname="${AGENT_DISPLAY_NAMES[$id]}"
            ask "  Guild (server) ID for ${dname}" "" tmp_guild
            ask "  Channel ID for ${dname}" "" tmp_chan
            AGENT_DISCORD_GUILD_IDS["$id"]="$tmp_guild"
            AGENT_DISCORD_CHANNELS["$id"]="$tmp_chan"
        fi
    done

    # E. LLM provider
    hr
    info "Primary LLM provider:"
    ask_choice "Select provider" LLM_PROVIDER_CHOICE \
        "minimax" \
        "anthropic (OAuth token)" \
        "groq"

    case "$LLM_PROVIDER_CHOICE" in
        "minimax")                  LLM_PROVIDER="minimax" ;;
        "anthropic (OAuth token)")  LLM_PROVIDER="anthropic" ;;
        "groq")                     LLM_PROVIDER="groq" ;;
    esac

    # F. API key / OAuth token
    hr
    case "$LLM_PROVIDER" in
        anthropic)
            info "Paste your Claude OAuth token (sk-ant-oat01-…):"
            ask_secret "OAuth token" LLM_TOKEN
            LLM_AUTH_TYPE="token"
            ;;
        minimax)
            ask_secret "MiniMax API key" LLM_TOKEN
            LLM_AUTH_TYPE="api_key"
            ;;
        groq)
            ask_secret "Groq API key (gsk_…)" LLM_TOKEN
            LLM_AUTH_TYPE="api_key"
            ;;
    esac

    # Optional secondary fallback
    hr
    if ask_yn "Add a local Ollama fallback model (free, no rate limits)?"; then
        OLLAMA_ENABLED=1
        ask "Ollama model (e.g. qwen3.5:9b)" "qwen3.5:9b" OLLAMA_MODEL
        ask "Ollama base URL" "http://localhost:11434" OLLAMA_BASE_URL
    else
        OLLAMA_ENABLED=0
        OLLAMA_MODEL=""
        OLLAMA_BASE_URL=""
    fi

    # Gateway token (auto-generated if blank)
    hr
    local default_gw_token
    default_gw_token=$(LC_ALL=C tr -dc 'a-f0-9' < /dev/urandom 2>/dev/null | head -c 48 || openssl rand -hex 24)
    ask "Gateway auth token (leave blank to auto-generate)" "$default_gw_token" GW_TOKEN
    [[ -z "$GW_TOKEN" ]] && GW_TOKEN="$default_gw_token"

    GW_PORT=18789

    # Review
    section "Configuration Review"
    echo -e "  ${BOLD}System name${RESET}:      ${SYSTEM_NAME}"
    echo -e "  ${BOLD}Workspace${RESET}:        ${WORKSPACE_DIR}"
    echo -e "  ${BOLD}Install dir${RESET}:      ${INSTALL_DIR}"
    echo -e "  ${BOLD}LLM provider${RESET}:     ${LLM_PROVIDER}"
    echo -e "  ${BOLD}LLM token${RESET}:        ${LLM_TOKEN:0:12}… (truncated)"
    echo -e "  ${BOLD}Gateway port${RESET}:     ${GW_PORT}"
    echo -e "  ${BOLD}Agents${RESET}:"
    for id in "${AGENT_IDS[@]}"; do
        local dname="${AGENT_DISPLAY_NAMES[$id]}"
        local has_discord="${AGENT_DISCORD_TOKENS[$id]:+yes}"
        echo -e "    ${CYAN}${id}${RESET} → ${dname} | Discord: ${has_discord:-no}"
    done
    echo
    ask_yn "Proceed with this configuration?" || fatal "Aborted by user."
}

# =============================================================================
# STEP 6 — Build workspace & openclaw.json
# =============================================================================
build_workspace() {
    section "Step 6 — Building workspace"

    mkdir -p "${WORKSPACE_DIR}"/{agents/main/agent,scripts,workspace,logs}
    success "Workspace directories created: ${WORKSPACE_DIR}"

    # -------------------------------------------------------------------------
    # 6a. Build openclaw.json
    # -------------------------------------------------------------------------
    local cfg_file="${WORKSPACE_DIR}/openclaw.json"

    # Build auth.order array
    local auth_order_json='"auth": {'$'\n'"    \"order\": {\"${LLM_PROVIDER}\": [\"${LLM_PROVIDER}:default\"]"
    if (( OLLAMA_ENABLED )); then
        auth_order_json="${auth_order_json}, \"ollama\": [\"ollama:default\"]"
    fi
    auth_order_json="${auth_order_json}}"$'\n'

    # Build channels.discord block — one account entry per agent that has a token
    local discord_accounts_json=""
    for id in "${AGENT_IDS[@]}"; do
        local token="${AGENT_DISCORD_TOKENS[$id]:-}"
        [[ -z "$token" ]] && continue
        local guild="${AGENT_DISCORD_GUILD_IDS[$id]}"
        local chan="${AGENT_DISCORD_CHANNELS[$id]}"
        local dname="${AGENT_DISPLAY_NAMES[$id]}"
        discord_accounts_json+=$(cat <<ACCT
          "$(json_escape "$id")": {
            "token": "$(json_escape "$token")",
            "displayName": "$(json_escape "$dname")",
            "allowFrom": ["$(json_escape "$guild")"],
            "guilds": {
              "$(json_escape "$guild")": {
                "groupPolicy": "allowlist",
                "allowedChannels": ["$(json_escape "$chan")"]
              }
            },
            "channels": ["$(json_escape "$chan")"]
          }
ACCT
)
        discord_accounts_json+=","
    done
    # strip trailing comma
    discord_accounts_json="${discord_accounts_json%,}"

    # Build bindings — one per agent with discord configured
    local bindings_json=""
    for id in "${AGENT_IDS[@]}"; do
        [[ -z "${AGENT_DISCORD_TOKENS[$id]:-}" ]] && continue
        bindings_json+=$(cat <<BIND
      {
        "agentId": "$(json_escape "$id")",
        "match": {
          "channel": "discord",
          "accountId": "$(json_escape "$id")"
        }
      },
BIND
)
    done
    bindings_json="${bindings_json%,}"

    # Build agents array
    local agents_json=""
    for id in "${AGENT_IDS[@]}"; do
        local dname="${AGENT_DISPLAY_NAMES[$id]}"
        agents_json+=$(cat <<AGENT
    {
      "id": "$(json_escape "$id")",
      "name": "$(json_escape "$dname")",
      "workspacePath": "$(json_escape "${WORKSPACE_DIR}/agents/${id}")"
    },
AGENT
)
    done
    agents_json="${agents_json%,}"

    cat > "$cfg_file" <<CONFIG
{
  "version": "1.0.0",
  "name": "$(json_escape "$SYSTEM_NAME")",
  "gateway": {
    "port": ${GW_PORT},
    "host": "127.0.0.1",
    "auth": {
      "token": "$(json_escape "$GW_TOKEN")"
    }
  },
  "tools": {
    "profile": "full",
    "exec": {
      "requireApproval": false
    }
  },
  "auth": {
    "order": {
      "$(json_escape "$LLM_PROVIDER")": ["$(json_escape "${LLM_PROVIDER}:default")"]$(
        (( OLLAMA_ENABLED )) && echo ", \"ollama\": [\"ollama:default\"]"
      )
    }
  },
  "channels": {
    "discord": {
      "enabled": $([ -n "$(echo "${AGENT_DISCORD_TOKENS[@]:-}" | tr -d ' ')" ] && echo "true" || echo "false"),
      "accounts": {
$(echo "$discord_accounts_json" | sed 's/^/        /')
      }
    }
  },
  "bindings": [
$(echo "$bindings_json" | sed 's/^/    /')
  ],
  "agents": [
$(echo "$agents_json" | sed 's/^/    /')
  ],
  "models": {
    "default": "$(get_default_model)"
  },
  "installDir": "$(json_escape "$INSTALL_DIR")",
  "workspaceDir": "$(json_escape "$WORKSPACE_DIR")"
}
CONFIG

    success "openclaw.json written: ${cfg_file}"

    # -------------------------------------------------------------------------
    # 6b. Build auth-profiles.json
    # -------------------------------------------------------------------------
    local auth_file="${WORKSPACE_DIR}/agents/main/agent/auth-profiles.json"
    mkdir -p "$(dirname "$auth_file")"

    local profiles_json="["
    # Primary provider
    profiles_json+=$(cat <<PROF

  {
    "name": "$(json_escape "${LLM_PROVIDER}:default")",
    "provider": "$(json_escape "$LLM_PROVIDER")",
    "type": "$(json_escape "$LLM_AUTH_TYPE")",
    "$([ "$LLM_AUTH_TYPE" = "token" ] && echo "token" || echo "key")": "$(json_escape "$LLM_TOKEN")",
    "active": true,
    "failureCounts": 0,
    "cooldownUntil": null,
    "errorCount": 0
  }
PROF
)

    if (( OLLAMA_ENABLED )); then
        profiles_json+=","
        profiles_json+=$(cat <<OPROFILE

  {
    "name": "ollama:default",
    "provider": "ollama",
    "type": "api_key",
    "key": "ollama-local",
    "baseUrl": "$(json_escape "$OLLAMA_BASE_URL")",
    "active": true,
    "failureCounts": 0,
    "cooldownUntil": null,
    "errorCount": 0
  }
OPROFILE
)
    fi

    profiles_json+=$'\n]'
    echo "$profiles_json" > "$auth_file"
    success "auth-profiles.json written: ${auth_file}"
}

# Helper: derive default model string from provider
get_default_model() {
    case "$LLM_PROVIDER" in
        anthropic) echo "anthropic/claude-haiku-4-5-20251001" ;;
        minimax)   echo "minimax/abab6.5s-chat" ;;
        groq)      echo "groq/llama-3.3-70b-versatile" ;;
        *)         echo "${LLM_PROVIDER}/default" ;;
    esac
}

# =============================================================================
# STEP 7 — Configure per-agent workspaces
# =============================================================================
configure_agents() {
    section "Step 7 — Agent workspaces"

    for id in "${AGENT_IDS[@]}"; do
        local agent_src="${INSTALL_DIR}/agents/${id}"
        local agent_ws="${WORKSPACE_DIR}/agents/${id}"
        local dname="${AGENT_DISPLAY_NAMES[$id]}"

        mkdir -p "${agent_ws}"

        # Copy source agent config if present; don't overwrite existing
        if [[ -f "${agent_src}/agent.json" ]] && [[ ! -f "${agent_ws}/agent.json" ]]; then
            cp "${agent_src}/agent.json" "${agent_ws}/agent.json"
        fi

        # Patch display name in agent.json
        if [[ -f "${agent_ws}/agent.json" ]]; then
            if (( JQ_AVAILABLE )); then
                local tmp; tmp=$(mktemp)
                jq --arg name "$dname" --arg id "$id" \
                    '.name = $name | .id = $id' \
                    "${agent_ws}/agent.json" > "$tmp" && mv "$tmp" "${agent_ws}/agent.json"
            else
                # Sed-based fallback — replace name field only
                sed -i.bak \
                    "s|\"name\":[[:space:]]*\"[^\"]*\"|\"name\": \"$(json_escape "$dname")\"|" \
                    "${agent_ws}/agent.json"
                rm -f "${agent_ws}/agent.json.bak"
            fi
            success "Agent '${id}' → display name '${dname}'"
        else
            # Create minimal agent.json
            cat > "${agent_ws}/agent.json" <<AGENTJSON
{
  "id": "$(json_escape "$id")",
  "name": "$(json_escape "$dname")",
  "version": "1.0.0",
  "model": "$(get_default_model)"$(
    (( OLLAMA_ENABLED )) && printf ',\n  "fallbackModel": "%s"' "ollama/${OLLAMA_MODEL}"
  )
}
AGENTJSON
            success "Agent '${id}' config created (minimal)"
        fi

        # Symlink or copy system prompt if present in repo
        for prompt_file in system-prompt.md SYSTEM_PROMPT.md system_prompt.txt; do
            if [[ -f "${agent_src}/${prompt_file}" ]] && [[ ! -f "${agent_ws}/${prompt_file}" ]]; then
                cp "${agent_src}/${prompt_file}" "${agent_ws}/${prompt_file}"
                log "Copied ${prompt_file} for ${id}"
            fi
        done
    done
}

# =============================================================================
# STEP 8 — Register agents with OpenClaw
# =============================================================================
register_agents() {
    section "Step 8 — Registering agents"

    export OPENCLAW_PROFILE="${SYSTEM_NAME}"
    export OPENCLAW_WORKSPACE="${WORKSPACE_DIR}"
    export OPENCLAW_CONFIG="${WORKSPACE_DIR}/openclaw.json"

    for id in "${AGENT_IDS[@]}"; do
        local agent_ws="${WORKSPACE_DIR}/agents/${id}"
        local dname="${AGENT_DISPLAY_NAMES[$id]}"

        info "Registering agent '${id}' (${dname})…"

        # openclaw agents add / upsert — absorb error if already registered
        if openclaw --config "${WORKSPACE_DIR}/openclaw.json" agents add \
            --id "$id" \
            --name "$dname" \
            --path "$agent_ws" \
            2>&1 | tee -a "$LOG_FILE"; then
            success "Registered: ${id}"
        else
            warn "openclaw agents add failed for '${id}' — may already be registered or CLI doesn't support this subcommand."
            warn "Continuing — config-based registration in openclaw.json should suffice."
        fi
    done
}

# =============================================================================
# STEP 9 — Write LaunchAgent (macOS) or systemd unit (Linux)
# =============================================================================
setup_service() {
    section "Step 9 — System service"

    if [[ "$(uname)" == "Darwin" ]]; then
        _setup_launchagent
    elif [[ "$(uname)" == "Linux" ]]; then
        _setup_systemd
    else
        warn "Unknown OS — skipping service setup. Run manually: openclaw --config ${WORKSPACE_DIR}/openclaw.json start"
    fi
}

_setup_launchagent() {
    local plist_label="ai.openclaw.${SYSTEM_NAME}"
    local plist_path="${HOME}/Library/LaunchAgents/${plist_label}.plist"
    local openclaw_bin
    openclaw_bin=$(command -v openclaw)

    if [[ -f "$plist_path" ]]; then
        warn "LaunchAgent already exists: ${plist_path}"
        if ask_yn "Reload it?"; then
            launchctl unload "$plist_path" 2>/dev/null || true
        else
            return 0
        fi
    fi

    cat > "$plist_path" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${plist_label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${openclaw_bin}</string>
    <string>--config</string>
    <string>${WORKSPACE_DIR}/openclaw.json</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/openclaw/${SYSTEM_NAME}-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/openclaw/${SYSTEM_NAME}-stderr.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>OPENCLAW_CONFIG</key>
    <string>${WORKSPACE_DIR}/openclaw.json</string>
  </dict>
</dict>
</plist>
PLIST

    mkdir -p /tmp/openclaw
    launchctl load "$plist_path" 2>&1 | tee -a "$LOG_FILE" \
        && success "LaunchAgent loaded: ${plist_label}" \
        || warn "launchctl load failed — system may need a restart or manual load."

    SERVICE_LABEL="$plist_label"
    SERVICE_TYPE="launchagent"
    SERVICE_PATH="$plist_path"
}

_setup_systemd() {
    local unit_name="openclaw-${SYSTEM_NAME}"
    local unit_path="${HOME}/.config/systemd/user/${unit_name}.service"
    local openclaw_bin
    openclaw_bin=$(command -v openclaw)

    mkdir -p "$(dirname "$unit_path")"

    cat > "$unit_path" <<SYSTEMD
[Unit]
Description=OpenClaw ${SYSTEM_NAME}
After=network.target

[Service]
Type=simple
ExecStart=${openclaw_bin} --config ${WORKSPACE_DIR}/openclaw.json start
Restart=on-failure
RestartSec=5
Environment=OPENCLAW_CONFIG=${WORKSPACE_DIR}/openclaw.json

[Install]
WantedBy=default.target
SYSTEMD

    systemctl --user daemon-reload 2>&1 | tee -a "$LOG_FILE" || true
    systemctl --user enable --now "$unit_name" 2>&1 | tee -a "$LOG_FILE" \
        && success "systemd service enabled: ${unit_name}" \
        || warn "systemctl enable failed — run manually: systemctl --user start ${unit_name}"

    SERVICE_LABEL="$unit_name"
    SERVICE_TYPE="systemd"
    SERVICE_PATH="$unit_path"
}

# =============================================================================
# STEP 10 — openclaw doctor
# =============================================================================
run_doctor() {
    section "Step 10 — Health check (openclaw doctor)"

    local doctor_out
    if doctor_out=$(openclaw --config "${WORKSPACE_DIR}/openclaw.json" doctor 2>&1); then
        echo "$doctor_out" | tee -a "$LOG_FILE"
        success "openclaw doctor passed"
    else
        echo "$doctor_out" | tee -a "$LOG_FILE"
        warn "openclaw doctor reported issues (exit code $?)."
        warn "Review output above and check ${LOG_FILE}"
        if ! ask_yn "Continue despite doctor warnings?"; then
            fatal "Aborted on doctor failure."
        fi
    fi
}

# =============================================================================
# STEP 11 — Start
# =============================================================================
start_system() {
    section "Step 11 — Starting system"

    info "Running: openclaw --config ${WORKSPACE_DIR}/openclaw.json start"

    # Fire-and-forget; service management is via LaunchAgent/systemd above.
    # If those were set up, the process is already running.
    if [[ "${SERVICE_TYPE:-}" == "launchagent" ]] || [[ "${SERVICE_TYPE:-}" == "systemd" ]]; then
        info "System already started via service manager."
    else
        openclaw --config "${WORKSPACE_DIR}/openclaw.json" start &
        OPENCLAW_PID=$!
        sleep 2
        if kill -0 "$OPENCLAW_PID" 2>/dev/null; then
            success "OpenClaw started (PID ${OPENCLAW_PID})"
        else
            warn "OpenClaw may have exited early — check logs."
        fi
    fi

    # Health probe
    local health_url="http://127.0.0.1:${GW_PORT}/health"
    local max_attempts=12
    info "Waiting for gateway on ${health_url}…"
    for ((i=1; i<=max_attempts; i++)); do
        if curl -sf -o /dev/null \
            -H "Authorization: Bearer ${GW_TOKEN}" \
            "$health_url" 2>/dev/null; then
            success "Gateway is up"
            return 0
        fi
        log "Attempt ${i}/${max_attempts}…"
        sleep 3
    done
    warn "Gateway did not respond within $((max_attempts * 3))s — check logs."
}

# =============================================================================
# STEP 12 — Final output
# =============================================================================
print_summary() {
    section "Installation Complete"

    local restart_cmd
    case "${SERVICE_TYPE:-none}" in
        launchagent)
            restart_cmd="launchctl unload ${SERVICE_PATH} && launchctl load ${SERVICE_PATH}"
            ;;
        systemd)
            restart_cmd="systemctl --user restart ${SERVICE_LABEL}"
            ;;
        *)
            restart_cmd="openclaw --config ${WORKSPACE_DIR}/openclaw.json start"
            ;;
    esac

    cat <<SUMMARY

  ${BOLD}${GREEN}Odin (Tesla V4) is installed and running.${RESET}

  ${BOLD}Locations${RESET}
  ─────────────────────────────────────────
  Install dir   : ${INSTALL_DIR}
  Workspace     : ${WORKSPACE_DIR}
  Config        : ${WORKSPACE_DIR}/openclaw.json
  Auth profiles : ${WORKSPACE_DIR}/agents/main/agent/auth-profiles.json
  Install log   : ${LOG_FILE}

  ${BOLD}Gateway${RESET}
  ─────────────────────────────────────────
  URL           : ws://127.0.0.1:${GW_PORT}
  Auth token    : ${GW_TOKEN}
  Health check  : curl -H "Authorization: Bearer ${GW_TOKEN}" http://127.0.0.1:${GW_PORT}/health

  ${BOLD}Agents${RESET}
  ─────────────────────────────────────────
SUMMARY

    for id in "${AGENT_IDS[@]}"; do
        local dname="${AGENT_DISPLAY_NAMES[$id]}"
        local has_discord="${AGENT_DISCORD_TOKENS[$id]:+Discord configured}"
        printf "  %-12s → %-20s  %s\n" "$id" "$dname" "${has_discord:-}"
    done

    cat <<SUMMARY2

  ${BOLD}Common commands${RESET}
  ─────────────────────────────────────────
  Restart  : ${restart_cmd}
  Logs     : openclaw --config ${WORKSPACE_DIR}/openclaw.json logs
  Status   : openclaw --config ${WORKSPACE_DIR}/openclaw.json status
  Doctor   : openclaw --config ${WORKSPACE_DIR}/openclaw.json doctor

SUMMARY2
}

# =============================================================================
# MAIN
# =============================================================================
main() {
    print_banner
    log "Installer started. PID=$$"

    ensure_node
    ensure_npm
    check_prerequisites
    install_openclaw
    validate_openclaw
    setup_repo
    install_dependencies
    gather_config
    build_workspace
    configure_agents
    register_agents
    setup_service
    run_doctor
    start_system
    print_summary
}

main "$@"
