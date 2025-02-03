'use client';

import dynamic from 'next/dynamic';

const PasswordGate = dynamic(() => import('../components/auth/PasswordGate'), { 
  ssr: false 
});

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <PasswordGate>
      {children}
    </PasswordGate>
  );
}