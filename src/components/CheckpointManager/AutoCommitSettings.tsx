import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Settings, GitCommit, Clock, FileText, Zap, TestTube, GitBranch } from 'lucide-react';
import { useAutoCommitStore, AutoCommitConfig } from '../../stores/autoCommitStore';

// Simple label component since it's not available
const Label: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <label className={`text-sm font-medium ${className || ''}`}>{children}</label>
);

// Simple separator component
const Separator: React.FC<{ className?: string }> = ({ className }) => (
  <hr className={`border-gray-200 ${className || ''}`} />
);

interface AutoCommitSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AutoCommitSettings: React.FC<AutoCommitSettingsProps> = ({
  isOpen,
  onClose,
}) => {
  const { config, updateConfig, isProcessing, lastCommitTimestamp } = useAutoCommitStore();
  const [localConfig, setLocalConfig] = useState<AutoCommitConfig>(config);

  const handleSave = () => {
    updateConfig(localConfig);
    onClose();
  };

  const handleReset = () => {
    setLocalConfig(config);
  };

  if (!isOpen) return null;

  const formatLastCommit = () => {
    if (!lastCommitTimestamp) return 'Never';
    const now = new Date();
    const lastCommit = new Date(lastCommitTimestamp);
    const diffMs = now.getTime() - lastCommit.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} days ago`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              <CardTitle>Auto-Commit Settings</CardTitle>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {isProcessing && (
                <Badge variant="secondary" className="animate-pulse">
                  <GitCommit className="h-3 w-3 mr-1" />
                  Processing
                </Badge>
              )}
              <span>Last commit: {formatLastCommit()}</span>
            </div>
          </div>
          <CardDescription>
            Configure when and how automatic git commits are created during development
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <Tabs defaultValue="triggers" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="triggers">Triggers</TabsTrigger>
              <TabsTrigger value="conditions">Conditions</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            <TabsContent value="triggers" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Enable Auto-Commit</Label>
                  <p className="text-sm text-muted-foreground">
                    Master switch for all automatic commit functionality
                  </p>
                </div>
                <Switch
                  checked={localConfig.enabled}
                  onCheckedChange={(checked) =>
                    setLocalConfig(prev => ({ ...prev, enabled: checked }))
                  }
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Trigger Events</h4>
                
                <div className="grid gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      <div className="space-y-0.5">
                        <Label>After Tool Execution</Label>
                        <p className="text-xs text-muted-foreground">
                          Commit after successful file operations, builds, etc.
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={localConfig.triggers.afterToolExecution}
                      onCheckedChange={(checked) =>
                        setLocalConfig(prev => ({
                          ...prev,
                          triggers: { ...prev.triggers, afterToolExecution: checked }
                        }))
                      }
                      disabled={!localConfig.enabled}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GitCommit className="h-4 w-4" />
                      <div className="space-y-0.5">
                        <Label>After Successful Build</Label>
                        <p className="text-xs text-muted-foreground">
                          Commit when build/compilation succeeds
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={localConfig.triggers.afterSuccessfulBuild}
                      onCheckedChange={(checked) =>
                        setLocalConfig(prev => ({
                          ...prev,
                          triggers: { ...prev.triggers, afterSuccessfulBuild: checked }
                        }))
                      }
                      disabled={!localConfig.enabled}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TestTube className="h-4 w-4" />
                      <div className="space-y-0.5">
                        <Label>After Test Success</Label>
                        <p className="text-xs text-muted-foreground">
                          Commit when tests pass successfully
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={localConfig.triggers.afterTestSuccess}
                      onCheckedChange={(checked) =>
                        setLocalConfig(prev => ({
                          ...prev,
                          triggers: { ...prev.triggers, afterTestSuccess: checked }
                        }))
                      }
                      disabled={!localConfig.enabled}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      <div className="space-y-0.5">
                        <Label>On File Changes</Label>
                        <p className="text-xs text-muted-foreground">
                          Commit when files are modified (can be noisy)
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={localConfig.triggers.onFileChanges}
                      onCheckedChange={(checked) =>
                        setLocalConfig(prev => ({
                          ...prev,
                          triggers: { ...prev.triggers, onFileChanges: checked }
                        }))
                      }
                      disabled={!localConfig.enabled}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <div className="space-y-0.5">
                        <Label>Time-Based</Label>
                        <p className="text-xs text-muted-foreground">
                          Periodic commits (not yet implemented)
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={localConfig.triggers.timeBased}
                      onCheckedChange={(checked) =>
                        setLocalConfig(prev => ({
                          ...prev,
                          triggers: { ...prev.triggers, timeBased: checked }
                        }))
                      }
                      disabled={true}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="conditions" className="space-y-4">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label>Minimum Changes Required</Label>
                  <Input
                    type="number"
                    min="1"
                    value={localConfig.conditions.minimumChanges}
                    onChange={(e) =>
                      setLocalConfig(prev => ({
                        ...prev,
                        conditions: { ...prev.conditions, minimumChanges: parseInt(e.target.value) || 1 }
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum number of file changes before committing
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Delay After Last Change (seconds)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={localConfig.conditions.delayAfterLastChange / 1000}
                    onChange={(e) =>
                      setLocalConfig(prev => ({
                        ...prev,
                        conditions: { ...prev.conditions, delayAfterLastChange: (parseInt(e.target.value) || 0) * 1000 }
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Wait time before committing after the last detected change
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Skip Consecutive Commits</Label>
                    <p className="text-xs text-muted-foreground">
                      Prevent commits if the last one was very recent
                    </p>
                  </div>
                  <Switch
                    checked={localConfig.conditions.skipConsecutiveCommits}
                    onCheckedChange={(checked) =>
                      setLocalConfig(prev => ({
                        ...prev,
                        conditions: { ...prev.conditions, skipConsecutiveCommits: checked }
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Required Keywords (optional)</Label>
                  <Textarea
                    value={localConfig.conditions.requiredKeywords.join(', ')}
                    onChange={(e) =>
                      setLocalConfig(prev => ({
                        ...prev,
                        conditions: {
                          ...prev.conditions,
                          requiredKeywords: e.target.value.split(',').map(k => k.trim()).filter(k => k)
                        }
                      }))
                    }
                    placeholder="success, completed, built (comma-separated)"
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">
                    Only commit if tool output contains these keywords (leave empty to disable)
                  </p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label>Custom Commit Message Template</Label>
                  <Textarea
                    value={localConfig.commitMessageTemplate}
                    onChange={(e) =>
                      setLocalConfig(prev => ({ ...prev, commitMessageTemplate: e.target.value }))
                    }
                    placeholder="auto: {summary} ({trigger})"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Available variables: {'{trigger}'}, {'{summary}'}, {'{toolName}'}, {'{timestamp}'}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Auto-Push to Remote</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically push commits to remote repository
                    </p>
                  </div>
                  <Switch
                    checked={localConfig.autoPushToRemote}
                    onCheckedChange={(checked) =>
                      setLocalConfig(prev => ({ ...prev, autoPushToRemote: checked }))
                    }
                  />
                </div>
                
                <Separator />
                <div className="space-y-4">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <GitBranch className="h-4 w-4" />
                    Branch Management
                  </h4>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Auto-Create Branches</Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically create new branches for significant changes
                      </p>
                    </div>
                    <Switch
                      checked={localConfig.branchManagement?.enabled || false}
                      onCheckedChange={(checked) =>
                        setLocalConfig(prev => ({
                          ...prev,
                          branchManagement: {
                            enabled: checked,
                            fileThreshold: prev.branchManagement?.fileThreshold || 2,
                            lineThreshold: prev.branchManagement?.lineThreshold || 30,
                            branchPrefix: prev.branchManagement?.branchPrefix || 'auto',
                            keepHistory: prev.branchManagement?.keepHistory !== false
                          }
                        }))
                      }
                    />
                  </div>

                  {localConfig.branchManagement?.enabled && (
                    <div className="pl-4 space-y-3 border-l-2 border-blue-200">
                      <div className="space-y-2">
                        <Label>Minimum Files Changed</Label>
                        <Input
                          type="number"
                          min="1"
                          max="10"
                          value={localConfig.branchManagement?.fileThreshold || 2}
                          onChange={(e) =>
                            setLocalConfig(prev => ({
                              ...prev,
                              branchManagement: {
                                enabled: prev.branchManagement?.enabled || false,
                                fileThreshold: parseInt(e.target.value) || 2,
                                lineThreshold: prev.branchManagement?.lineThreshold || 30,
                                branchPrefix: prev.branchManagement?.branchPrefix || 'auto',
                                keepHistory: prev.branchManagement?.keepHistory !== false
                              }
                            }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Minimum number of files that must change to trigger branch creation
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Minimum Lines Changed</Label>
                        <Input
                          type="number"
                          min="5"
                          max="200"
                          value={localConfig.branchManagement?.lineThreshold || 30}
                          onChange={(e) =>
                            setLocalConfig(prev => ({
                              ...prev,
                              branchManagement: {
                                enabled: prev.branchManagement?.enabled || false,
                                fileThreshold: prev.branchManagement?.fileThreshold || 2,
                                lineThreshold: parseInt(e.target.value) || 30,
                                branchPrefix: prev.branchManagement?.branchPrefix || 'auto',
                                keepHistory: prev.branchManagement?.keepHistory !== false
                              }
                            }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Minimum number of lines that must change to trigger branch creation
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Branch Prefix</Label>
                        <Input
                          value={localConfig.branchManagement?.branchPrefix || 'auto'}
                          onChange={(e) =>
                            setLocalConfig(prev => ({
                              ...prev,
                              branchManagement: {
                                enabled: prev.branchManagement?.enabled || false,
                                fileThreshold: prev.branchManagement?.fileThreshold || 2,
                                lineThreshold: prev.branchManagement?.lineThreshold || 30,
                                branchPrefix: e.target.value || 'auto',
                                keepHistory: prev.branchManagement?.keepHistory !== false
                              }
                            }))
                          }
                          placeholder="auto"
                        />
                        <p className="text-xs text-muted-foreground">
                          Prefix for auto-created branch names (e.g., "auto/2025-01-16-1425")
                        </p>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Keep Branch History</Label>
                          <p className="text-xs text-muted-foreground">
                            Retain auto-created branches for easy rollback
                          </p>
                        </div>
                        <Switch
                          checked={localConfig.branchManagement?.keepHistory !== false}
                          onCheckedChange={(checked) =>
                            setLocalConfig(prev => ({
                              ...prev,
                              branchManagement: {
                                enabled: prev.branchManagement?.enabled || false,
                                fileThreshold: prev.branchManagement?.fileThreshold || 2,
                                lineThreshold: prev.branchManagement?.lineThreshold || 30,
                                branchPrefix: prev.branchManagement?.branchPrefix || 'auto',
                                keepHistory: checked
                              }
                            }))
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <Separator />

          <div className="flex justify-between">
            <Button variant="outline" onClick={handleReset}>
              Reset
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                Save Settings
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}; 