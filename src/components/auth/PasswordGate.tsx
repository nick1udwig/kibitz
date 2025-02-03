'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/stores/rootStore';
import { PasswordDialog } from './PasswordDialog';

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  const setState = useStore((state) => state.setState);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Check localStorage on mount
    if (typeof window !== 'undefined') {
      const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
      setState({ isAuthenticated: isLoggedIn });
      setMounted(true);
    }
  }, [setState]);


  const handleAuthenticated = () => {
    localStorage.setItem('isLoggedIn', 'true');
    setState({ isAuthenticated: true });
  };

  // Don't render anything until we've checked localStorage
  if (!mounted) {
    return null;
  }

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