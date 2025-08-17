import React, { useEffect } from 'react';
import { GitBranch } from 'lucide-react';
import { useBranchStore } from '@/stores/branchStore';
import { useStore } from '@/stores/rootStore';
import { formatBranchName } from '@/lib/branchNaming';

interface CurrentBranchChipProps {
  projectId?: string;
  showLabel?: boolean;
  className?: string;
}

export const CurrentBranchChip: React.FC<CurrentBranchChipProps> = ({ projectId, showLabel = false, className = '' }) => {
  const { activeProjectId } = useStore();
  const effectiveProjectId = projectId || activeProjectId;
  const { currentBranch, refreshCurrentBranch, isSwitching } = useBranchStore();

  const branchName = effectiveProjectId ? (currentBranch[effectiveProjectId] || 'main') : 'main';

  useEffect(() => {
    if (effectiveProjectId) {
      void refreshCurrentBranch(effectiveProjectId);
    }
  }, [effectiveProjectId, refreshCurrentBranch]);

  return (
    <div className={`flex items-center space-x-2 ${className}`.trim()}>
      {showLabel && (
        <span className="text-sm text-gray-700">Current Branch:</span>
      )}
      <span
        className="inline-flex items-center gap-1 text-sm font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded"
        title={branchName}
      >
        <GitBranch className="w-3 h-3" />
        {isSwitching ? (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 border-2 border-blue-300 border-t-blue-700 rounded-full animate-spin" />
            Switching…
          </span>
        ) : (
          formatBranchName(branchName)
        )}
      </span>
    </div>
  );
};

export default CurrentBranchChip;


