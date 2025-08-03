import React from 'react';
import { X } from 'lucide-react';
import { MessageContent } from '../types';

interface FileContentListProps {
  files: MessageContent[];
  onRemove: (index: number) => void;
}

export const FileContentList: React.FC<FileContentListProps> = ({ files, onRemove }) => {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {files.map((content, index) => (
        <div key={index} className="flex items-center gap-2 bg-muted rounded px-2 py-1">
          <span className="text-sm">
            {content.type === 'text' ? 'Text file' : 'fileName' in content ? content.fileName || 'Untitled' : 'Untitled'}
          </span>
          <button
            onClick={() => onRemove(index)}
            className="hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
};