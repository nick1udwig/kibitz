import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Maximize2, Minimize2 } from 'lucide-react';

interface ToolCallModalProps {
  toolCall: {
    name: string;
    input: any;
    result: string;
  };
  onClose: () => void;
}

export const ToolCallModal = ({ toolCall, onClose }: ToolCallModalProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className={`bg-background/95 backdrop-blur-sm ${isExpanded ? 'w-[80vw] max-w-[1200px]' : ''}`}>
        <DialogHeader className="flex justify-between items-center">
          <DialogTitle>Tool Call: {toolCall.name}</DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </DialogHeader>
        <div className={`space-y-4 ${isExpanded ? 'h-[calc(80vh-120px)] overflow-auto' : ''}`}>
          <div>
            <h4 className="font-medium mb-2">Input Parameters:</h4>
            <pre className="bg-muted/50 backdrop-blur-sm p-4 rounded-md overflow-auto text-sm">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          <div>
            <h4 className="font-medium mb-2">Result:</h4>
            <pre className="bg-muted/50 backdrop-blur-sm p-4 rounded-md overflow-auto text-sm">
              {toolCall.result}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
