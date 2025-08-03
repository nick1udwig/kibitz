#!/usr/bin/env python3
import sys
import os

# Add ws-mcp to Python path
sys.path.insert(0, '/app/ws-mcp/src')

# Import and run ws-mcp
from ws_mcp import main

if __name__ == "__main__":
    main() 