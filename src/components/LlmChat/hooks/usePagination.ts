import { useState, useEffect, useRef, useCallback, RefObject, useMemo } from 'react';
import { throttle } from 'lodash';
import { Message } from '../types';

interface UsePaginationProps {
  allMessages: Message[];
  initialPageSize?: number;
  containerRef?: RefObject<HTMLDivElement | null> | RefObject<HTMLDivElement>; // Allow passing a container ref directly with flexible type
}

export const usePagination = ({ 
  allMessages, 
  initialPageSize = 10,  // Initially show 10 messages
  containerRef
}: UsePaginationProps) => {
  // Number of messages to display
  const [displayCount, setDisplayCount] = useState(initialPageSize);
  // Track if we're currently loading more messages
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Reference to track the element that should maintain position
  const anchorRef = useRef<HTMLDivElement | null>(null);
  // Create our own ref if none is provided
  const internalScrollContainerRef = useRef<HTMLDivElement | null>(null);
  // Use the provided ref if available, otherwise use our internal one
  const scrollContainerRef = containerRef || internalScrollContainerRef;
  // Flag to prevent multiple loads during scroll adjustment
  const isAdjustingScroll = useRef(false);
  // Store scroll position and heights for restoration
  const scrollMetrics = useRef<{
    scrollHeight: number;
    scrollTop: number;
    clientHeight: number;
  } | null>(null);

  // The visible messages, paginated - start from the newest messages
  const visibleMessages = useMemo(() => {
    if (allMessages.length === 0) return [];
    
    // Show the most recent [displayCount] messages (newest first)
    const startIdx = Math.max(0, allMessages.length - displayCount);
    return allMessages.slice(startIdx);
  }, [allMessages, displayCount]);

  // Check if we have more messages to load
  const hasMoreMessages = displayCount < allMessages.length;

  // Load more messages function - simplified and more robust
  const loadMoreMessages = useCallback(() => {
    if (!hasMoreMessages || isLoadingMore || isAdjustingScroll.current) {
      console.log("Skipping loadMoreMessages:", { 
        hasMoreMessages, 
        isLoadingMore, 
        isAdjusting: isAdjustingScroll.current 
      });
      return false;
    }
    
    // Check if the container ref is available
    const container = scrollContainerRef.current;
    if (!container) {
      console.log("No container reference when trying to load more");
      return false;
    }
      
    // Store current scroll metrics before loading more messages
    scrollMetrics.current = {
      scrollHeight: container.scrollHeight,
      scrollTop: container.scrollTop,
      clientHeight: container.clientHeight
    };
    
    console.log("LOADING MORE MESSAGES. Current display count:", displayCount, 
      "Scroll position:", container.scrollTop);
    
    setIsLoadingMore(true);
    
    // Load 5 messages at a time for subsequent loads
    const nextBatchSize = 5;
    setDisplayCount(prev => Math.min(allMessages.length, prev + nextBatchSize));
    return true;
  }, [hasMoreMessages, isLoadingMore, allMessages.length, displayCount, scrollContainerRef]);

  // Detect when user has scrolled to the top to load older messages
  const handleScroll = useCallback((e: Event) => {
    // Ignore scroll events during adjustments or loading
    if (isAdjustingScroll.current || isLoadingMore) return;
    
    const target = e.target as HTMLDivElement;
    if (!target) return;
    
    const { scrollTop } = target;
    
    // Use a fixed pixel threshold (100px) to detect when user is near the top
    const TOP_THRESHOLD = 100;
    
    console.log("Scroll event captured, scrollTop:", scrollTop);
    
    // If we're near the top and have more messages, load more
    if (scrollTop <= TOP_THRESHOLD && hasMoreMessages) {
      console.log("TOP THRESHOLD REACHED! scrollTop:", scrollTop, "threshold:", TOP_THRESHOLD);
      loadMoreMessages();
    }
  }, [hasMoreMessages, isLoadingMore, loadMoreMessages]);

  // Set up the scroll event listener directly on the element
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      console.log("No scroll container available to attach listener to");
      return;
    }
    
    console.log("Setting up scroll event listener on container:", container);
    
    // Use a throttled handler for better performance
    const throttledHandler = throttle(handleScroll, 50);
    container.addEventListener('scroll', throttledHandler);
    
    // Initial check in case we're already at the top
    setTimeout(() => {
      if (container && hasMoreMessages && !isLoadingMore) {
        const { scrollTop } = container;
        
        if (scrollTop < 100) {
          console.log("Initial position near top, loading more");
          loadMoreMessages();
        }
      }
    }, 300);
    
    return () => {
      console.log("Removing scroll listener from container");
      container.removeEventListener('scroll', throttledHandler);
    };
  }, [scrollContainerRef, handleScroll, hasMoreMessages, isLoadingMore, loadMoreMessages]);

  // Preserve scroll position after loading more messages
  useEffect(() => {
    if (isLoadingMore && scrollMetrics.current && scrollContainerRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        
        console.log("Adjusting scroll position after loading more messages");
        
        // Calculate how much the content height has changed
        const newScrollHeight = container.scrollHeight;
        const oldScrollHeight = scrollMetrics.current!.scrollHeight;
        const heightDifference = newScrollHeight - oldScrollHeight;
        
        console.log("Height difference:", heightDifference, 
          "Old height:", oldScrollHeight, "New height:", newScrollHeight);
        
        // Adjust scroll position to keep the view at the same relative position
        if (heightDifference > 0) {
          isAdjustingScroll.current = true;
          container.scrollTop = scrollMetrics.current!.scrollTop + heightDifference;
          
          console.log("New scroll position after adjustment:", container.scrollTop);
          
          // Clear the adjustment flag after a short delay
          setTimeout(() => {
            isAdjustingScroll.current = false;
            setIsLoadingMore(false);
            scrollMetrics.current = null;
          }, 100);
        } else {
          // If no height change (shouldn't happen normally)
          isAdjustingScroll.current = false;
          setIsLoadingMore(false);
          scrollMetrics.current = null;
        }
      });
    }
  }, [isLoadingMore, visibleMessages.length]);

  return {
    visibleMessages,
    hasMoreMessages,
    isLoadingMore,
    loadMoreMessages,
    scrollContainerRef, // Return either the provided ref or our internal one
    anchorRef,
    displayCount
  };
}; 