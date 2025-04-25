import React, { useRef, useCallback } from 'react';
import { UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MessageContent } from '../types';

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ACCEPTED_DOCUMENT_TYPES = ['application/pdf'];
const ADDITIONAL_ACCEPTED_TEXT_TYPES = [
  'applications/javascript',
  'application/typescript',
  'application/x-httpd-php',
  'application/x-sh',
  'application/x-powershell',
  'application/json',
  'application/xml',
  'application/yaml',
  'application/toml',
  'application/x-tex',
  'application/sql',
  'application/x-python',
  'application/x-ruby',
  'application/x-diff',
  'application/x-patch',
  'application/typescript',
  'application/x-properties',
];

interface FileUploadProps {
  onFileSelect: (content: MessageContent) => void;
  onUploadComplete?: () => void;
}

function decodeBase64ToUtf8String(base64: string): string {
  try {
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch (error) {
    throw new Error('Failed to decode base64 string: ' + (error as Error).message);
  }
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, onUploadComplete }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create a reusable process file function
  const processFile = useCallback(async (file: File) => {
    if (!(ACCEPTED_IMAGE_TYPES.includes(file.type) || ACCEPTED_DOCUMENT_TYPES.includes(file.type) || file.type.startsWith('text/') || ADDITIONAL_ACCEPTED_TEXT_TYPES.includes(file.type))) {
      alert('Unsupported file type. Please upload an image (JPEG, PNG, GIF, WebP), a PDF, or a plaintext document.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = (reader.result as string).split(',')[1];
      if (file.type.startsWith('text/') || ADDITIONAL_ACCEPTED_TEXT_TYPES.includes(file.type)) {
        onFileSelect({
          type: 'text',
          text: decodeBase64ToUtf8String(base64Data),
        });
        onUploadComplete?.();
        return;
      }

      if (ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        onFileSelect({
          type: 'image',
          source: {
            type: 'base64',
            media_type: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: base64Data,
          },
          fileName: file.name,
        });
        onUploadComplete?.();
      } else if (file.type === 'application/pdf') {
        onFileSelect({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: base64Data,
          },
          fileName: file.name,
        });
        onUploadComplete?.();
      }
    };
    reader.readAsDataURL(file);
  }, [onFileSelect, onUploadComplete]);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        await processFile(file);
      }
    },
    [processFile]
  );

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Add a handler for global drag events
  const handleGlobalDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleGlobalDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      const files = Array.from(e.dataTransfer.files);
      files.forEach(processFile);
    }
  }, [processFile]);

  // Setup and cleanup global drag-drop handlers
  React.useEffect(() => {
    // Target the entire chat interface instead of just the textarea
    const chatInterface = document.getElementById('chat-view');
    const fallbackInterface = document.querySelector('.flex.flex-col.h-full.relative') || document.body;
    const dropTarget = chatInterface || fallbackInterface;
    
    dropTarget.addEventListener('dragover', handleGlobalDragOver as EventListener);
    dropTarget.addEventListener('drop', handleGlobalDrop as EventListener);

    return () => {
      dropTarget.removeEventListener('dragover', handleGlobalDragOver as EventListener);
      dropTarget.removeEventListener('drop', handleGlobalDrop as EventListener);
    };
  }, [handleGlobalDragOver, handleGlobalDrop]);

  return (
    <div className="relative">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept={[...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_DOCUMENT_TYPES, ...ADDITIONAL_ACCEPTED_TEXT_TYPES, 'text/*'].join(',')}
        className="hidden"
        multiple
      />
      <Button
        onClick={triggerFileInput}
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title="Upload files (Images or PDFs)"
      >
        <UploadCloud className="h-4 w-4" />
      </Button>
    </div>
  );
};
