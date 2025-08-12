#!/bin/bash

# First run the token setup
/app/scripts/setup-git-token.sh

# Then run the main services
exec /app/scripts/start-services.sh