#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

# =============================================================================
# Setup
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/tmp/odin-install-$(date +%Y%m%d-%H%M%S).log"
BACK_TOKEN="__ODIN_BACK__"
TESLA_MANIFEST_REL="agents/tesla/manifest.yaml"
TESLA_INSTALLER_METADATA_REL="agents/tesla/installer-metadata.json"
ACTIVE_AGENT_LIST=()
PRIMARY_AGENT_ID=""

RED=$'\033[0;31m'
YELLOW=$'\033[1;33m'
GREEN=$'\033[0;32m'
CYAN=$'\033[0;36m'
BOLD=$'\033[1m'
DIM=$'\033[2m'
RESET=$'\033[0m'

if (( BASH_VERSINFO[0] < 4 )); then
  printf "%sBash 4 or newer is required.%s\n" "${RED}" "${RESET}" >&2
  exit 1
fi

SOURCE_DIR=""
INSTALL_DIR=""
PROFILE_NAME="odin"
STATE_DIR=""
CONFIG_PATH=""
OPENCLAW_VERSION=""
TESLA_VERSION="0.0.0"
OPENCLAW_SCHEMA_PATH=""
OPENCLAW_CMD="openclaw"
GATEWAY_TOKEN=""
GATEWAY_PORT="18789"
DEPLOYMENT_MODE="local"
DASHBOARD_MODE="paired"
CUSTOM_BIND_HOST="127.0.0.1"
LLM_CONFIGURE="yes"
LLM_PROVIDER=""
LLM_AUTH_MODE=""
LLM_API_KEY=""
LLM_DEFAULT_MODEL=""
LLM_RUNTIME_MODE="cloud"
CONTROL_UI_ALLOWED_ORIGINS=()
TRUSTED_PROXIES=()
DEBUG_MODE="false"
NODE_MIN_VERSION="22.12.0"
OPENCLAW_INSTALL_METHOD="npm"
SCHEMA_VALIDATOR_JS=""
LAST_FAILURE_OUTPUT=""

declare -A AGENT_ROLE_LABEL=()
declare -A AGENT_ROLE_SUMMARY=()
declare -A AGENT_DEFAULT_NAME=()

declare -A AGENT_ENABLED=()
declare -A AGENT_NAME=()
declare -A AGENT_TOKEN=()
declare -A AGENT_GUILD_ID=()
declare -A AGENT_CHANNEL_ID=()

log()      { printf "%s[%s]%s %s\n" "${DIM}" "$(date +%H:%M:%S)" "${RESET}" "$*" | tee -a "$LOG_FILE"; }
info()     { printf "%s▸%s %s\n" "${CYAN}${BOLD}" "${RESET}" "$*" | tee -a "$LOG_FILE"; }
success()  { printf "%s✔%s %s\n" "${GREEN}${BOLD}" "${RESET}" "$*" | tee -a "$LOG_FILE"; }
warn()     { printf "%s⚠%s %s\n" "${YELLOW}${BOLD}" "${RESET}" "$*" | tee -a "$LOG_FILE"; }
error()    { printf "%s✖%s %s\n" "${RED}${BOLD}" "${RESET}" "$*" | tee -a "$LOG_FILE" >&2; }
fatal()    { error "$*"; printf "%sLog:%s %s\n" "${DIM}" "${RESET}" "$LOG_FILE"; exit 1; }
section()  {
  printf "\n%s══════════════════════════════════════%s\n" "${CYAN}${BOLD}" "${RESET}"
  printf "%s%s%s\n" "${CYAN}${BOLD}" "$*" "${RESET}"
  printf "%s══════════════════════════════════════%s\n\n" "${CYAN}${BOLD}" "${RESET}"
}

on_error() {
  local exit_code=$?
  error "Installer failed at line ${1} (exit ${exit_code})."
  printf "%sLog:%s %s\n" "${DIM}" "${RESET}" "$LOG_FILE"
  exit "$exit_code"
}
trap 'on_error "$LINENO"' ERR

json_escape() {
  local value="${1:-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

join_by() {
  local delimiter="$1"
  shift || true
  local first=1
  local value
  for value in "$@"; do
    if (( first )); then
      printf '%s' "$value"
      first=0
    else
      printf '%s%s' "$delimiter" "$value"
    fi
  done
}

is_back() {
  [[ "${1:-}" == "$BACK_TOKEN" ]]
}

prompt_text() {
  local prompt="$1"
  local default="${2:-}"
  local required="${3:-yes}"
  while true; do
    if [[ -n "$default" ]]; then
      printf "%b" "${BOLD}${prompt}${RESET} ${DIM}[${default}]${RESET}: "
    else
      printf "%b" "${BOLD}${prompt}${RESET}: "
    fi
    IFS= read -r REPLY < /dev/tty
    if [[ "${REPLY,,}" == "back" ]]; then
      REPLY="$BACK_TOKEN"
      return 0
    fi
    if [[ -z "$REPLY" ]]; then
      REPLY="$default"
    fi
    if [[ "$required" == "yes" && -z "$REPLY" ]]; then
      warn "Value required. Type 'back' to return to the previous step."
      continue
    fi
    return 0
  done
}

prompt_secret() {
  local prompt="$1"
  while true; do
    printf "%b" "${BOLD}${prompt}${RESET}: "
    IFS= read -rs REPLY < /dev/tty
    printf "\n"
    if [[ "${REPLY,,}" == "back" ]]; then
      REPLY="$BACK_TOKEN"
      return 0
    fi
    if [[ -z "$REPLY" ]]; then
      warn "Value required. Type 'back' to return to the previous step."
      continue
    fi
    return 0
  done
}

prompt_yes_no() {
  local prompt="$1"
  local default="${2:-y}"
  local hint
  if [[ "${default,,}" == "y" ]]; then
    hint="[Y/n]"
  else
    hint="[y/N]"
  fi
  while true; do
    printf "%b" "${BOLD}${prompt}${RESET} ${DIM}${hint}${RESET}: "
    IFS= read -r REPLY < /dev/tty
    if [[ "${REPLY,,}" == "back" ]]; then
      REPLY="$BACK_TOKEN"
      return 0
    fi
    REPLY="${REPLY:-$default}"
    case "${REPLY,,}" in
      y|yes) REPLY="yes"; return 0 ;;
      n|no) REPLY="no"; return 0 ;;
      *) warn "Enter yes or no. Type 'back' to return to the previous step." ;;
    esac
  done
}

prompt_choice() {
  local prompt="$1"
  local default_index="$2"
  shift 2
  local options=("$@")
  local i
  printf "%b\n" "${BOLD}${prompt}${RESET}"
  for i in "${!options[@]}"; do
    printf "  %s%s)%s %s\n" "${CYAN}" "$(( i + 1 ))" "${RESET}" "${options[$i]}"
  done
  while true; do
    printf "%b" "${BOLD}Choice${RESET} ${DIM}[${default_index}]${RESET}: "
    IFS= read -r REPLY < /dev/tty
    if [[ "${REPLY,,}" == "back" ]]; then
      REPLY="$BACK_TOKEN"
      return 0
    fi
    REPLY="${REPLY:-$default_index}"
    if [[ "$REPLY" =~ ^[0-9]+$ ]] && (( REPLY >= 1 && REPLY <= ${#options[@]} )); then
      REPLY="${options[$(( REPLY - 1 ))]}"
      return 0
    fi
    warn "Enter a number between 1 and ${#options[@]}. Type 'back' to return to the previous step."
  done
}

confirm_step() {
  local title="$1"
  local body="$2"
  printf "\n%b\n" "${BOLD}${title}${RESET}"
  printf "%s\n\n" "$body"
  while true; do
    printf "%b" "${BOLD}Confirm${RESET} ${DIM}[c=continue, e=edit, b=back]${RESET}: "
    IFS= read -r REPLY < /dev/tty
    case "${REPLY,,}" in
      ""|c|continue) REPLY="continue"; return 0 ;;
      e|edit) REPLY="edit"; return 0 ;;
      b|back) REPLY="back"; return 0 ;;
      *) warn "Enter c, e, or b." ;;
    esac
  done
}

