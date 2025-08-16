import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { 
  GitBranch, 
  GitMerge, 
  GitCommit, 
  RotateCcw, 
  Plus, 
  TrendingUp, 
  Bug, 
  Beaker,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Settings,
  RefreshCw
} from 'lucide-react';
import { useBranchStore } from '../../stores/branchStore';

interface BranchManagerProps {
  projectId: string;
}

export const SimpleBranchManager: React.FC<BranchManagerProps> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRevertDialog, setShowRevertDialog] = useState(false);
  const [newBranchType, setNewBranchType] = useState<string>('feature');
  const [newBranchDescription, setNewBranchDescription] = useState('');
  const [revertTarget, setRevertTarget] = useState<string>('');

  const {
    config,
    branches,
    currentBranch,
    pendingChanges,
    isProcessing,
    lastOperation,
    updateConfig,
    detectProjectChanges,
    createProjectBranch,
    listProjectBranches,
    switchToBranch,
    revertProject,
    autoCreateBranchForProject,
    mergeProjectBranch
  } = useBranchStore();

  const projectBranches = branches[projectId] || [];
  const currentProjectBranch = currentBranch[projectId] || 'main';
  const projectChanges = pendingChanges[projectId];

  // Load branches on mount
  useEffect(() => {
    listProjectBranches(projectId);
    detectProjectChanges(projectId);
  }, [projectId, listProjectBranches, detectProjectChanges]);

  // Generate branch name with current timestamp
  const generateCurrentBranchName = (type: string): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    return `${type}/${year}-${month}-${day}-${hours}${minutes}`;
  };

  const handleCreateBranch = async () => {
    const branchName = generateCurrentBranchName(newBranchType);
    const description = newBranchDescription || `${newBranchType} branch created on ${new Date().toLocaleString()}`;

    const success = await createProjectBranch(
      projectId,
      branchName,
      newBranchType as 'feature' | 'bugfix' | 'iteration' | 'experiment', // Type assertion to avoid type mismatch
      description
    );

    if (success) {
      setShowCreateDialog(false);
      setNewBranchDescription('');
      listProjectBranches(projectId);
    }
  };

  const handleSwitchBranch = async (branchName: string) => {
    const success = await switchToBranch(projectId, branchName);
    if (success) {
      listProjectBranches(projectId);
    }
  };

  const handleMergeBranch = async (sourceBranch: string) => {
    const success = await mergeProjectBranch(projectId, sourceBranch, 'main');
    if (success) {
      listProjectBranches(projectId);
    }
  };

  const handleRevert = async () => {
    if (!revertTarget) return;

    const result = await revertProject(projectId, {
      targetBranch: revertTarget,
      createBackupBranch: true
    });

    if (result.success) {
      setShowRevertDialog(false);
      setRevertTarget('');
      listProjectBranches(projectId);
    }
  };

  const handleAutoCreateBranch = async () => {
    const result = await autoCreateBranchForProject(projectId);
    if (result.created) {
      listProjectBranches(projectId);
    }
  };

  const getBranchTypeIcon = (type: string) => {
    switch (type) {
      case 'feature':
        return <TrendingUp className="h-4 w-4" />;
      case 'bugfix':
        return <Bug className="h-4 w-4" />;
      case 'experiment':
        return <Beaker className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getBranchTypeColor = (type: string) => {
    switch (type) {
      case 'feature':
        return 'text-blue-600 bg-blue-100 border-blue-200';
      case 'bugfix':
        return 'text-red-600 bg-red-100 border-red-200';
      case 'experiment':
        return 'text-purple-600 bg-purple-100 border-purple-200';
      default:
        return 'text-gray-600 bg-gray-100 border-gray-200';
    }
  };

  const formatBranchDate = (branchName: string): string => {
    // Extract date from branch name format: type/YYYY-MM-DD-HHMM
    const parts = branchName.split('/');
    if (parts.length >= 2) {
      const datePart = parts[1];
      const match = datePart.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})/);
      if (match) {
        const [, year, month, day, hours, minutes] = match;
        return `${month}/${day}/${year} ${hours}:${minutes}`;
      }
    }
    return 'Unknown date';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Smart Branching</h2>
          <p className="text-muted-foreground">
            Intelligent Git branching with date/time naming convention
          </p>
        </div>
        
        {isProcessing && (
          <div className="flex items-center space-x-2 text-muted-foreground">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
            <span className="text-sm">{lastOperation}</span>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
          <TabsTrigger value="changes">Changes</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Current Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <GitBranch className="h-5 w-5" />
                <span>Current Status</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Current Branch</p>
                  <span className="inline-flex items-center space-x-1 px-2 py-1 bg-gray-100 border border-gray-200 rounded text-sm">
                    <GitBranch className="h-3 w-3" />
                    <span>{currentProjectBranch}</span>
                  </span>
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm font-medium">Total Branches</p>
                  <p className="text-2xl font-bold">{projectBranches.length}</p>
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm font-medium">Pending Changes</p>
                  <p className="text-2xl font-bold">
                    {projectChanges?.filesChanged || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Change Detection */}
          {projectChanges && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Activity className="h-5 w-5" />
                  <span>Change Detection</span>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => detectProjectChanges(projectId)}
                    className="ml-auto"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-600">
                        {projectChanges.filesChanged}
                      </p>
                      <p className="text-sm text-muted-foreground">Files Changed</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">
                        +{projectChanges.linesAdded}
                      </p>
                      <p className="text-sm text-muted-foreground">Lines Added</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-red-600">
                        -{projectChanges.linesRemoved}
                      </p>
                      <p className="text-sm text-muted-foreground">Lines Removed</p>
                    </div>
                    <div className="text-center">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getBranchTypeColor(projectChanges.suggestedBranchType)}`}>
                        {projectChanges.suggestedBranchType}
                      </span>
                      <p className="text-sm text-muted-foreground">Suggested Type</p>
                    </div>
                  </div>
                  
                  {projectChanges.shouldCreateBranch && (
                    <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-lg border">
                      <AlertTriangle className="h-5 w-5 text-blue-600" />
                      <div className="flex-1">
                        <p className="font-medium">Branch Creation Recommended</p>
                        <p className="text-sm text-muted-foreground">
                          {projectChanges.filesChanged} files changed • Suggested: {projectChanges.suggestedBranchType}
                        </p>
                      </div>
                      <Button onClick={handleAutoCreateBranch} size="sm">
                        Create Branch
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button 
                  onClick={() => setShowCreateDialog(true)}
                  className="flex items-center space-x-2"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Branch</span>
                </Button>
                
                <Button 
                  variant="outline"
                  onClick={() => setShowRevertDialog(true)}
                  className="flex items-center space-x-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Revert Changes</span>
                </Button>
                
                <Button 
                  variant="outline"
                  onClick={() => detectProjectChanges(projectId)}
                  className="flex items-center space-x-2"
                >
                  <Activity className="h-4 w-4" />
                  <span>Scan Changes</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branches" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>All Branches ({projectBranches.length})</span>
                <Button 
                  onClick={() => setShowCreateDialog(true)}
                  size="sm"
                  className="flex items-center space-x-2"
                >
                  <Plus className="h-4 w-4" />
                  <span>New Branch</span>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {projectBranches.map((branch) => (
                  <div 
                    key={branch.name}
                    className={`p-4 rounded-lg border transition-colors ${
                      branch.isActive ? 'bg-blue-50 border-blue-200' : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                          {getBranchTypeIcon(branch.type)}
                          <span className="font-medium">{branch.name}</span>
                          {branch.isActive && (
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              Current
                            </span>
                          )}
                        </div>
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getBranchTypeColor(branch.type)}`}>
                          {branch.type}
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {!branch.isActive && (
                          <>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleSwitchBranch(branch.name)}
                            >
                              Switch
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleMergeBranch(branch.name)}
                              className="flex items-center space-x-1"
                            >
                              <GitMerge className="h-3 w-3" />
                              <span>Merge</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-2 text-sm text-muted-foreground">
                      <p>{branch.description}</p>
                      <div className="flex items-center space-x-4 mt-1">
                        <span className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>{formatBranchDate(branch.name)}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <GitCommit className="h-3 w-3" />
                          <span>{branch.commitHash.substring(0, 7)}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                
                {projectBranches.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No branches found</p>
                    <p className="text-sm">Create your first branch to get started</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="changes" className="space-y-4">
          {projectChanges ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Current Changes</span>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => detectProjectChanges(projectId)}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Files Changed ({projectChanges.filesChanged})</h4>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {projectChanges.changedFiles.map((file, index) => (
                        <div key={index} className="text-sm p-2 bg-gray-50 rounded font-mono">
                          {file}
                        </div>
                      ))}
                      {projectChanges.changedFiles.length === 0 && (
                        <p className="text-sm text-muted-foreground italic">No files changed</p>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Smart Branch Suggestion</h4>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm">Suggested type:</span>
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getBranchTypeColor(projectChanges.suggestedBranchType)}`}>
                          {projectChanges.suggestedBranchType}
                        </span>
                      </div>
                      <div className="text-sm">
                        <span className="font-medium">Auto-generated name:</span>
                        <code className="ml-2 px-2 py-1 bg-gray-100 rounded text-xs block mt-1">
                          {projectChanges.suggestedBranchName}
                        </code>
                      </div>
                      <div className="text-sm">
                        <span className="font-medium">Threshold met:</span>
                        <span className={`ml-2 ${projectChanges.shouldCreateBranch ? 'text-green-600' : 'text-gray-600'}`}>
                          {projectChanges.shouldCreateBranch ? '✓ Yes' : '✗ No'}
                        </span>
                        <p className="text-xs text-muted-foreground mt-1">
                          Need {config.changeThreshold}+ files or 50+ line changes
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-muted-foreground">No changes detected</p>
                <Button 
                  variant="outline" 
                  onClick={() => detectProjectChanges(projectId)}
                  className="mt-4"
                >
                  Scan for Changes
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="h-5 w-5" />
                <span>Smart Branching Settings</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Auto-Create Branches</p>
                      <p className="text-sm text-muted-foreground">
                        Automatically suggest branch creation for significant changes
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.autoCreateBranches}
                      onChange={(e) => updateConfig({ autoCreateBranches: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Change Threshold</label>
                    <Input
                      type="number"
                      value={config.changeThreshold}
                      onChange={(e) => updateConfig({ changeThreshold: parseInt(e.target.value) })}
                      min="1"
                      max="10"
                      className="w-20"
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum files changed to suggest branch creation
                    </p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Date/Time Naming</p>
                      <p className="text-sm text-muted-foreground">
                        Use timestamp-based branch names (type/YYYY-MM-DD-HHMM)
                      </p>
                    </div>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Backup Before Revert</p>
                      <p className="text-sm text-muted-foreground">
                        Create backup branches before reverting changes
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={config.backupBeforeRevert}
                      onChange={(e) => updateConfig({ backupBeforeRevert: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Branch Naming Convention</h4>
                <div className="text-sm text-blue-800 space-y-1">
                  <p><strong>Format:</strong> <code>type/YYYY-MM-DD-HHMM</code></p>
                  <p><strong>Example:</strong> <code>feature/2024-01-15-1430</code></p>
                  <p><strong>Types:</strong> feature, bugfix, iteration, experiment</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Branch Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Create New Branch</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Branch Type</label>
                <select 
                  value={newBranchType} 
                  onChange={(e) => setNewBranchType(e.target.value)}
                  className="w-full mt-1 p-2 border border-gray-300 rounded-md"
                >
                  <option value="feature">🚀 Feature - New functionality</option>
                  <option value="bugfix">🐛 Bug Fix - Fix issues</option>
                  <option value="iteration">🔄 Iteration - Improvements</option>
                  <option value="experiment">🧪 Experiment - Testing ideas</option>
                </select>
              </div>
              
              <div>
                <label className="text-sm font-medium">Generated Name Preview</label>
                <code className="block p-2 bg-gray-100 rounded text-sm mt-1">
                  {generateCurrentBranchName(newBranchType)}
                </code>
                <p className="text-xs text-muted-foreground mt-1">
                  Branch names use date/time format for consistency
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium">Description (Optional)</label>
                <Textarea
                  value={newBranchDescription}
                  onChange={(e) => setNewBranchDescription(e.target.value)}
                  placeholder="Brief description of the changes..."
                  rows={3}
                />
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateBranch}>
                  Create Branch
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Revert Dialog */}
      {showRevertDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <RotateCcw className="h-5 w-5" />
                <span>Revert to Previous State</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Select Branch to Revert To</label>
                <select 
                  value={revertTarget} 
                  onChange={(e) => setRevertTarget(e.target.value)}
                  className="w-full mt-1 p-2 border border-gray-300 rounded-md"
                >
                  <option value="">Choose a branch...</option>
                  {projectBranches.map((branch) => (
                    <option key={branch.name} value={branch.name}>
                      {branch.name} ({branch.type})
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <p className="text-sm font-medium text-yellow-800">Safe Revert Process</p>
                </div>
                <p className="text-sm text-yellow-700 mt-1">
                  • A backup branch will be created automatically<br/>
                  • Your current work will be preserved<br/>
                  • You can switch back to the backup anytime
                </p>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowRevertDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleRevert} 
                  disabled={!revertTarget}
                  variant="default"
                >
                  Revert Safely
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}; 