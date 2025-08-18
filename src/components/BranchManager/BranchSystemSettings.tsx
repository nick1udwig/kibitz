import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
// Badge component inline replacement
import { GitBranch, Settings, Zap, Shield, Archive } from 'lucide-react';
import { useBranchStore } from '../../stores/branchStore';
import { useCheckpointStore } from '../../stores/checkpointStore';

// Simple Badge component replacement
const Badge: React.FC<{ variant?: string; children: React.ReactNode }> = ({ variant, children }) => (
  <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
    variant === 'default' ? 'bg-primary text-primary-foreground' : 
    variant === 'outline' ? 'border border-border text-foreground' :
    'bg-secondary text-secondary-foreground'
  }`}>
    {children}
  </span>
);

export const BranchSystemSettings: React.FC = () => {
  const { config: branchConfig, updateConfig: updateBranchConfig } = useBranchStore();
  const { config: checkpointConfig, updateConfig: updateCheckpointConfig } = useCheckpointStore();

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Branch System Configuration
        </CardTitle>
        <CardDescription>
          Control which automatic branch creation systems are active
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Auto-Branch System */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                <h4 className="font-medium">Auto-Branch Creation</h4>
                <Badge variant={branchConfig.autoCreateBranches ? "default" : "secondary"}>
                  {branchConfig.autoCreateBranches ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Automatically create `iteration/` branches for file changes
              </p>
            </div>
            <Switch
              checked={branchConfig.autoCreateBranches}
              onCheckedChange={(checked) => 
                updateBranchConfig({ autoCreateBranches: checked })
              }
            />
          </div>
          
          {branchConfig.autoCreateBranches && (
            <div className="pl-6 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>File change threshold:</span>
                <Badge variant="outline">{branchConfig.changeThreshold} files</Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateBranchConfig({ 
                  changeThreshold: branchConfig.changeThreshold === 2 ? 5 : 2 
                })}
              >
                Toggle threshold ({branchConfig.changeThreshold === 2 ? '2→5' : '5→2'})
              </Button>
            </div>
          )}
        </div>

        {/* Auto-Checkpoint System */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                <h4 className="font-medium">Auto-Checkpoint Creation</h4>
                <Badge variant={checkpointConfig.autoCheckpointEnabled ? "default" : "secondary"}>
                  {checkpointConfig.autoCheckpointEnabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Automatically create `checkpoint/` branches for substantial changes
              </p>
            </div>
            <Switch
              checked={checkpointConfig.autoCheckpointEnabled}
              onCheckedChange={(checked) => 
                updateCheckpointConfig({ autoCheckpointEnabled: checked })
              }
            />
          </div>
          
          {checkpointConfig.autoCheckpointEnabled && (
            <div className="pl-6 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Max checkpoints:</span>
                <Badge variant="outline">{checkpointConfig.maxCheckpoints}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Frequency:</span>
                <Badge variant="outline">{checkpointConfig.checkpointFrequency}</Badge>
              </div>
            </div>
          )}
        </div>

        {/* Backup System Status */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Archive className="h-4 w-4" />
                <h4 className="font-medium">Backup Branch Creation</h4>
                <Badge variant="secondary">Disabled</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Creates `backup/` branches before operations (currently disabled for performance)
              </p>
            </div>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        {/* Quick Presets */}
        <div className="border-t pt-4">
          <h4 className="font-medium mb-3">Quick Presets</h4>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                updateBranchConfig({ autoCreateBranches: false });
                updateCheckpointConfig({ autoCheckpointEnabled: false });
              }}
            >
              🔒 Minimal (No auto-branches)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                updateBranchConfig({ autoCreateBranches: true, changeThreshold: 5 });
                updateCheckpointConfig({ autoCheckpointEnabled: false });
              }}
            >
              ⚖️ Balanced (Only iterations)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                updateBranchConfig({ autoCreateBranches: true, changeThreshold: 2 });
                updateCheckpointConfig({ autoCheckpointEnabled: true });
              }}
            >
              🚀 Full Auto (All systems)
            </Button>
          </div>
        </div>

        {/* Current Status */}
        <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
          <h4 className="font-medium text-sm mb-2 text-green-800">✅ Fixed: All Auto-Branch Systems Disabled</h4>
          <div className="text-xs space-y-1 text-green-700">
            <div>🔒 Auto-commit system: <span className="font-mono">Single commits only</span></div>
            <div>🔒 Auto-branches: <span className="font-mono">Disabled</span></div>
            <div>🔒 Auto-checkpoints: <span className="font-mono">Disabled</span></div>
            <div>🔒 Auto-backups: <span className="font-mono">Disabled</span></div>
            <div className="mt-2 text-xs font-medium text-green-800">
              ⚡ Result: Only ONE commit per change, no multiple branches!
            </div>
          </div>
        </div>

        {/* Manual Branch Creation Still Available */}
        <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
          <h4 className="font-medium text-sm mb-2 text-blue-800">ℹ️ Manual Branch Management Available</h4>
          <div className="text-xs space-y-1 text-blue-700">
            <div>✅ Manual branch creation: <span className="font-mono">Available</span></div>
            <div>✅ Branch switching: <span className="font-mono">Available</span></div>
            <div>✅ Manual checkpoints: <span className="font-mono">Available</span></div>
            <div>✅ Git commits: <span className="font-mono">Working normally</span></div>
          </div>
        </div>

        {/* Re-enable Options */}
        <div className="border-t pt-4">
          <h4 className="font-medium mb-3">Re-enable Auto-Systems (Advanced)</h4>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>⚠️ To re-enable auto-branch creation, you&apos;ll need to:</p>
            <ul className="list-disc list-inside space-y-1 text-xs ml-4">
              <li>Edit `src/lib/branchService.ts` - uncomment autoCreateBranchIfNeeded</li>
              <li>Edit `src/lib/checkpointRollbackService.ts` - uncomment createAutoCheckpoint</li>
              <li>Edit `src/stores/checkpointStore.ts` - uncomment createAutoCheckpointAfterOperation</li>
              <li>Change configs back to `autoCreateBranches: true`</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}; 