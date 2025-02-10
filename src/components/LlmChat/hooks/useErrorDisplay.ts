import { useState } from 'react';

export const useErrorDisplay = () => {
  const [error, setError] = useState<string | null>(null);

  const showError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const clearError = () => {
    setError(null);
  };

  return {
    error,
    showError,
    clearError
  };
};