validate_profile_name() {
  [[ "$1" =~ ^[A-Za-z0-9_-]+$ ]]
}

validate_discord_id() {
  [[ "$1" =~ ^[0-9]{17,20}$ ]]
}

validate_discord_token() {
  local token="${1:-}"
  [[ -n "$token" ]] || return 1
  [[ "$token" == *.*.* && ${#token} -ge 50 ]]
}

validate_url() {
  [[ "${1:-}" =~ ^https?://[^[:space:]]+$ ]]
}

validate_api_key() {
  [[ -n "${1:-}" ]]
}

version_ge() {
  local current="${1#v}"
  local required="${2#v}"
  local IFS=.
  local -a current_parts=($current) required_parts=($required)
  local idx current_value required_value
  for idx in 0 1 2; do
    current_value="${current_parts[$idx]:-0}"
    required_value="${required_parts[$idx]:-0}"
    if (( current_value > required_value )); then
      return 0
    fi
    if (( current_value < required_value )); then
      return 1
    fi
  done
  return 0
}

mask_secret() {
  local value="${1:-}"
  local len="${#value}"
  if (( len <= 8 )); then
    printf '%s' "$value"
  else
    printf '%s...%s' "${value:0:4}" "${value: -4}"
  fi
}

discover_source_dir() {
  local probe="$SCRIPT_DIR"
  while [[ "$probe" != "/" ]]; do
    if [[ -f "$probe/install.sh" && -f "$probe/$TESLA_MANIFEST_REL" ]]; then
      SOURCE_DIR="$probe"
      return 0
    fi
    probe="$(dirname "$probe")"
  done
  probe="$(pwd)"
  while [[ "$probe" != "/" ]]; do
    if [[ -f "$probe/install.sh" && -f "$probe/$TESLA_MANIFEST_REL" ]]; then
      SOURCE_DIR="$probe"
      return 0
    fi
    probe="$(dirname "$probe")"
  done
  fatal "Could not locate the Odin repo root from the installer."
}

load_tesla_version() {
  TESLA_VERSION="$(
    awk '/^version: / { gsub(/"/, "", $2); print $2; exit }' "${SOURCE_DIR}/${TESLA_MANIFEST_REL}"
  )"
  [[ -n "$TESLA_VERSION" ]] || TESLA_VERSION="0.0.0"
}

load_tesla_installer_metadata() {
  local metadata_path="${SOURCE_DIR}/${TESLA_INSTALLER_METADATA_REL}"
  [[ -f "$metadata_path" ]] || fatal "Missing Tesla installer metadata: ${metadata_path}"

  local loader_js
  loader_js="$(mktemp)"
  cat >"$loader_js" <<'NODE'
const fs = require("node:fs");
const metadataPath = process.env.METADATA_PATH;
const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));

function fail(message) {
  console.error(message);
  process.exit(1);
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

if (!metadata || typeof metadata !== "object") {
  fail("Tesla installer metadata must be a JSON object.");
}

if (!Array.isArray(metadata.agents) || metadata.agents.length === 0) {
  fail("Tesla installer metadata must define a non-empty agents array.");
}

const enabledAgents = metadata.agents.filter((agent) => agent && agent.enabled === true);
if (enabledAgents.length === 0) {
  fail("Tesla installer metadata must contain at least one enabled agent.");
}

const primaryAgents = enabledAgents.filter((agent) => agent.primary === true);
if (primaryAgents.length !== 1) {
  fail("Tesla installer metadata must define exactly one enabled primary agent.");
}

const lines = [
  "ACTIVE_AGENT_LIST=()",
  "PRIMARY_AGENT_ID=" + shellQuote(primaryAgents[0].id),
  "AGENT_ROLE_LABEL=()",
  "AGENT_ROLE_SUMMARY=()",
  "AGENT_DEFAULT_NAME=()"
];

for (const agent of enabledAgents) {
  const requiredFields = ["id", "roleLabel", "roleSummary", "defaultDisplayName"];
  for (const field of requiredFields) {
    if (typeof agent[field] !== "string" || agent[field].trim().length === 0) {
      fail("Tesla installer metadata is missing required field '" + field + "' for agent '" + (agent.id || "unknown") + "'.");
    }
  }
  lines.push("ACTIVE_AGENT_LIST+=(" + shellQuote(agent.id) + ")");
  lines.push("AGENT_ROLE_LABEL[" + shellQuote(agent.id) + "]=" + shellQuote(agent.roleLabel));
  lines.push("AGENT_ROLE_SUMMARY[" + shellQuote(agent.id) + "]=" + shellQuote(agent.roleSummary));
  lines.push("AGENT_DEFAULT_NAME[" + shellQuote(agent.id) + "]=" + shellQuote(agent.defaultDisplayName));
}

process.stdout.write(lines.join("\n"));
NODE
  local shell_exports
  shell_exports="$(METADATA_PATH="$metadata_path" node "$loader_js")" || {
    rm -f "$loader_js"
    fatal "Failed to load Tesla installer metadata."
  }
  rm -f "$loader_js"

  eval "$shell_exports"
  [[ ${#ACTIVE_AGENT_LIST[@]} -gt 0 ]] || fatal "Tesla installer metadata did not produce any enabled agents."
}

print_banner() {
  printf "%b" "${CYAN}${BOLD}"
  cat <<'EOF'
   ██████╗ ██████╗ ██╗███╗   ██╗
  ██╔═══██╗██╔══██╗██║████╗  ██║
  ██║   ██║██║  ██║██║██╔██╗ ██║
  ██║   ██║██║  ██║██║██║╚██╗██║
  ╚██████╔╝██████╔╝██║██║ ╚████║
   ╚═════╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝
EOF
  printf "%b\n" "${RESET}"
  printf "  %sODIN V%s%s\n" "${BOLD}" "$TESLA_VERSION" "${RESET}"
  printf "  %sLog:%s %s\n\n" "${DIM}" "${RESET}" "$LOG_FILE"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fatal "Required command not found: $1"
}

maybe_sudo() {
  if (( EUID == 0 )); then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    return 1
  fi
}

run_and_log() {
  local description="$1"
  shift
  log "$description"
  "$@" >>"$LOG_FILE" 2>&1
}

load_debug_flag() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      --debug)
        DEBUG_MODE="true"
        set -x
        ;;
    esac
  done
}

resolve_npm_bin_dir() {
  local prefix
  prefix="$(npm config get prefix 2>/dev/null | tr -d '\r')"
  [[ -n "$prefix" && "$prefix" != "undefined" ]] || return 1
  if [[ -d "$prefix/bin" ]]; then
    printf '%s' "$prefix/bin"
  else
    printf '%s' "$prefix"
  fi
}

ensure_global_bin_on_path() {
  local npm_bin_dir
  npm_bin_dir="$(resolve_npm_bin_dir)" || fatal "Unable to resolve npm global prefix."
  if [[ ":$PATH:" != *":${npm_bin_dir}:"* ]]; then
    export PATH="${npm_bin_dir}:$PATH"
  fi
  hash -r
}

repair_openclaw_binary_path() {
  local npm_bin_dir openclaw_bin target_dir target_path
  npm_bin_dir="$(resolve_npm_bin_dir)" || fatal "Unable to resolve npm global prefix for OpenClaw."
  openclaw_bin="${npm_bin_dir}/openclaw"
  [[ -x "$openclaw_bin" ]] || fatal "OpenClaw binary was not created in npm prefix: ${openclaw_bin}"

  if command -v openclaw >/dev/null 2>&1; then
    return 0
  fi

  for target_dir in /usr/local/bin /usr/bin; do
    if [[ -d "$target_dir" || "$target_dir" == "/usr/local/bin" ]]; then
      maybe_sudo mkdir -p "$target_dir" >>"$LOG_FILE" 2>&1 || continue
      target_path="${target_dir}/openclaw"
      maybe_sudo ln -sf "$openclaw_bin" "$target_path" >>"$LOG_FILE" 2>&1 || continue
      hash -r
      if command -v openclaw >/dev/null 2>&1; then
        success "Linked OpenClaw binary into ${target_dir}"
        return 0
      fi
    fi
  done

  fatal "OpenClaw binary exists at ${openclaw_bin} but is not accessible on PATH."
}

install_node_via_nodesource() {
  [[ "$(uname -s)" == "Linux" ]] || fatal "Node ${NODE_MIN_VERSION}+ is required. Install Node 22 manually on this platform, then rerun."
  require_cmd curl

  info "Installing Node 22 via NodeSource because the current Node runtime is below ${NODE_MIN_VERSION}."
  local setup_script
  setup_script="$(mktemp)"
  curl -fsSL https://deb.nodesource.com/setup_22.x -o "$setup_script" >>"$LOG_FILE" 2>&1 \
    || fatal "Failed to download the NodeSource setup script."
  maybe_sudo bash "$setup_script" >>"$LOG_FILE" 2>&1 \
    || fatal "Failed to configure the NodeSource Node 22 repository."
  rm -f "$setup_script"
  if command -v apt-get >/dev/null 2>&1; then
    run_and_log "Installing nodejs package" maybe_sudo apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    run_and_log "Installing nodejs package" maybe_sudo dnf install -y nodejs
  elif command -v yum >/dev/null 2>&1; then
    run_and_log "Installing nodejs package" maybe_sudo yum install -y nodejs
  else
    fatal "Node ${NODE_MIN_VERSION}+ is required and this Linux distribution is not supported for automatic NodeSource installation."
  fi
  hash -r
}

ensure_node() {
  section "Setup — Node Runtime"

  local node_version
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    warn "Node.js and npm were not both available on PATH. Installing Node 22."
    install_node_via_nodesource
  fi

  require_cmd node
  require_cmd npm
  node_version="$(node --version 2>/dev/null | tr -d '\r')"
  [[ -n "$node_version" ]] || fatal "Unable to determine the current Node version."

  if ! version_ge "$node_version" "$NODE_MIN_VERSION"; then
    warn "Detected Node ${node_version}. OpenClaw requires Node ${NODE_MIN_VERSION}+."
    install_node_via_nodesource
    require_cmd node
    node_version="$(node --version 2>/dev/null | tr -d '\r')"
  fi

  version_ge "$node_version" "$NODE_MIN_VERSION" \
    || fatal "Node ${NODE_MIN_VERSION}+ is required. Current version is ${node_version}."

  require_cmd npm
  ensure_global_bin_on_path
  hash -r
  local NODE_PATH
  NODE_PATH="$(command -v node)"
  [[ -x "$NODE_PATH" ]] || fatal "Node binary not accessible after install"
  success "Using Node ${node_version} with npm $(npm --version 2>/dev/null | tr -d '\r')"
}

check_openclaw_valid() {
  command -v "$OPENCLAW_CMD" >/dev/null 2>&1 || return 1
  "$OPENCLAW_CMD" --version >/dev/null 2>&1
}

ensure_openclaw() {
  section "Setup — OpenClaw CLI"

  if check_openclaw_valid; then
    local version_output_existing
    version_output_existing="$($OPENCLAW_CMD --version 2>&1 | head -n 1 | tr -d '\r')"
    OPENCLAW_VERSION="$(printf '%s' "$version_output_existing" | sed -E 's/^OpenClaw[[:space:]]+([^[:space:]]+).*$/\1/')"
    success "OpenClaw already installed and valid"
  else
    run_and_log "Installing OpenClaw globally with npm" npm install -g openclaw@latest --unsafe-perm=true \
      || fatal "Failed to install OpenClaw with npm."

    hash -r
    ensure_global_bin_on_path
    if ! command -v "$OPENCLAW_CMD" >/dev/null 2>&1; then
      repair_openclaw_binary_path
    fi
  fi

  command -v "$OPENCLAW_CMD" >/dev/null 2>&1 || fatal "OpenClaw CLI is not accessible after installation."

  local version_output
  version_output="$($OPENCLAW_CMD --version 2>&1 | head -n 1 | tr -d '\r')" \
    || fatal "OpenClaw CLI is installed but '--version' failed."
  [[ -n "$version_output" ]] || fatal "OpenClaw CLI returned an empty version string."
  OPENCLAW_VERSION="$(printf '%s' "$version_output" | sed -E 's/^OpenClaw[[:space:]]+([^[:space:]]+).*$/\1/')"
  [[ -n "$OPENCLAW_VERSION" ]] || fatal "Unable to parse OpenClaw version from: ${version_output}"
  success "OpenClaw ${OPENCLAW_VERSION} installed and verified"
}

detect_schema() {
  OPENCLAW_SCHEMA_PATH="$(mktemp)"
  "$OPENCLAW_CMD" config schema >"$OPENCLAW_SCHEMA_PATH" \
    || fatal "Failed to load the OpenClaw config schema."
  [[ -s "$OPENCLAW_SCHEMA_PATH" ]] || fatal "OpenClaw config schema output was empty."

  SCHEMA_VALIDATOR_JS="$(mktemp)"
  cat >"$SCHEMA_VALIDATOR_JS" <<'EOF'
const fs = require("node:fs");
const [schemaPath, configPath] = process.argv.slice(2);
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

function deref(node, root) {
  if (!node || typeof node !== "object") return node;
  if (node.$ref) {
    if (!node.$ref.startsWith("#/")) {
      throw new Error("Unsupported schema ref: " + node.$ref);
    }
    const parts = node.$ref.slice(2).split("/");
    let target = root;
    for (const part of parts) {
      target = target?.[part];
    }
    if (!target) {
      throw new Error("Missing schema ref target: " + node.$ref);
    }
    return deref(target, root);
  }
  return node;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function validate(node, value, path, root) {
  node = deref(node, root);
  if (!node) return;

  if (Array.isArray(node.type)) {
    if (node.type.some((type) => matchesType(type, value))) return;
    fail(path + ": expected one of " + node.type.join(", "));
  }

  if (node.type && !matchesType(node.type, value)) {
    fail(path + ": expected " + node.type);
  }

  if (node.enum && !node.enum.includes(value)) {
    fail(path + ": unexpected value " + JSON.stringify(value));
  }

  if (node.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const properties = node.properties || {};
    const required = node.required || [];
    for (const key of required) {
      if (!(key in value)) fail(path + "." + key + ": missing required key");
    }
    if (node.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) fail(path + "." + key + ": unknown key for current schema");
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (key in value) validate(child, value[key], path + "." + key, root);
    }
    if (node.additionalProperties && typeof node.additionalProperties === "object") {
      for (const [key, childValue] of Object.entries(value)) {
        if (!(key in properties)) validate(node.additionalProperties, childValue, path + "." + key, root);
      }
    }
  }

  if (node.type === "array" && Array.isArray(value) && node.items) {
    value.forEach((item, index) => validate(node.items, item, path + "[" + index + "]", root));
  }
}

function matchesType(type, value) {
  switch (type) {
    case "object": return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "number": return typeof value === "number";
    case "integer": return Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    default: return true;
  }
}

validate(schema, config, "$", schema);
EOF
  success "Loaded live OpenClaw schema for ${OPENCLAW_VERSION}"
}

expand_home_path() {
  local path="$1"
  if [[ "$path" == "~"* ]]; then
    printf '%s' "${HOME}${path:1}"
  else
    printf '%s' "$path"
  fi
}

derive_state_paths() {
  if [[ "$PROFILE_NAME" == "default" ]]; then
    STATE_DIR="${HOME}/.openclaw"
  else
    STATE_DIR="${HOME}/.openclaw-${PROFILE_NAME}"
  fi
  CONFIG_PATH="${STATE_DIR}/openclaw.json"
}

default_model_for_provider() {
  case "$1" in
    anthropic) printf 'anthropic/claude-haiku-4-5' ;;
    openai) printf 'openai/gpt-5-mini' ;;
    openrouter) printf 'openrouter/openai/gpt-5-mini' ;;
    groq) printf 'groq/llama-3.3-70b-versatile' ;;
    *) printf '' ;;
  esac
}

