import React, { useState } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CopyButton } from '@/components/ui/copy';
import { MessageContent as MessageContentType } from '../types';

interface MessageContentProps {
  content: MessageContentType;
  isUserMessage: boolean;
  onToolClick?: (name: string, input: Record<string, unknown>, result: string | null) => void;
  toolResult: string | null;
  contentIndex: number;
  messageIndex: number;
}

export const MessageContentRenderer: React.FC<MessageContentProps> = ({
  content,
  isUserMessage,
  onToolClick,
  toolResult,
  contentIndex,
  messageIndex
}) => {
  // Define state variables at the component level to avoid React Hook rules violations
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  if (content.type === 'text') {
    return (
      <div
        key={`text-${messageIndex}-${contentIndex}`}
        className="flex max-w-full pt-6"
      >
        <div className="relative group w-full max-w-full overflow-x-auto">
          {!content.text.match(/```[\s\S]*```/) && (
            <div className="absolute right-2 top-0 z-10">
              <CopyButton
                text={content.text.trim()}
                light={isUserMessage}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
          )}
          <div
            className={`w-full max-w-full rounded-lg px-4 py-2 ${
              isUserMessage
                ? 'bg-accent !text-accent-foreground'
                : 'bg-muted text-foreground'
            }`}
          >
            <ReactMarkdown
              className={`prose dark:prose-invert break-words max-w-full ${
                isUserMessage ? '[&_p]:!text-accent-foreground [&_code]:!text-accent-foreground' : ''
              }`}
              components={{
                p: ({ children }) => (
                  <p className="break-words whitespace-pre-wrap overflow-hidden">
                    {children}
                  </p>
                ),
                pre({ children, ...props }) {
                  const getCodeText = (node: unknown): string => {
                    if (typeof node === 'string') return node;
                    if (!node) return '';
                    if (Array.isArray(node)) {
                      return node.map(getCodeText).join('\n');
                    }
                    if (typeof node === 'object' && node !== null && 'props' in node) {
                      const element = node as { props?: { className?: string; children?: unknown } };
                      if (element.props?.className?.includes('language-')) {
                        return getCodeText(element.props.children);
                      }
                      if (element.props?.children) {
                        return getCodeText(element.props.children);
                      }
                    }
                    return '';
                  };

                  const text = getCodeText(children).trim();

                  return (
                    <div className="group/code relative max-w-full">
                      <div className="absolute top-2 right-2 z-10">
                        <CopyButton
                          text={text}
                          light={isUserMessage}
                          className="opacity-0 group-hover/code:opacity-100 transition-opacity"
                        />
                      </div>
                      <pre className="overflow-x-auto max-w-full whitespace-pre" {...props}>
                        {children}
                      </pre>
                    </div>
                  );
                },
                code(props: { className?: string } & React.HTMLProps<HTMLElement>) {
                  const { className, children } = props;
                  const isInline = className?.includes('language-') === false;
                  return isInline ? (
                    <code className="text-inherit whitespace-nowrap inline">
                      {children}
                    </code>
                  ) : (
                    <code className="block overflow-x-auto whitespace-pre-wrap">
                      {children}
                    </code>
                  );
                },
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    {children}
                  </a>
                ),
              }}
              remarkPlugins={[remarkGfm]}
            >
              {content.text}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  if (content.type === 'image') {
    return (
      <div
        key={`image-${messageIndex}-${contentIndex}`}
        className="flex"
      >
        <div
          className={`w-full rounded-lg px-4 py-2 ${
            isUserMessage
              ? 'bg-accent text-accent-foreground'
              : 'bg-muted text-foreground'
          }`}
        >
          <Image
            src={`data:${content.source.media_type};base64,${content.source.data}`}
            alt="User uploaded image"
            className="max-h-[150px] max-w-[300px] w-auto h-auto rounded object-contain"
            width={300}
            height={150}
          />
        </div>
      </div>
    );
  }

  if (content.type === 'document') {
    return (
      <div
        key={`document-${messageIndex}-${contentIndex}`}
        className="flex"
      >
        <div
          className={`w-full rounded-lg px-4 py-2 ${
            isUserMessage
              ? 'bg-accent text-accent-foreground'
              : 'bg-muted text-foreground'
          }`}
        >
          <embed
            src={`data:${content.source.media_type};base64,${content.source.data}`}
            type={content.source.media_type}
            width="100%"
            height="600px"
            className="rounded"
          />
        </div>
      </div>
    );
  }

  if (content.type === 'tool_use') {
    return (
      <div
        key={`tool_use-${messageIndex}-${contentIndex}`}
        className="flex"
      >
        <div
          className={`w-full rounded-lg px-4 py-2 relative group ${
            isUserMessage
              ? 'bg-accent text-accent-foreground'
              : 'bg-muted text-foreground'
          }`}
        >
          <div className="space-y-2">
            <button
              onClick={() => onToolClick?.(content.name, content.input, toolResult)}
              className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline group"
            >
              🛠️: {content.name}
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  if (content.type === 'thinking') {
    return (
      <div
        key={`thinking-${messageIndex}-${contentIndex}`}
        className="flex w-full"
      >
        <div
          className={`w-full rounded-lg px-4 py-2 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              Claude&apos;s Extended Thinking
            </div>
            <button 
              onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
              className="text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100"
            >
              {isThinkingExpanded ? 'Hide' : 'Show'}
            </button>
          </div>
          
          {isThinkingExpanded && (
            <div className="mt-2 border-t border-yellow-200 dark:border-yellow-800 pt-2">
              <ReactMarkdown
                className="prose dark:prose-invert break-words max-w-full prose-sm"
                remarkPlugins={[remarkGfm]}
              >
                {content.thinking}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    );
  }
  
  if (content.type === 'redacted_thinking') {
    return (
      <div
        key={`redacted-thinking-${messageIndex}-${contentIndex}`}
        className="flex w-full"
      >
        <div
          className={`w-full rounded-lg px-4 py-2 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800`}
        >
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>Redacted extended thinking (encrypted for privacy/safety)</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
