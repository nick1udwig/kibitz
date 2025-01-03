import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Maximize2, Minimize2 } from 'lucide-react';

interface ToolCallModalProps {
  toolCall: {
    name: string;
    input: any;
    result: string | null;
  };
  onClose: () => void;
}

export const ToolCallModal = ({ toolCall, onClose }: ToolCallModalProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle>Tool Call: {toolCall.name}</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </DialogHeader>
        <div
          className="space-y-4 transition-all duration-200"
          style={isExpanded ? {
            width: '80vw',
            maxWidth: '1200px',
            height: '70vh',
            overflow: 'hidden'
          } : undefined}
        >
          <div className={`h-full space-y-4 ${isExpanded ? 'overflow-y-auto pr-4' : ''}`}>
            <div>
              <h4 className="font-medium mb-2">Input:</h4>
              <pre className="bg-muted p-4 rounded-md overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(toolCall.input, null, 2)}
              </pre>
            </div>
            <div>
              <h4 className="font-medium mb-2">Result:</h4>
              <pre className="bg-muted p-4 rounded-md overflow-x-auto whitespace-pre-wrap break-all">
                {toolCall.result || 'No result available'}
              </pre>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
