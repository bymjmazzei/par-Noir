import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';

// Simple custom hook for testing
const useCustomHook = (initialValue = 'initial') => {
  const [value, setValue] = useState(initialValue);
  
  const updateValue = (newValue: string) => {
    setValue(newValue);
  };
  
  return { value, updateValue };
};

describe('useCustomHook', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() => useCustomHook());
    expect(result.current.value).toBe('initial');
  });

  it('updates state correctly', () => {
    const { result } = renderHook(() => useCustomHook());
    
    act(() => {
      result.current.updateValue('new value');
    });
    
    expect(result.current.value).toBe('new value');
  });
});