discover_ollama_model() {
  if ! command -v ollama >/dev/null 2>&1; then
    return 1
  fi
  local first_model
  first_model="$(ollama list 2>/dev/null | awk 'NR > 1 && $1 != "NAME" { print $1; exit }')"
  if [[ -n "$first_model" ]]; then
    printf 'ollama/%s' "$first_model"
  else
    printf 'ollama/llama3.2:3b'
  fi
  return 0
}

generate_gateway_token() {
  node -e 'console.log(require("node:crypto").randomBytes(24).toString("hex"))'
}

split_csv_into_array() {
  local raw="$1"
  local -n target_ref="$2"
  target_ref=()
  if [[ -z "$raw" ]]; then
    return 0
  fi
  IFS=',' read -r -a __items <<<"$raw"
  local item
  for item in "${__items[@]}"; do
    item="$(printf '%s' "$item" | awk '{$1=$1;print}')"
    [[ -n "$item" ]] && target_ref+=("$item")
  done
}

enabled_agent_ids() {
  local ids=("$PRIMARY_AGENT_ID")
  local id
  for id in "${ACTIVE_AGENT_LIST[@]}"; do
    [[ "$id" == "$PRIMARY_AGENT_ID" ]] && continue
    if [[ "${AGENT_ENABLED[$id]:-no}" == "yes" ]]; then
      ids+=("$id")
    fi
  done
  printf '%s\n' "${ids[@]}"
}

