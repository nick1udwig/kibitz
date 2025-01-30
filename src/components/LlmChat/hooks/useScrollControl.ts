import { useEffect, useRef, useState } from 'react';
import { throttle } from 'lodash';

interface UseScrollControlProps {
  messages: {
    role: string;
    content: string | Array<{
      type: string;
      [key: string]: unknown;
    }>;
  }[];
}

export const useScrollControl = ({ messages }: UseScrollControlProps) => {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    const makeHandleScroll = async () => {
      while (!chatContainerRef.current) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }

      const container = chatContainerRef.current;

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
  }, []);

  // Auto-scroll when messages update
  useEffect(() => {
    if (!chatContainerRef.current || !messages.length) {
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const isInitialMessage = messages.length <= 1;

    if ((lastMessage.role === 'assistant' || lastMessage.role === 'user') && 
        (isAtBottom || isInitialMessage)) {
      requestAnimationFrame(() => {
        const container = chatContainerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    }
  }, [messages, isAtBottom]);

  const scrollToBottom = () => {
    const container = chatContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  };

  return {
    chatContainerRef,
    isAtBottom,
    scrollToBottom
  };
};