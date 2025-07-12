/**
 * 🧪 Repository Test Setup Instructions
 * 
 * Component that provides instructions for setting up test scenarios
 * to demonstrate local vs cloned repository detection.
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Copy, ExternalLink, GitBranch, FolderPlus } from 'lucide-react';

export const RepoTestInstructions: React.FC = () => {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCommand(label);
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const testCommands = [
    {
      label: 'Create Local Test Repo',
      description: 'Creates a new local repository with some sample files',
      commands: [
        'mkdir -p ~/gitrepo/projects/test-local_LocalTestRepo',
        'cd ~/gitrepo/projects/test-local_LocalTestRepo',
        'git init',
        'echo "# Local Test Repository" > README.md',
        'echo "console.log(\'Hello World\');" > app.js',
        'echo "node_modules/" > .gitignore',
        'git add .',
        'git commit -m "Initial commit for local test repo"'
      ]
    },
    {
      label: 'Clone GitHub Repo',
      description: 'Clone a small GitHub repository for testing cloned repo detection',
      commands: [
        'cd ~/gitrepo/projects',
        'git clone https://github.com/octocat/Hello-World.git test-cloned_HelloWorld',
        'cd test-cloned_HelloWorld',
        'ls -la'
      ]
    },
    {
      label: 'Create Complex Local Repo',
      description: 'Creates a more complex local repo with multiple branches and tech stack',
      commands: [
        'mkdir -p ~/gitrepo/projects/test-complex_ReactApp',
        'cd ~/gitrepo/projects/test-complex_ReactApp',
        'git init',
        'echo \'{"name": "react-test-app", "dependencies": {"react": "^18.0.0"}}\' > package.json',
        'mkdir src components tests',
        'echo "import React from \'react\';" > src/App.tsx',
        'echo "describe(\'App\', () => {});" > tests/App.test.ts',
        'echo "# React Test App" > README.md',
        'git add .',
        'git commit -m "Initial React app setup"',
        'git checkout -b feature/2024-01-15-1430',
        'echo "console.log(\'feature branch\');" > src/feature.js',
        'git add . && git commit -m "Add feature functionality"',
        'git checkout main'
      ]
    }
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <GitBranch className="h-5 w-5" />
            <span>🧪 Test Repository Setup</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-4">
            Set up test repositories to demonstrate the <strong>local vs cloned detection</strong> feature.
            Run these commands in your terminal, then test with the "Analyze Project" button above.
          </p>
          
          <div className="space-y-6">
            {testCommands.map((test, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-lg">{test.label}</h3>
                    <p className="text-sm text-gray-600">{test.description}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(test.commands.join(' && '), test.label)}
                    className="flex items-center space-x-2"
                  >
                    <Copy className="h-4 w-4" />
                    <span>{copiedCommand === test.label ? 'Copied!' : 'Copy All'}</span>
                  </Button>
                </div>
                
                <div className="bg-gray-900 rounded-lg p-3 overflow-x-auto">
                  <div className="space-y-1">
                    {test.commands.map((command, cmdIndex) => (
                      <div key={cmdIndex} className="flex items-center space-x-2">
                        <span className="text-gray-500 text-xs w-6">{cmdIndex + 1}.</span>
                        <code className="text-green-400 text-sm font-mono flex-1">{command}</code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(command, `${test.label}-${cmdIndex}`)}
                          className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Expected Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FolderPlus className="h-5 w-5" />
            <span>📊 Expected Test Results</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold text-green-600 mb-2">🏠 Local Repository</h4>
              <ul className="text-sm space-y-1">
                <li>• <strong>isCloned:</strong> false</li>
                <li>• <strong>repoUrl:</strong> undefined</li>
                <li>• <strong>Type:</strong> "Local Repository"</li>
                <li>• Shows local branch history only</li>
                <li>• No remote tracking information</li>
              </ul>
            </div>
            
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold text-blue-600 mb-2">📥 Cloned Repository</h4>
              <ul className="text-sm space-y-1">
                <li>• <strong>isCloned:</strong> true</li>
                <li>• <strong>repoUrl:</strong> GitHub URL</li>
                <li>• <strong>Type:</strong> "Cloned Repository"</li>
                <li>• Shows original commit history</li>
                <li>• Contains remote tracking info</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm text-blue-800">
              <strong>💡 Tip:</strong> After running the setup commands, create new projects in your UI 
              pointing to these directories to see the detection in action!
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Manual Test Steps */}
      <Card>
        <CardHeader>
          <CardTitle>🎯 Manual Testing Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li className="flex items-start space-x-2">
              <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">1</span>
              <div>
                <strong>Run Setup Commands:</strong> Execute the terminal commands above to create test repositories
              </div>
            </li>
            <li className="flex items-start space-x-2">
              <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">2</span>
              <div>
                <strong>Create/Select Project:</strong> In your UI, create a new project or select an existing one
              </div>
            </li>
            <li className="flex items-start space-x-2">
              <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">3</span>
              <div>
                <strong>Run Analysis:</strong> Click the "🚀 Analyze Project" button above to test the detection
              </div>
            </li>
            <li className="flex items-start space-x-2">
              <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">4</span>
              <div>
                <strong>Compare Results:</strong> Test with different project types and compare the detection results
              </div>
            </li>
          </ol>
          
          <div className="mt-4 flex space-x-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open('https://github.com/octocat/Hello-World', '_blank')}
              className="flex items-center space-x-2"
            >
              <ExternalLink className="h-4 w-4" />
              <span>View Test Repo on GitHub</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}; 