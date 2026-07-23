/**
 * URL Parameters Hook
 * Manages URL query parameters for deep linking
 */

import { useCallback } from 'react';

export function useURLParams() {
  const getParam = useCallback((key: string): string | null => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get(key);
  }, []);

  const setParam = useCallback((key: string, value: string | null) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (value === null) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
    window.history.pushState({}, '', url.toString());
  }, []);

  const getAllParams = useCallback((): Record<string, string> => {
    if (typeof window === 'undefined') return {};
    const params = new URLSearchParams(window.location.search);
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }, []);

  return {
    getParam,
    setParam,
    getAllParams
  };
}

