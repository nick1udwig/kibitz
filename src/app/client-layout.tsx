'use client';

import { Suspense } from 'react';
import PasswordGate from '../components/auth/PasswordGate';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <PasswordGate>
        {children}
      </PasswordGate>
    </Suspense>
  );
}