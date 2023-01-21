#!/bin/bash
set -eu

SCRIPT_DIR=$(cd $(dirname $0); pwd)
ln -fsn "${SCRIPT_DIR}/main.ts" "${HOME}/.local/bin/ls-manager.ts"