main_agent_workspace() {
  printf '%s' "$INSTALL_DIR"
}

agent_workspace() {
  local agent_id="$1"
  if [[ "$agent_id" == "$PRIMARY_AGENT_ID" ]]; then
    main_agent_workspace
  else
    printf '%s/agents/%s' "$INSTALL_DIR" "$agent_id"
  fi
}

agent_dir_path() {
  local agent_id="$1"
  printf '%s/agents/%s/agent' "$STATE_DIR" "$agent_id"
}

agent_sessions_path() {
  local agent_id="$1"
  printf '%s/agents/%s/sessions' "$STATE_DIR" "$agent_id"
}

step_setup() {
  while true; do
    section "UX Prompts — Setup"

    prompt_text "Install directory" "${HOME}/odin-core" "yes"
    is_back "$REPLY" && return 10
    INSTALL_DIR="$(expand_home_path "$REPLY")"

    prompt_text "OpenClaw profile name" "$PROFILE_NAME" "yes"
    is_back "$REPLY" && return 10
    if ! validate_profile_name "$REPLY"; then
      warn "Profile names may only contain letters, numbers, dashes, and underscores."
      continue
    fi
    PROFILE_NAME="$REPLY"
    derive_state_paths

    prompt_choice "Install target" "1" "Local machine" "VPS / remote host"
    is_back "$REPLY" && return 10
    case "$REPLY" in
      "Local machine")
        DEPLOYMENT_MODE="local"
        DASHBOARD_MODE="paired"
        CUSTOM_BIND_HOST="127.0.0.1"
        CONTROL_UI_ALLOWED_ORIGINS=()
        TRUSTED_PROXIES=()
        ;;
      "VPS / remote host")
        DEPLOYMENT_MODE="vps"
        CUSTOM_BIND_HOST="0.0.0.0"

        prompt_choice "Dashboard access mode" "1" "Secure paired dashboard" "Direct token access"
        is_back "$REPLY" && return 10
        case "$REPLY" in
          "Secure paired dashboard") DASHBOARD_MODE="paired" ;;
          "Direct token access") DASHBOARD_MODE="token" ;;
        esac

        prompt_text "Allowed dashboard origin(s) (comma-separated)" "https://dashboard.example.com" "yes"
        is_back "$REPLY" && return 10
        split_csv_into_array "$REPLY" CONTROL_UI_ALLOWED_ORIGINS
        if (( ${#CONTROL_UI_ALLOWED_ORIGINS[@]} == 0 )); then
          warn "At least one allowed origin is required for VPS mode."
          continue
        fi
        local origin
        for origin in "${CONTROL_UI_ALLOWED_ORIGINS[@]}"; do
          if ! validate_url "$origin"; then
            warn "Allowed origin must be a valid http or https URL: ${origin}"
            continue 2
          fi
        done

        prompt_text "Trusted proxy IP/CIDR list (comma-separated)" "127.0.0.1/32,::1/128" "yes"
        is_back "$REPLY" && return 10
        split_csv_into_array "$REPLY" TRUSTED_PROXIES
        if (( ${#TRUSTED_PROXIES[@]} == 0 )); then
          warn "At least one trusted proxy entry is required for VPS mode."
          continue
        fi
        ;;
    esac

    confirm_step \
      "Setup Summary" \
      "Install directory: ${INSTALL_DIR}
Profile: ${PROFILE_NAME}
State directory: ${STATE_DIR}
Deployment mode: ${DEPLOYMENT_MODE}
Dashboard mode: ${DASHBOARD_MODE}
Bind host: ${CUSTOM_BIND_HOST}
Allowed origins: $(join_by ', ' "${CONTROL_UI_ALLOWED_ORIGINS[@]}")
Trusted proxies: $(join_by ', ' "${TRUSTED_PROXIES[@]}")"

    case "$REPLY" in
      continue) return 0 ;;
      edit) continue ;;
      back) return 10 ;;
    esac
  done
}

step_llm() {
  while true; do
    section "UX Prompts — LLM"

    prompt_yes_no "Configure LLM now?" "y"
    is_back "$REPLY" && return 10
    LLM_CONFIGURE="$REPLY"

    if [[ "$LLM_CONFIGURE" == "no" ]]; then
      local ollama_model=""
      if ollama_model="$(discover_ollama_model)"; then
        LLM_RUNTIME_MODE="local"
        LLM_PROVIDER="ollama"
        LLM_AUTH_MODE="none"
        LLM_API_KEY=""
        LLM_DEFAULT_MODEL="$ollama_model"
      else
        warn "No local Ollama model was detected. To guarantee a responsive install, configure an LLM now."
        continue
      fi
    else
      LLM_RUNTIME_MODE="cloud"
      prompt_choice "Choose LLM provider" "1" "anthropic" "openai" "openrouter" "groq"
      is_back "$REPLY" && return 10
      LLM_PROVIDER="$REPLY"

      prompt_choice "Choose auth method" "1" "api_key" "oauth"
      is_back "$REPLY" && return 10
      LLM_AUTH_MODE="$REPLY"

      prompt_text "Default model for all enabled agents" "$(default_model_for_provider "$LLM_PROVIDER")" "yes"
      is_back "$REPLY" && return 10
      LLM_DEFAULT_MODEL="$REPLY"

      if [[ "$LLM_AUTH_MODE" == "api_key" ]]; then
        prompt_secret "API key for ${LLM_PROVIDER}"
        is_back "$REPLY" && return 10
        validate_api_key "$REPLY" || { warn "API key cannot be empty."; continue; }
        LLM_API_KEY="$REPLY"
      else
        LLM_API_KEY=""
      fi

      validate_provider_model_available "$LLM_PROVIDER" "$LLM_DEFAULT_MODEL" || {
        warn "Selected model is not available for provider ${LLM_PROVIDER}. Re-enter the provider or model."
        continue
      }
    fi

    confirm_step \
      "LLM Summary" \
      "Configure now: ${LLM_CONFIGURE}
Runtime mode: ${LLM_RUNTIME_MODE}
Provider: ${LLM_PROVIDER}
Auth method: ${LLM_AUTH_MODE}
Default model: ${LLM_DEFAULT_MODEL}
Credential: $(if [[ "$LLM_AUTH_MODE" == "api_key" ]]; then mask_secret "$LLM_API_KEY"; else printf '%s' 'OpenClaw login flow'; fi)"

    case "$REPLY" in
      continue) return 0 ;;
      edit) continue ;;
      back) return 10 ;;
    esac
  done
}

