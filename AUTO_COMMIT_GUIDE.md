# 🚀 Auto-Commit Automation Guide

Transform your Kibitz development workflow with intelligent automatic git commits that rival Cursor and Replit's seamless version control.

## 🎯 **Overview**

The Auto-Commit system automatically creates git commits during your development process, eliminating the need for manual commit management while maintaining a clean project history.

### **Key Features**
- ✅ **Smart Triggers**: Commits after tool executions, successful builds, and tests
- ✅ **Intelligent Detection**: Recognizes when files are created/modified
- ✅ **Configurable Conditions**: Set minimum changes, delays, and filters
- ✅ **Auto Git Setup**: Automatically initializes git for new projects
- ✅ **Debouncing**: Prevents spam commits with intelligent timing
- ✅ **Custom Messages**: Configurable commit message templates
- ✅ **Auto-Push**: Automatically pushes commits to GitHub remote
- ✅ **Chat Integration**: Shows commits in conversation for easy tracking

---

## 🛠️ **Getting Started**

### 1. **Enable Auto-Commit**
1. Go to any project's **Checkpoints** tab
2. Click the **"Auto-Commit OFF"** button
3. Toggle **"Enable Auto-Commit"** to ON
4. Configure your triggers and conditions
5. Click **"Save Settings"**

### 2. **Quick Setup Recommendations**
For most users, these settings work great:
```
✅ Enable Auto-Commit: ON
✅ After Tool Execution: ON  
✅ After Successful Build: ON
✅ After Test Success: ON
❌ On File Changes: OFF (can be noisy)
❌ Time-Based: OFF (not implemented yet)

Minimum Changes: 1
Delay After Change: 5 seconds
Skip Consecutive Commits: ON
```

---

## ⚡ **Trigger Types**

### **1. After Tool Execution** (Recommended)
**When it triggers**: After any successful tool operation
**Examples**:
- Creating/editing files with `FileWriteOrEdit`
- Running build commands
- Installing packages
- Code generation tools

**Best for**: General development workflow

### **2. After Successful Build**
**When it triggers**: When tool output contains build success indicators
**Examples**:
- `npm run build` completes successfully
- `cargo build` finishes without errors
- `make` command succeeds

**Best for**: Committing after major milestones

### **3. After Test Success**  
**When it triggers**: When tests pass successfully
**Examples**:
- `npm test` passes all tests
- `pytest` completes successfully
- `go test` finishes without failures

**Best for**: Ensuring working code is committed

### **4. On File Changes** (Advanced)
**When it triggers**: When files are detected as changed
**Warning**: Can be noisy with frequent commits
**Best for**: Fine-grained tracking (use with higher delay)

---

## ⚙️ **Configuration Options**

### **Conditions Tab**

#### **Minimum Changes Required**
- **Default**: 1
- **Purpose**: Only commit if at least X files changed
- **Tip**: Set to 2+ for cleaner history

#### **Delay After Last Change**  
- **Default**: 5 seconds
- **Purpose**: Wait time before committing
- **Tip**: Increase for rapid development phases

#### **Skip Consecutive Commits**
- **Default**: ON
- **Purpose**: Prevent commits too close together
- **Tip**: Keep enabled to avoid spam

#### **Required Keywords**
- **Default**: Empty (disabled)
- **Purpose**: Only commit if tool output contains specific words
- **Examples**: `"success, completed, built, passed"`
- **Tip**: Use for stricter commit criteria

### **Advanced Tab**

#### **Commit Message Template**
- **Default**: `"Auto-commit: {trigger} - {summary}"`
- **Available placeholders**:
  - `{trigger}`: Type of trigger (tool_execution, build_success, etc.)
  - `{summary}`: Generated summary of what happened
  - `{toolName}`: Name of the tool that was executed
  - `{timestamp}`: ISO timestamp of the commit

**Example custom templates**:
```
"🤖 {summary} via {toolName}"
"[AUTO] {trigger}: {summary}"
"Checkpoint: {summary} at {timestamp}"
```

#### **Auto-Initialize Git**
- **Default**: ON
- **Purpose**: Automatically run `git init` for new projects
- **Tip**: Keep enabled for seamless workflow

#### **Auto-Push to Remote**
- **Default**: ON
- **Purpose**: Automatically push commits to GitHub after successful commit
- **Requirement**: Must have a remote origin configured (via "Create GitHub Repo" button)
- **Tip**: Keep enabled for seamless remote backup

