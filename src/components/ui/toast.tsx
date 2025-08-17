"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastVariant = 'default' | 'success' | 'error';

export interface ToastOptions {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastItem extends Required<ToastOptions> { id: string }

interface ToastContextValue {
  showToast: (options: ToastOptions) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};

export const ToastProvider: React.FC<React.PropsWithChildren<Record<string, never>>> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutsRef = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timeoutId = timeoutsRef.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback((options: ToastOptions) => {
    const id = Math.random().toString(36).slice(2);
    const toast: ToastItem = {
      id,
      title: options.title ?? '',
      description: options.description ?? '',
      variant: options.variant ?? 'default',
      durationMs: options.durationMs ?? 3000,
    };
    setToasts(prev => [...prev, toast]);
    const timeoutId = window.setTimeout(() => dismissToast(id), toast.durationMs);
    timeoutsRef.current.set(id, timeoutId);
    return id;
  }, [dismissToast]);

  // Clear all timers on unmount
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach((tid) => window.clearTimeout(tid));
      timeouts.clear();
    };
  }, []);

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

interface ToasterProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const Toaster: React.FC<ToasterProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={[
            'w-80 max-w-[90vw] rounded-md border shadow-lg bg-white text-gray-900 p-3 flex items-start gap-3',
            t.variant === 'success' ? 'border-green-200' : t.variant === 'error' ? 'border-red-200' : 'border-gray-200',
          ].join(' ')}
          role="status"
          aria-live="polite"
        >
          <div className="mt-[2px]">
            {t.variant === 'success' ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : t.variant === 'error' ? (
              <AlertTriangle className="h-5 w-5 text-red-600" />
            ) : (
              <Info className="h-5 w-5 text-blue-600" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            {t.title && <div className="text-sm font-medium truncate">{t.title}</div>}
            {t.description && (
              <div className="text-xs text-gray-600 mt-0.5 break-words">{t.description}</div>
            )}
          </div>
          <button
            aria-label="Dismiss"
            className="ml-2 p-1 rounded hover:bg-gray-100"
            onClick={() => onDismiss(t.id)}
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastProvider;

// Global event bridge so non-React code can raise toasts
if (typeof window !== 'undefined') {
  const handler = (evt: Event) => {
    const event = evt as CustomEvent<ToastOptions>;
    // Queue microtask to avoid context timing issues for early events
    queueMicrotask(() => {
      try {
        const detail = event.detail || {};
        const toastEvent = new CustomEvent('__toast-internal', { detail });
        window.dispatchEvent(toastEvent);
      } catch {}
    });
  };
  window.removeEventListener('toast', handler);
  window.addEventListener('toast', handler);
}

// Hook inside provider to consume the bridging event and call showToast
export const ToastBridge: React.FC = () => {
  const { showToast } = useToast();
  React.useEffect(() => {
    const onInternal = (evt: Event) => {
      const { detail } = evt as CustomEvent<ToastOptions>;
      showToast(detail || {});
    };
    const onGenerating = (evt: Event) => {
      const { detail } = evt as CustomEvent<{ projectId: string; branchName?: string }>;
      showToast({
        title: 'Generating project data…',
        description: detail?.branchName ? `Preparing ${detail.branchName}` : undefined,
        variant: 'default',
        durationMs: 2500,
      });
    };
    const onBranchSwitched = (evt: Event) => {
      const { detail } = evt as CustomEvent<{ projectId: string; branchName: string }>;
      const branch = detail?.branchName;
      showToast({
        title: 'Switched branch',
        description: branch ? `Now on ${branch}` : undefined,
        variant: 'success',
        durationMs: 2500,
      });
    };
    const onGenerationFailed = (evt: Event) => {
      const { detail } = evt as CustomEvent<{ branchName?: string }>;
      showToast({
        title: 'Project data failed',
        description: detail?.branchName ? `Could not prepare ${detail.branchName}` : undefined,
        variant: 'error',
        durationMs: 3500,
      });
    };
    const onBranchSwitchFailed = (evt: Event) => {
      const { detail } = evt as CustomEvent<{ targetBranch?: string; error?: string }>;
      showToast({
        title: 'Branch switch failed',
        description: detail?.targetBranch ? `Could not switch to ${detail.targetBranch}` : (detail?.error || 'Unknown error'),
        variant: 'error',
        durationMs: 3500,
      });
    };
    const onGenerationReady = (evt: Event) => {
      const { detail } = evt as CustomEvent<{ branchName?: string }>;
      showToast({
        title: 'Project data ready',
        description: detail?.branchName ? `Initialized for ${detail.branchName}` : undefined,
        variant: 'success',
        durationMs: 2500,
      });
    };
    window.addEventListener('__toast-internal', onInternal);
    window.addEventListener('projectDataGenerating', onGenerating);
    window.addEventListener('branchSwitched', onBranchSwitched);
    window.addEventListener('projectDataFailed', onGenerationFailed);
    window.addEventListener('projectDataReady', onGenerationReady);
    window.addEventListener('branchSwitchFailed', onBranchSwitchFailed);
    return () => {
      window.removeEventListener('__toast-internal', onInternal);
      window.removeEventListener('projectDataGenerating', onGenerating);
      window.removeEventListener('branchSwitched', onBranchSwitched);
      window.removeEventListener('projectDataFailed', onGenerationFailed);
      window.removeEventListener('projectDataReady', onGenerationReady);
      window.removeEventListener('branchSwitchFailed', onBranchSwitchFailed);
    };
  }, [showToast]);
  return null;
};