capture_agent_prompts() {
  local agent_id="$1"
  local role_label="${AGENT_ROLE_LABEL[$agent_id]}"
  local default_name="${AGENT_DEFAULT_NAME[$agent_id]}"

  prompt_text "What do you want to name the ${role_label}?" "$default_name" "yes"
  is_back "$REPLY" && return 10
  AGENT_NAME["$agent_id"]="$REPLY"

  while true; do
    prompt_secret "${role_label} Discord bot token"
    is_back "$REPLY" && return 10
    if validate_discord_token "$REPLY"; then
      AGENT_TOKEN["$agent_id"]="$REPLY"
      break
    fi
    warn "Discord bot token format looks invalid. Re-enter the token."
  done

  while true; do
    prompt_text "${role_label} Discord Server ID (Guild ID)" "${AGENT_GUILD_ID[$agent_id]:-}" "yes"
    is_back "$REPLY" && return 10
    if validate_discord_id "$REPLY"; then
      AGENT_GUILD_ID["$agent_id"]="$REPLY"
      break
    fi
    warn "Discord Server ID (Guild ID) must be 17 to 20 digits."
  done

  while true; do
    prompt_text "${role_label} Discord Channel ID" "${AGENT_CHANNEL_ID[$agent_id]:-}" "yes"
    is_back "$REPLY" && return 10
    if validate_discord_id "$REPLY"; then
      AGENT_CHANNEL_ID["$agent_id"]="$REPLY"
      break
    fi
    warn "Discord Channel ID must be 17 to 20 digits."
  done

  return 0
}

step_main_agent() {
  while true; do
    section "UX Prompts — Main Agent"
    AGENT_ENABLED["$PRIMARY_AGENT_ID"]="yes"

    capture_agent_prompts "$PRIMARY_AGENT_ID" || return 10

    confirm_step \
      "Main Agent Summary" \
      "Role: ${AGENT_ROLE_LABEL[$PRIMARY_AGENT_ID]}
Name: ${AGENT_NAME[$PRIMARY_AGENT_ID]}
Guild ID: ${AGENT_GUILD_ID[$PRIMARY_AGENT_ID]}
Channel ID: ${AGENT_CHANNEL_ID[$PRIMARY_AGENT_ID]}
Bot token: $(mask_secret "${AGENT_TOKEN[$PRIMARY_AGENT_ID]}")"

    case "$REPLY" in
      continue) return 0 ;;
      edit) continue ;;
      back) return 10 ;;
    esac
  done
}

step_optional_agents() {
  while true; do
    section "UX Prompts — Optional Agents"

    local id
    for id in "${ACTIVE_AGENT_LIST[@]}"; do
      [[ "$id" == "$PRIMARY_AGENT_ID" ]] && continue

      prompt_yes_no "Enable the ${AGENT_ROLE_LABEL[$id]}?" "y"
      is_back "$REPLY" && return 10
      AGENT_ENABLED["$id"]="$REPLY"

      if [[ "${AGENT_ENABLED[$id]}" == "yes" ]]; then
        capture_agent_prompts "$id" || return 10
      else
        AGENT_NAME["$id"]=""
        AGENT_TOKEN["$id"]=""
        AGENT_GUILD_ID["$id"]=""
        AGENT_CHANNEL_ID["$id"]=""
      fi
    done

    local summary="Enabled agents:"
    for id in "${ACTIVE_AGENT_LIST[@]}"; do
      if [[ "$id" == "$PRIMARY_AGENT_ID" || "${AGENT_ENABLED[$id]:-no}" == "yes" ]]; then
        summary="${summary}
- ${AGENT_ROLE_LABEL[$id]}: ${AGENT_NAME[$id]} (${id})"
      fi
    done

    confirm_step "Optional Agents Summary" "$summary"
    case "$REPLY" in
      continue) return 0 ;;
      edit) continue ;;
      back) return 10 ;;
    esac
  done
}

step_final_review() {
  while true; do
    section "UX Prompts — Final Review"
    local agent_lines=""
    local id
    for id in "${ACTIVE_AGENT_LIST[@]}"; do
      if [[ "$id" == "$PRIMARY_AGENT_ID" || "${AGENT_ENABLED[$id]:-no}" == "yes" ]]; then
        agent_lines="${agent_lines}
- ${id}: ${AGENT_NAME[$id]} | guild ${AGENT_GUILD_ID[$id]} | channel ${AGENT_CHANNEL_ID[$id]}"
      fi
    done

    confirm_step \
      "Install Review" \
      "Source repo: ${SOURCE_DIR}
Install directory: ${INSTALL_DIR}
Profile: ${PROFILE_NAME}
State directory: ${STATE_DIR}
OpenClaw version: ${OPENCLAW_VERSION}
Schema source: live CLI ${OPENCLAW_VERSION}
Deployment mode: ${DEPLOYMENT_MODE}
Dashboard mode: ${DASHBOARD_MODE}
LLM mode: ${LLM_RUNTIME_MODE}
Provider: ${LLM_PROVIDER}
Default model: ${LLM_DEFAULT_MODEL}
Agents:${agent_lines}"

    case "$REPLY" in
      continue) return 0 ;;
      edit) return 20 ;;
      back) return 10 ;;
    esac
  done
}

sync_repo_source() {
  section "Setup — Repo Sync"

  mkdir -p "$(dirname "$INSTALL_DIR")"

  if [[ "$SOURCE_DIR" == "$INSTALL_DIR" ]]; then
    success "Using repo in place: ${INSTALL_DIR}"
    return 0
  fi

  if [[ -d "$INSTALL_DIR" ]]; then
    warn "Install directory already exists: ${INSTALL_DIR}"
    prompt_yes_no "Overwrite existing files in this directory from the current repo source?" "n"
    [[ "$REPLY" == "yes" ]] || fatal "Install cancelled."
  fi

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude ".git" \
      --exclude "node_modules" \
      --exclude ".DS_Store" \
      "${SOURCE_DIR}/" "${INSTALL_DIR}/" >>"$LOG_FILE" 2>&1
  else
    mkdir -p "$INSTALL_DIR"
    tar -C "$SOURCE_DIR" \
      --exclude=".git" \
      --exclude="node_modules" \
      --exclude=".DS_Store" \
      -cf - . | tar -C "$INSTALL_DIR" -xf -
  fi

  success "Repo synced to ${INSTALL_DIR}"
}

prepare_runtime_layout() {
  section "Setup — Runtime Layout"
  mkdir -p "$STATE_DIR"

  local id
  while IFS= read -r id; do
    mkdir -p "$(agent_dir_path "$id")"
    mkdir -p "$(agent_sessions_path "$id")"
  done < <(enabled_agent_ids)

  success "Runtime directories prepared under ${STATE_DIR}"
}

validate_enabled_agents_complete() {
  local id
  while IFS= read -r id; do
    [[ -n "${AGENT_NAME[$id]:-}" ]] || fatal "Enabled agent '${id}' is missing a name."
    [[ -n "${AGENT_TOKEN[$id]:-}" ]] || fatal "Enabled agent '${id}' is missing a Discord bot token."
    [[ -n "${AGENT_GUILD_ID[$id]:-}" ]] || fatal "Enabled agent '${id}' is missing a Discord Server ID (Guild ID)."
    [[ -n "${AGENT_CHANNEL_ID[$id]:-}" ]] || fatal "Enabled agent '${id}' is missing a Discord Channel ID."
  done < <(enabled_agent_ids)
}

