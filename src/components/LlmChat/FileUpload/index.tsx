import React, { useRef, useCallback } from 'react';
import { UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageMessageContent, DocumentMessageContent } from '../types';

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ACCEPTED_DOCUMENT_TYPES = ['application/pdf'];

interface FileUploadProps {
  onFileSelect: (content: ImageMessageContent | DocumentMessageContent) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type) && !ACCEPTED_DOCUMENT_TYPES.includes(file.type)) {
      alert('Unsupported file type. Please upload an image (JPEG, PNG, GIF, WebP) or a PDF document.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = (reader.result as string).split(',')[1];
      
      if (ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        onFileSelect({
          type: 'image',
          source: {
            type: 'base64',
            media_type: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: base64Data,
          },
        });
      } else if (ACCEPTED_DOCUMENT_TYPES.includes(file.type)) {
        onFileSelect({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: base64Data,
          },
        });
      }
    };
    reader.readAsDataURL(file);
  }, [onFileSelect]);

  const handleFileDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) {
        await processFile(file);
      }
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        await processFile(file);
      }
    },
    [processFile]
  );


  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      onDrop={handleFileDrop}
      onDragOver={handleDragOver}
      className="relative"
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept={[...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_DOCUMENT_TYPES].join(',')}
        className="hidden"
      />
      <Button
        onClick={triggerFileInput}
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title="Upload file (Image or PDF)"
      >
        <UploadCloud className="h-5 w-5" />
      </Button>
    </div>
  );
};