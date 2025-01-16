import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToolCallModalProps {
  toolCall: {
    name: string;
    input: Record<string, unknown>;
    result: string | null;
  };
  onClose: () => void;
}

export const ToolCallModal = ({ toolCall, onClose }: ToolCallModalProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader className="mb-4 shrink-0">
          <div className="flex justify-between items-center gap-4">
            <DialogTitle className="truncate">{`Tool Call: ${toolCall.name}`}</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </DialogHeader>

        <div className={cn("space-y-4 overflow-y-auto flex-grow", isExpanded ? "pr-2" : "")}>
          <div>
            <h4 className="font-medium mb-2">Input:</h4>
            <div className="relative">
              <pre
                className={cn(
                  "bg-muted p-2 sm:p-4 rounded-md whitespace-pre-wrap break-all text-sm sm:text-base",
                  !isExpanded && "max-h-[100px] sm:max-h-[120px] overflow-hidden"
                )}
              >
                {JSON.stringify(toolCall.input, null, 2)}
              </pre>
              {!isExpanded && (
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-muted to-transparent pointer-events-none" />
              )}
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">Result:</h4>
            <div className="relative">
              <pre
                className={cn(
                  "bg-muted p-2 sm:p-4 rounded-md whitespace-pre-wrap break-all text-sm sm:text-base",
                  !isExpanded && "max-h-[100px] sm:max-h-[120px] overflow-hidden"
                )}
              >
                {toolCall.result || 'No result available'}
              </pre>
              {!isExpanded && (
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-muted to-transparent pointer-events-none" />
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
