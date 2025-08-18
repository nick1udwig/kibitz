import React, { useState } from 'react';
import { RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RevertButtonProps {
  commitHash?: string;
  messageTimestamp: Date;
  onRevert: (commitHash: string) => Promise<void>;
  className?: string;
}

export const RevertButton: React.FC<RevertButtonProps> = ({
  commitHash,
  messageTimestamp,
  onRevert,
  className = ''
}) => {
  const [isReverting, setIsReverting] = useState(false);

  const handleRevert = async () => {
    if (!commitHash || isReverting) return;

    setIsReverting(true);
    try {
      await onRevert(commitHash);
    } catch (error) {
      console.error('Revert failed:', error);
    } finally {
      setIsReverting(false);
    }
  };

  // Don't show button if no commit hash
  if (!commitHash) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleRevert}
      disabled={isReverting}
      className={`opacity-0 group-hover:opacity-100 transition-opacity ${className}`}
      title={`Revert to state after this message (${messageTimestamp.toLocaleTimeString()})`}
    >
      {isReverting ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
          Reverting...
        </>
      ) : (
        <>
          <RotateCcw className="h-3 w-3 mr-1" />
          Revert
        </>
      )}
    </Button>
  );
}; 