validate_provider_model_available() {
  local provider="$1"
  local model="$2"
  local output short_model
  output="$("$OPENCLAW_CMD" models list --provider "$provider" 2>&1)" || return 1
  short_model="${model#${provider}/}"
  printf '%s' "$output" | grep -Fq "$model" && return 0
  printf '%s' "$output" | grep -Fq "$short_model"
}

write_openclaw_config() {
  section "Config Generation — openclaw.json"

  local tmp
  tmp="$(mktemp)"
  GATEWAY_TOKEN="${GATEWAY_TOKEN:-$(generate_gateway_token)}"
  validate_enabled_agents_complete

  {
    printf '{\n'
    printf '  "meta": {\n'
    printf '    "lastTouchedVersion": "%s",\n' "$(json_escape "$OPENCLAW_VERSION")"
    printf '    "lastTouchedAt": "%s"\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf '  },\n'
    printf '  "wizard": {\n'
    printf '    "lastRunAt": "%s",\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf '    "lastRunVersion": "%s",\n' "$(json_escape "$OPENCLAW_VERSION")"
    printf '    "lastRunCommand": "install.sh",\n'
    printf '    "lastRunMode": "local"\n'
    printf '  },\n'

    if [[ "$LLM_RUNTIME_MODE" == "cloud" ]]; then
      printf '  "auth": {\n'
      printf '    "profiles": {\n'
      printf '      ":default": {\n'
      printf '        "provider": "%s",\n' "$(json_escape "$LLM_PROVIDER")"
      printf '        "mode": "%s"\n' "$(json_escape "$LLM_AUTH_MODE")"
      printf '      },\n'
      printf '      "%s:default": {\n' "$(json_escape "$LLM_PROVIDER")"
      printf '        "provider": "%s",\n' "$(json_escape "$LLM_PROVIDER")"
      printf '        "mode": "%s"\n' "$(json_escape "$LLM_AUTH_MODE")"
      printf '      }\n'
      printf '    },\n'
      printf '    "order": {\n'
      printf '      "%s": [":default", "%s:default"]\n' "$(json_escape "$LLM_PROVIDER")" "$(json_escape "$LLM_PROVIDER")"
      printf '    }\n'
      printf '  },\n'
    fi

    printf '  "ui": {\n'
    printf '    "assistant": {\n'
    printf '      "name": "%s"\n' "$(json_escape "${AGENT_NAME[$PRIMARY_AGENT_ID]}")"
    printf '    }\n'
    printf '  },\n'

    printf '  "agents": {\n'
    printf '    "defaults": {\n'
    printf '      "workspace": "%s"' "$(json_escape "$(main_agent_workspace)")"
    if [[ -n "$LLM_DEFAULT_MODEL" ]]; then
      printf ',\n      "model": {\n'
      printf '        "primary": "%s"\n' "$(json_escape "$LLM_DEFAULT_MODEL")"
      printf '      }\n'
    else
      printf '\n'
    fi
    printf '    },\n'
    printf '    "list": [\n'

    local first_agent=1
    local id
    while IFS= read -r id; do
      (( first_agent )) || printf ',\n'
      first_agent=0
      printf '      {\n'
      printf '        "id": "%s",\n' "$(json_escape "$id")"
      if [[ "$id" == "$PRIMARY_AGENT_ID" ]]; then
        printf '        "default": true,\n'
      fi
      printf '        "name": "%s",\n' "$(json_escape "${AGENT_NAME[$id]}")"
      printf '        "workspace": "%s",\n' "$(json_escape "$(agent_workspace "$id")")"
      printf '        "agentDir": "%s",\n' "$(json_escape "$(agent_dir_path "$id")")"
      if [[ -n "$LLM_DEFAULT_MODEL" ]]; then
        printf '        "model": "%s",\n' "$(json_escape "$LLM_DEFAULT_MODEL")"
      fi
      printf '        "identity": {\n'
      printf '          "name": "%s"\n' "$(json_escape "${AGENT_NAME[$id]}")"
      printf '        }\n'
      printf '      }'
    done < <(enabled_agent_ids)

    printf '\n    ]\n'
    printf '  },\n'

    printf '  "bindings": [\n'
    local first_binding=1
    while IFS= read -r id; do
      (( first_binding )) || printf ',\n'
      first_binding=0
      printf '    {\n'
      printf '      "type": "route",\n'
      printf '      "agentId": "%s",\n' "$(json_escape "$id")"
      printf '      "comment": "%s",\n' "$(json_escape "${AGENT_ROLE_LABEL[$id]}")"
      printf '      "match": {\n'
      printf '        "channel": "discord",\n'
      printf '        "accountId": "%s"\n' "$(json_escape "$id")"
      printf '      }\n'
      printf '    }'
    done < <(enabled_agent_ids)
    printf '\n  ],\n'

    printf '  "channels": {\n'
    printf '    "discord": {\n'
    printf '      "enabled": true,\n'
    printf '      "groupPolicy": "allowlist",\n'
    printf '      "accounts": {\n'
    local first_account=1
    while IFS= read -r id; do
      (( first_account )) || printf ',\n'
      first_account=0
      printf '        "%s": {\n' "$(json_escape "$id")"
      printf '          "name": "%s",\n' "$(json_escape "${AGENT_NAME[$id]}")"
      printf '          "enabled": true,\n'
      printf '          "token": "%s",\n' "$(json_escape "${AGENT_TOKEN[$id]}")"
      printf '          "groupPolicy": "allowlist",\n'
      printf '          "dmPolicy": "disabled",\n'
      printf '          "guilds": {\n'
      printf '            "%s": {\n' "$(json_escape "${AGENT_GUILD_ID[$id]}")"
      printf '              "requireMention": false,\n'
      printf '              "channels": {\n'
      printf '                "%s": {\n' "$(json_escape "${AGENT_CHANNEL_ID[$id]}")"
      printf '                  "allow": true,\n'
      printf '                  "requireMention": false,\n'
      printf '                  "systemPrompt": "Always respond to messages. Never return NO_REPLY."\n'
      printf '                }\n'
      printf '              }\n'
      printf '            }\n'
      printf '          }\n'
      printf '        }'
    done < <(enabled_agent_ids)
    printf '\n      }\n'
    printf '    }\n'
    printf '  },\n'

    printf '  "gateway": {\n'
    printf '    "mode": "local",\n'
    printf '    "port": %s,\n' "$GATEWAY_PORT"
    if [[ "$DEPLOYMENT_MODE" == "vps" ]]; then
      printf '    "bind": "custom",\n'
      printf '    "customBindHost": "%s",\n' "$(json_escape "$CUSTOM_BIND_HOST")"
    else
      printf '    "bind": "loopback",\n'
    fi
    printf '    "auth": {\n'
    printf '      "mode": "token",\n'
    printf '      "token": "%s"\n' "$(json_escape "$GATEWAY_TOKEN")"
    printf '    }'

    if [[ "$DEPLOYMENT_MODE" == "vps" ]]; then
      printf ',\n    "controlUi": {\n'
      printf '      "enabled": true,\n'
      printf '      "allowedOrigins": ['
      local i
      for i in "${!CONTROL_UI_ALLOWED_ORIGINS[@]}"; do
        (( i > 0 )) && printf ', '
        printf '"%s"' "$(json_escape "${CONTROL_UI_ALLOWED_ORIGINS[$i]}")"
      done
      printf '],\n'
      if [[ "$DASHBOARD_MODE" == "token" ]]; then
        printf '      "dangerouslyDisableDeviceAuth": true\n'
      else
        printf '      "dangerouslyDisableDeviceAuth": false\n'
      fi
      printf '    },\n'
      printf '    "trustedProxies": ['
      for i in "${!TRUSTED_PROXIES[@]}"; do
        (( i > 0 )) && printf ', '
        printf '"%s"' "$(json_escape "${TRUSTED_PROXIES[$i]}")"
      done
      printf ']\n'
    else
      printf '\n'
    fi

    printf '  }\n'
    printf '}\n'
  } >"$tmp"

  mv "$tmp" "$CONFIG_PATH"
  validate_generated_config_schema "$CONFIG_PATH"
  success "Wrote ${CONFIG_PATH}"
}

