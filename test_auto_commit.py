#!/usr/bin/env python3

"""
Test script for auto-commit functionality
Creates some test files to trigger the auto-commit system
"""

import os
import time
import random
import json
from datetime import datetime

def create_test_files():
    """Create test files in src/ directory to trigger auto-commits"""
    
    # Ensure src directory exists
    os.makedirs('src', exist_ok=True)
    
    # Create a test TypeScript file
    test_ts_content = f"""
// Auto-generated test file: {datetime.now().isoformat()}
export interface TestInterface_{random.randint(1000, 9999)} {{
  id: string;
  timestamp: number;
  data: any;
}}

export const testFunction_{random.randint(1000, 9999)} = () => {{
  console.log('Test function called at: {datetime.now().isoformat()}');
  return Math.random();
}};

// Random comment: {random.randint(1, 1000000)}
"""
    
    test_file = f'src/test_file_{int(time.time())}.ts'
    with open(test_file, 'w') as f:
        f.write(test_ts_content)
    print(f"✅ Created test file: {test_file}")
    
    # Create a config.json file
    config_data = {
        "test_id": random.randint(1000, 9999),
        "timestamp": datetime.now().isoformat(),
        "settings": {
            "auto_commit_test": True,
            "random_value": random.random()
        }
    }
    
    os.makedirs('data', exist_ok=True)
    with open('data/config.json', 'w') as f:
        json.dump(config_data, f, indent=2)
    print(f"✅ Created/updated data/config.json")
    
    # Update package.json if it exists
    if os.path.exists('package.json'):
        try:
            with open('package.json', 'r') as f:
                package_data = json.load(f)
            
            # Add a test script
            if 'scripts' not in package_data:
                package_data['scripts'] = {}
            
            package_data['scripts'][f'test-auto-commit-{int(time.time())}'] = f'echo "Test script added at {datetime.now().isoformat()}"'
            
            with open('package.json', 'w') as f:
                json.dump(package_data, f, indent=2)
            print(f"✅ Updated package.json with test script")
            
        except Exception as e:
            print(f"⚠️ Could not update package.json: {e}")

def main():
    print("🔧 Auto-commit test script starting...")
    print(f"📁 Working directory: {os.getcwd()}")
    
    # Create test files
    create_test_files()
    
    print("\n🕐 Waiting for auto-commit agent to detect changes...")
    print("The auto-commit agent should create a branch within 3 minutes")
    print("Check the browser console for auto-commit agent logs")
    
    # Wait and create more changes
    for i in range(3):
        print(f"\n⏰ Waiting {60} seconds... ({i+1}/3)")
        time.sleep(60)
        
        if i < 2:  # Don't create more files on the last iteration
            print(f"🔧 Creating additional changes (round {i+2})...")
            create_test_files()
    
    print("\n✅ Test complete!")
    print("If auto-commit is working, you should see:")
    print("1. Console logs showing auto-commit agent cycles")
    print("2. New Git branches created with auto-commit- prefix")
    print("3. Commits with the changed files")

if __name__ == "__main__":
    main() 