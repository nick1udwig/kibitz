import { useEffect, useRef, useState, RefObject } from 'react';
import { throttle } from 'lodash';

interface UseScrollControlProps {
  messages: {
    role: string;
    content: string | Array<{
      type: string;
      [key: string]: unknown;
    }>;
  }[];
  scrollContainerRef?: RefObject<HTMLDivElement | null> | RefObject<HTMLDivElement>;
}

export const useScrollControl = ({ messages, scrollContainerRef }: UseScrollControlProps) => {
  // Only create our own ref if one wasn't provided
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = scrollContainerRef || internalRef;
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    const makeHandleScroll = async () => {
      while (!containerRef.current) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }

      const container = containerRef.current;

      // Initial scroll to bottom
      if (container.scrollTop === 0) {
        container.scrollTop = container.scrollHeight;
      }

      // Handle scroll events
      const handleScroll = throttle(() => {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const bottom = container.scrollHeight < container.clientHeight || 
          Math.abs(scrollHeight - clientHeight - scrollTop) < 50;
        setIsAtBottom(bottom);
      }, 100);

      // Check initial scroll position
      handleScroll();

      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    };

    makeHandleScroll();
  }, [containerRef]);

  // Auto-scroll when messages update
  useEffect(() => {
    if (!containerRef.current || !messages.length) {
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const isInitialMessage = messages.length <= 1;

    if ((lastMessage.role === 'assistant' || lastMessage.role === 'user') && 
        (isAtBottom || isInitialMessage)) {
      requestAnimationFrame(() => {
        const container = containerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    }
  }, [messages, isAtBottom, containerRef]);

  const scrollToBottom = () => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  };

  return {
    chatContainerRef: containerRef,
    isAtBottom,
    scrollToBottom
  };
};