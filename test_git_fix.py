#!/usr/bin/env python3
"""
Test script to verify Git initialization is working after BashCommand fix.
This creates a simple test file to trigger the Git initialization process.
"""

import os
import time
from datetime import datetime

def main():
    print("🧪 Testing Git initialization after BashCommand fix...")
    print(f"⏰ Test started at: {datetime.now().isoformat()}")
    
    # Create a simple test file
    test_content = f"""
# Git Test File

This file was created at {datetime.now().isoformat()} to test Git initialization.

## Expected Behavior:
1. Git should be initialized in the project directory
2. This file should be detected as a change
3. Auto-commit should create a branch after 3 minutes
4. Branch should be visible in the project

## Fixes Applied:
- Added 'type: BashCommand' field to BashCommand calls in gitService.ts
- Updated rootStore to preserve type field when processing BashCommand
- Fixed both project and non-project context handling

## Test Status:
- File created: ✅
- Git init: Pending...
- Branch creation: Pending...
"""
    
    with open('test_git_functionality.md', 'w') as f:
        f.write(test_content)
    
    print("✅ Created test_git_functionality.md")
    print("🔍 Check browser console for Git initialization logs")
    print("⏰ Auto-commit should trigger in 3 minutes if Git init works")
    
    # Show current working directory
    print(f"📁 Current directory: {os.getcwd()}")
    
    # List files in current directory
    print("📄 Files in current directory:")
    for file in os.listdir('.'):
        if os.path.isfile(file):
            print(f"  - {file}")

if __name__ == "__main__":
    main() 