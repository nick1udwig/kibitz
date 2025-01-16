import { useState } from 'react';
import { ClipboardIcon, CheckIcon } from 'lucide-react';

interface CopyButtonProps {
  text: string;
  className?: string;
}

export const CopyButton = ({ text, className = '' }: CopyButtonProps) => {
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
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm hover:bg-kinode-orange/10 ${className}`}
    >
      {copied ? (
        <CheckIcon className="h-4 w-4" />
      ) : (
        <ClipboardIcon className="h-4 w-4" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
};