validate_generated_config_schema() {
  local config_path="$1"
  if ! node "$SCHEMA_VALIDATOR_JS" "$OPENCLAW_SCHEMA_PATH" "$config_path" >>"$LOG_FILE" 2>&1; then
    cat "$LOG_FILE"
    fatal "Schema validation failed — see errors above"
  fi
}

write_api_key_auth_store() {
  local target_path="$1"
  local tmp
  tmp="$(mktemp)"
  {
    printf '{\n'
    printf '  "version": 1,\n'
    printf '  "profiles": {\n'
    printf '    ":default": {\n'
    printf '      "provider": "%s",\n' "$(json_escape "$LLM_PROVIDER")"
    printf '      "type": "api_key",\n'
    printf '      "key": "%s"\n' "$(json_escape "$LLM_API_KEY")"
    printf '    },\n'
    printf '    "%s:default": {\n' "$(json_escape "$LLM_PROVIDER")"
    printf '      "provider": "%s",\n' "$(json_escape "$LLM_PROVIDER")"
    printf '      "type": "api_key",\n'
    printf '      "key": "%s"\n' "$(json_escape "$LLM_API_KEY")"
    printf '    }\n'
    printf '  }\n'
    printf '}\n'
  } >"$tmp"
  mv "$tmp" "$target_path"
}

write_empty_auth_store() {
  local target_path="$1"
  printf '{\n  "version": 1,\n  "profiles": {}\n}\n' >"$target_path"
}

validate_auth_store() {
  local auth_store_path="$1"
  local require_default="${2:-yes}"
  AUTH_STORE_PATH="$auth_store_path" REQUIRE_DEFAULT="$require_default" node <<'NODE'
const fs = require("node:fs");
const path = process.env.AUTH_STORE_PATH;
const requireDefault = process.env.REQUIRE_DEFAULT === "yes";
const data = JSON.parse(fs.readFileSync(path, "utf8"));
if (data.version !== 1) {
  throw new Error("auth-profiles.json must use version 1");
}
if (!data.profiles || typeof data.profiles !== "object" || Array.isArray(data.profiles)) {
  throw new Error("auth-profiles.json must contain an object 'profiles'");
}
if (requireDefault) {
  const profile = data.profiles[":default"];
  if (!profile || profile.type !== "api_key" || typeof profile.key !== "string" || profile.key.length === 0) {
    throw new Error("auth-profiles.json :default profile is invalid for api_key mode");
  }
  if (typeof profile.provider !== "string" || profile.provider.length === 0) {
    throw new Error("auth-profiles.json :default provider must be a non-empty string");
  }
  const providerAlias = data.profiles[profile.provider + ":default"];
  if (!providerAlias || providerAlias.type !== "api_key") {
    throw new Error("auth-profiles.json provider alias is missing for api_key mode");
  }
}
NODE
}

ensure_default_auth_aliases() {
  local auth_store_path="$1"
  local provider="$2"
  AUTH_STORE_PATH="$auth_store_path" AUTH_PROVIDER="$provider" node <<'NODE'
const fs = require("node:fs");
const path = process.env.AUTH_STORE_PATH;
const provider = process.env.AUTH_PROVIDER;
const raw = fs.existsSync(path) ? fs.readFileSync(path, "utf8") : '{"version":1,"profiles":{}}';
const store = JSON.parse(raw || '{"version":1,"profiles":{}}');
store.version = 1;
store.profiles = store.profiles || {};

let selected = store.profiles[provider + ":default"] || null;
if (!selected) {
  for (const [id, profile] of Object.entries(store.profiles)) {
    if (profile && profile.provider === provider) {
      selected = profile;
      if (!store.profiles[provider + ":default"]) {
        store.profiles[provider + ":default"] = profile;
      }
      break;
    }
  }
}

if (selected) {
  store.profiles[":default"] = selected;
}

fs.writeFileSync(path, JSON.stringify(store, null, 2));
NODE
}

provision_auth_profiles() {
  section "Config Generation — auth-profiles.json"

  local main_auth_store
  main_auth_store="$(agent_dir_path "$PRIMARY_AGENT_ID")/auth-profiles.json"

  case "$LLM_RUNTIME_MODE" in
    local)
      write_empty_auth_store "$main_auth_store"
      ;;
    cloud)
      if [[ "$LLM_AUTH_MODE" == "api_key" ]]; then
        write_api_key_auth_store "$main_auth_store"
        validate_auth_store "$main_auth_store" "yes"
      else
        write_empty_auth_store "$main_auth_store"
        info "Starting OpenClaw OAuth login for ${LLM_PROVIDER}"
        "$OPENCLAW_CMD" --profile "$PROFILE_NAME" models auth login --provider "$LLM_PROVIDER" \
          >>"$LOG_FILE" 2>&1 < /dev/tty || fatal "OAuth login failed for ${LLM_PROVIDER}."
        ensure_default_auth_aliases "$main_auth_store" "$LLM_PROVIDER"
        validate_auth_store "$main_auth_store" "no"
      fi
      ;;
    *)
      write_empty_auth_store "$main_auth_store"
      ;;
  esac

  local id
  while IFS= read -r id; do
    [[ "$id" == "$PRIMARY_AGENT_ID" ]] && continue
    cp "$main_auth_store" "$(agent_dir_path "$id")/auth-profiles.json"
  done < <(enabled_agent_ids)

  success "Provisioned auth stores for enabled agents"
}

validate_config_or_repair() {
  local attempt="${1:-1}"
  local validation
  validation="$("$OPENCLAW_CMD" --profile "$PROFILE_NAME" config validate --json 2>&1)" || true
  if [[ "$validation" == *'"valid":true'* ]]; then
    success "OpenClaw config validation passed"
    return 0
  fi

  warn "Config validation failed on attempt ${attempt}. Rewriting config and running doctor repair."
  write_openclaw_config
  "$OPENCLAW_CMD" --profile "$PROFILE_NAME" doctor --repair --yes --non-interactive >>"$LOG_FILE" 2>&1 || true

  validation="$("$OPENCLAW_CMD" --profile "$PROFILE_NAME" config validate --json 2>&1)" || true
  [[ "$validation" == *'"valid":true'* ]] || fatal "OpenClaw config validation failed after repair: ${validation}"
  success "OpenClaw config validation repaired successfully"
}

show_retry_failure() {
  local summary="$1"
  local details="$2"
  error "$summary"
  if [[ -n "$LAST_FAILURE_OUTPUT" ]]; then
    printf "%sDetails:%s %s\n" "${YELLOW}" "${RESET}" "$LAST_FAILURE_OUTPUT" | tee -a "$LOG_FILE" >&2
  fi
  printf "%sSuggested fix:%s %s\n" "${YELLOW}" "${RESET}" "$details" | tee -a "$LOG_FILE" >&2
  printf "%sLog:%s %s\n" "${DIM}" "${RESET}" "$LOG_FILE" >&2
  exit 1
}

check_gateway_health() {
  LAST_FAILURE_OUTPUT="$("$OPENCLAW_CMD" --profile "$PROFILE_NAME" health --json 2>&1)" || return 1
  [[ "$LAST_FAILURE_OUTPUT" == *'"ok": true'* || "$LAST_FAILURE_OUTPUT" == *'"ok":true'* ]] || return 1
  [[ "$LAST_FAILURE_OUTPUT" != *'"error"'* ]]
}

