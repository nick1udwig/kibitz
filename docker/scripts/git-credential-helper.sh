#!/bin/bash

# ============================================================================
# Git Credential Helper for Docker Environment
# Provides GitHub authentication using environment variables
# ============================================================================

set -euo pipefail

# Function to log with timestamp
log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [git-credential-helper] $1" >&2
}

# Function to handle credential operations
handle_credential_operation() {
    local operation="$1"
    
    case "$operation" in
        get)
            # Read input from Git
            while IFS= read -r line; do
                case "$line" in
                    protocol=*)
                        protocol="${line#protocol=}"
                        ;;
                    host=*)
                        host="${line#host=}"
                        ;;
                    username=*)
                        username="${line#username=}"
                        ;;
                    password=*)
                        password="${line#password=}"
                        ;;
                    "")
                        # Empty line indicates end of input
                        break
                        ;;
                esac
            done
            
            # DEBUG: Log what we received from Git
            log_info "DEBUG: Git credential request - protocol: ${protocol:-none}, host: ${host:-none}, username: ${username:-none}"
            
            # Check if this is a GitHub request
            if [[ "$host" == "github.com" ]]; then
                # Use environment variable for GitHub token
                if [[ -n "${GITHUB_TOKEN:-}" ]]; then
                    log_info "Providing GitHub token for authentication"
                    log_info "DEBUG: Using GITHUB_TOKEN (length: ${#GITHUB_TOKEN})"
                    echo "protocol=https"
                    echo "host=github.com"
                    echo "username=git"
                    echo "password=$GITHUB_TOKEN"
                elif [[ -n "${GH_TOKEN:-}" ]]; then
                    log_info "Providing GitHub token (GH_TOKEN) for authentication"
                    log_info "DEBUG: Using GH_TOKEN (length: ${#GH_TOKEN})"
                    echo "protocol=https"
                    echo "host=github.com"
                    echo "username=git"
                    echo "password=$GH_TOKEN"
                else
                    log_info "No GitHub token found in environment variables"
                    log_info "DEBUG: Available env vars: GITHUB_TOKEN=${GITHUB_TOKEN:-NOT_SET}, GH_TOKEN=${GH_TOKEN:-NOT_SET}"
                    exit 1
                fi
            else
                log_info "Host $host not supported by this credential helper"
                exit 1
            fi
            ;;
        store)
            # For store operations, we don't need to do anything
            # since we're using environment variables
            log_info "Credential store operation (no-op for environment-based auth)"
            ;;
        erase)
            # For erase operations, we don't need to do anything
            # since we're using environment variables
            log_info "Credential erase operation (no-op for environment-based auth)"
            ;;
        *)
            log_info "Unknown credential operation: $operation"
            exit 1
            ;;
    esac
}

# Main execution
main() {
    local operation="${1:-}"
    
    if [[ -z "$operation" ]]; then
        log_info "Usage: $0 {get|store|erase}"
        exit 1
    fi
    
    handle_credential_operation "$operation"
}

# Execute main function
main "$@"