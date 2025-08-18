import React, { useState } from 'react';
import { Checkpoint } from '@/types/Checkpoint';
import { CheckCircle, GitCommit, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistance } from 'date-fns';

interface CheckpointMessageProps {
  checkpoint: Checkpoint;
  onRollback: () => void;
}

export const CheckpointMessage: React.FC<CheckpointMessageProps> = ({
  checkpoint,
  onRollback
}) => {
  const [expanded, setExpanded] = useState(false);
  
  const toggleExpanded = () => setExpanded(!expanded);
  
  // Format the date for display
  const formattedDate = formatDistance(
    new Date(checkpoint.timestamp),
    new Date(),
    { addSuffix: true }
  );
  
  return (
    <div className="rounded-lg border bg-muted/40 p-4 my-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <div>
            <h3 className="font-semibold text-sm">Checkpoint Created</h3>
            <p className="text-xs text-muted-foreground">{formattedDate}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={onRollback}
            className="text-xs"
          >
            Rollback to this version
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleExpanded}
            className="p-1 h-6 w-6"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      
      {expanded && (
        <div className="mt-3 pt-3 border-t text-sm">
          <p className="mb-2">{checkpoint.description}</p>
          
          {checkpoint.commitHash && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <GitCommit className="h-3 w-3" />
              <span>Commit: {checkpoint.commitHash}</span>
            </div>
          )}
          
          {checkpoint.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {checkpoint.tags.map(tag => (
                <span 
                  key={tag}
                  className="px-2 py-0.5 bg-muted rounded-full text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}; 