check_gateway_external_accessibility() {
  [[ "$DEPLOYMENT_MODE" == "vps" ]] || return 0
  require_cmd curl
  LAST_FAILURE_OUTPUT="$(curl -sS -w $'\n%{http_code}' "http://127.0.0.1:${GATEWAY_PORT}/health" 2>&1)" || return 1
  local body status_code
  body="${LAST_FAILURE_OUTPUT%$'\n'*}"
  status_code="${LAST_FAILURE_OUTPUT##*$'\n'}"
  [[ "$status_code" == "200" ]] || return 1
  [[ "$body" == *'"ok":true'* || "$body" == *'"ok": true'* || "$body" == *'ok'* ]]
}

install_gateway_service() {
  section "Runtime Checks — Gateway"

  "$OPENCLAW_CMD" --profile "$PROFILE_NAME" gateway install --force --runtime node --token "$GATEWAY_TOKEN" \
    >>"$LOG_FILE" 2>&1 || fatal "Failed to install the OpenClaw gateway service."

  "$OPENCLAW_CMD" --profile "$PROFILE_NAME" gateway start >>"$LOG_FILE" 2>&1 || true
  sleep 2

  if ! check_gateway_health; then
    warn "Gateway health probe failed. Restarting the gateway service."
    "$OPENCLAW_CMD" --profile "$PROFILE_NAME" gateway restart >>"$LOG_FILE" 2>&1 || true
    sleep 2
  fi

  check_gateway_health || show_retry_failure \
    "Gateway health check failed after retry." \
    "Confirm the host can bind port ${GATEWAY_PORT} and that the OpenClaw gateway runtime can start cleanly."

  GATEWAY_PORT="$GATEWAY_PORT" check_gateway_external_accessibility || show_retry_failure \
    "Gateway external accessibility check failed for VPS mode." \
    "Confirm firewall rules allow inbound access to port ${GATEWAY_PORT} and that the server binds to 0.0.0.0."

  success "Gateway is reachable"
}

check_discord_account() {
  local agent_id="$1"
  LAST_FAILURE_OUTPUT="$("$OPENCLAW_CMD" --profile "$PROFILE_NAME" directory self --channel discord --account "$agent_id" --json 2>&1)" || true
  [[ -n "$LAST_FAILURE_OUTPUT" && "$LAST_FAILURE_OUTPUT" != *'"error"'* && "$LAST_FAILURE_OUTPUT" != *'authentication'* && "$LAST_FAILURE_OUTPUT" != *'Invalid'* ]] || return 1
  DISCORD_SELF_JSON="$LAST_FAILURE_OUTPUT" EXPECTED_ACCOUNT_ID="$agent_id" node <<'NODE'
const raw = process.env.DISCORD_SELF_JSON || "";
const expectedAccountId = process.env.EXPECTED_ACCOUNT_ID || "";
let data;
try {
  data = JSON.parse(raw);
} catch {
  process.exit(1);
}

function find(obj, key) {
  if (!obj || typeof obj !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  for (const value of Object.values(obj)) {
    const found = find(value, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

const accountId = find(data, "accountId");
const user = find(data, "user");
const userId = user && typeof user === "object" ? user.id : find(data, "userId");
if (!accountId || String(accountId) !== expectedAccountId || !userId) {
  process.exit(1);
}
NODE
}

verify_discord_account() {
  local agent_id="$1"
  if ! check_discord_account "$agent_id"; then
    warn "Discord probe failed for ${agent_id}. Restarting gateway and retrying."
    "$OPENCLAW_CMD" --profile "$PROFILE_NAME" gateway restart >>"$LOG_FILE" 2>&1 || true
    sleep 2
  fi
  check_discord_account "$agent_id" || show_retry_failure \
    "Discord login verification failed for ${agent_id} after retry." \
    "Re-check the Discord bot token, ensure the bot is in the configured server, and confirm the channel ID is correct."
  success "Discord login verified for ${agent_id}"
}

check_llm_auth() {
  if [[ "$LLM_RUNTIME_MODE" == "local" ]]; then
    return 0
  fi

  local status
  status="$("$OPENCLAW_CMD" --profile "$PROFILE_NAME" models status --json 2>&1)" || true
  LAST_FAILURE_OUTPUT="$status"
  printf '%s' "$status" | grep -Fq "\"provider\": \"${LLM_PROVIDER}\"" || return 1
  printf '%s' "$status" | grep -Fq '"missingProvidersInUse":["' && return 1
  printf '%s' "$status" | grep -Fq 'Invalid bearer token' && return 1
  printf '%s' "$status" | grep -Fq 'authentication_error' && return 1
}

verify_llm_auth() {
  if [[ "$LLM_RUNTIME_MODE" == "local" ]]; then
    success "Local Ollama model selected; skipping cloud auth verification"
    return 0
  fi

  check_llm_auth || {
    warn "LLM auth check failed on the first attempt. Refreshing auth state and retrying."
    sleep 1
    check_llm_auth || show_retry_failure \
      "LLM auth verification failed for ${LLM_PROVIDER} after retry." \
      "Re-run the installer and confirm the API key or OAuth login for ${LLM_PROVIDER} is valid."
  }
  success "LLM auth verified for ${LLM_PROVIDER}"
}

check_agent_response() {
  local agent_id="$1"
  local expected="READY:${agent_id}"
  LAST_FAILURE_OUTPUT="$("$OPENCLAW_CMD" --profile "$PROFILE_NAME" agent --local --agent "$agent_id" \
    --message "Reply with exactly ${expected}. Do not use tools." --json 2>&1)" || true
  [[ "$LAST_FAILURE_OUTPUT" == *"READY:${agent_id}"* ]]
}

smoke_test_agent() {
  local agent_id="$1"
  if ! check_agent_response "$agent_id"; then
    warn "Agent ${agent_id} failed auth on first pass. Re-copying auth store and retrying."
    cp "$(agent_dir_path "$PRIMARY_AGENT_ID")/auth-profiles.json" "$(agent_dir_path "$agent_id")/auth-profiles.json"
    sleep 1
  fi

  check_agent_response "$agent_id" || show_retry_failure \
    "Agent smoke test failed for ${agent_id} after retry." \
    "Verify the selected model is available for ${LLM_PROVIDER} and that this agent has valid auth and Discord settings."
  success "Agent ${agent_id} responded successfully"
}

run_validation_and_smoke_tests() {
  section "Validation"
  validate_config_or_repair 1
  install_gateway_service

  local id
  while IFS= read -r id; do
    verify_discord_account "$id"
  done < <(enabled_agent_ids)

  verify_llm_auth

  section "Runtime Checks"
  while IFS= read -r id; do
    smoke_test_agent "$id"
  done < <(enabled_agent_ids)

  success "Production installer completed with all required checks passing"
  success "System is fully operational. All agents verified. No post-install fixes required."
}

main() {
  load_debug_flag "$@"
  discover_source_dir
  load_tesla_version
  load_tesla_installer_metadata
  print_banner

  ensure_node
  ensure_openclaw
  detect_schema

  local step=1
  while true; do
    case "$step" in
      1)
        if step_setup; then
          step=2
        else
          step=1
        fi
        ;;
      2)
        if step_llm; then
          step=3
        else
          step=1
        fi
        ;;
      3)
        if step_main_agent; then
          step=4
        else
          step=2
        fi
        ;;
      4)
        if step_optional_agents; then
          step=5
        else
          step=3
        fi
        ;;
      5)
        if step_final_review; then
          break
        else
          if [[ "$?" -eq 20 ]]; then
            step=1
          else
            step=4
          fi
        fi
        ;;
    esac
  done

  sync_repo_source
  prepare_runtime_layout
  write_openclaw_config
  provision_auth_profiles
  run_validation_and_smoke_tests
}

main "$@"
