#!/bin/bash

export GITHUB_TOKEN="$(security find-generic-password -s 'tesla-github-token' -w)"
export GITHUB_USERNAME="OdinClaw"

exec /opt/homebrew/bin/node ${HOME}/.openclaw-odin/tesla/scripts/weekly_export.js
