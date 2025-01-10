import { useState } from 'react';
import { Copy as CopyIcon, Check as CheckIcon } from 'lucide-react';
import { Button } from './button';

interface CopyButtonProps {
  text: string;
  title?: string;
  className?: string;
}

export const CopyButton = ({ text, title = 'Copy', className = '' }: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`h-6 w-6 p-0 hover:bg-background ${className}`}
      onClick={handleCopy}
      title={title}
    >
      {copied ? (
        <CheckIcon className="h-3 w-3" />
      ) : (
        <CopyIcon className="h-3 w-3" />
      )}
    </Button>
  );
};