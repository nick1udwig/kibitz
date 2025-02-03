'use client';

import { useEffect } from 'react';
import { useStore } from '@/stores/rootStore';
import { PasswordDialog } from './PasswordDialog';

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  const setState = useStore((state) => state.setState);

  useEffect(() => {
    // Reset authentication on page refresh
    setState({ isAuthenticated: false });
  }, []);

  const handleAuthenticated = () => {
    setState({ isAuthenticated: true });
  };

  return (
    <>
      <PasswordDialog
        isOpen={!isAuthenticated}
        onAuthenticated={handleAuthenticated}
      />
      {isAuthenticated ? children : null}
    </>
  );
}