#### **Chat Integration**
- **Commits in Chat**: Recent commits appear in the conversation
- **Visual Indicators**: Color-coded by trigger type (build, test, tool execution)
- **Quick Actions**: Copy commit hash, view details, revert (coming soon)
- **Push Status**: Shows if commit was successfully pushed to remote

---

## 🎯 **Usage Scenarios**

### **Scenario 1: Building a Web App**
```
User: "Create a React app with authentication"
AI: Creates files, runs npm install, sets up routes
→ Auto-commit: "Auto-commit: tool execution - executed FileWriteOrEdit"

User: "Add user dashboard with charts"  
AI: Creates components, installs chart library
→ Auto-commit: "Auto-commit: tool execution - executed BashCommand"

User: "Run the build to test"
AI: Runs npm run build successfully
→ Auto-commit: "Auto-commit: build success - successful build"
```

### **Scenario 2: API Development**
```
User: "Create a REST API with authentication"
AI: Sets up Flask/FastAPI, creates endpoints
→ Auto-commit: "Auto-commit: tool execution - executed FileWriteOrEdit"

User: "Add database models and migrations"
AI: Creates models, runs migrations
→ Auto-commit: "Auto-commit: tool execution - executed BashCommand"

User: "Run tests to make sure everything works"
AI: Executes test suite, all pass
→ Auto-commit: "Auto-commit: test success - tests passed"
```

---

## 🔍 **Monitoring Auto-Commits**

### **Visual Indicators**
- **Green button**: Auto-commit is enabled
- **Pulsing dot**: Auto-commit is processing
- **Status text**: Shows active triggers

### **Commit History**
Auto-commits appear in:
- Git log: `git log --oneline`
- GitHub repository (if connected)
- Checkpoints list in Kibitz

### **Log Monitoring**
Check browser console (F12) for auto-commit activity:
```
Tool execution successful, triggering auto-commit for FileWriteOrEdit
Auto-commit successful: Auto-commit: tool execution - executed FileWriteOrEdit (a1b2c3d)
```

---

## 🚨 **Troubleshooting**

### **Auto-commits not triggering?**
1. ✅ Check that auto-commit is enabled
2. ✅ Verify MCP servers are connected
3. ✅ Ensure git is initialized for the project
4. ✅ Check console logs for error messages
5. ✅ Verify minimum changes threshold is met

### **Too many commits?**
1. 🔧 Increase "Delay After Last Change"
2. 🔧 Enable "Skip Consecutive Commits"  
3. 🔧 Increase "Minimum Changes Required"
4. 🔧 Disable "On File Changes" trigger
5. 🔧 Add required keywords filter

### **Git initialization fails?**
1. 🔧 Check project directory permissions
2. 🔧 Ensure git is installed on system
3. 🔧 Verify MCP server has file system access
4. 🔧 Try manual "Initialize Git" first

### **Commits missing files?**
This was a known issue that's been fixed with:
- Enhanced file verification before commits
- Retry logic with delays
- Comprehensive file staging (`git add . && git add -A`)

---

## 🏆 **Best Practices**

### **1. Start Conservative**
Begin with only "After Tool Execution" enabled, then add more triggers as needed.

### **2. Use Meaningful Commit Messages**
Customize your commit message template to match your team's conventions.

### **3. Monitor Initially**
Watch the first few auto-commits to ensure they're working as expected.

### **4. Project-Specific Settings**
Different projects might need different auto-commit configurations.

### **5. Manual Override**
You can still create manual commits anytime - auto-commit supplements, doesn't replace.

---

## 🔮 **Future Enhancements**

### **Coming Soon**
- 🚀 **Time-based commits**: Periodic checkpoints
- 🚀 **Smart commit clustering**: Group related changes
- 🚀 **Branch management**: Auto-create feature branches
- 🚀 **Conflict resolution**: Handle merge conflicts intelligently

### **Advanced Features**
- 📊 **Commit analytics**: Track development patterns
- 🎯 **Custom triggers**: User-defined trigger conditions  
- 🔗 **Integration**: Connect with CI/CD pipelines
- 📝 **AI commit messages**: Generate semantic commit messages

---

## 🎉 **Conclusion**

With Auto-Commit enabled, you can focus on building while Kibitz automatically maintains a clean, detailed git history. No more forgotten commits or lost work - just seamless development that rivals the best coding platforms!

**Happy coding! 🚀** 