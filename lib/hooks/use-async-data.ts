"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface AsyncDataState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

interface UseAsyncDataOptions {
  /** Skip initial fetch */
  skip?: boolean;
  /** Error message to display on failure */
  errorMessage?: string;
}

interface UseAsyncDataReturn<T> extends AsyncDataState<T> {
  /** Refetch the data */
  refetch: () => Promise<void>;
  /** Manually set the data */
  setData: (data: T | null) => void;
  /** Reset state to initial values */
  reset: () => void;
}

/**
 * Hook for managing async data fetching with loading and error states.
 * Handles cancellation on unmount and provides refetch capability.
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  options: UseAsyncDataOptions = {},
): UseAsyncDataReturn<T> {
  const { skip = false, errorMessage = "Failed to load data" } = options;

  const [state, setState] = useState<AsyncDataState<T>>({
    data: null,
    isLoading: !skip,
    error: null,
  });

  const isMounted = useRef(true);

  const fetchData = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const result = await fetcher();
      if (isMounted.current) {
        setState({ data: result, isLoading: false, error: null });
      }
    } catch (err) {
      if (isMounted.current) {
        setState({
          data: null,
          isLoading: false,
          error: err instanceof Error ? err.message : errorMessage,
        });
      }
    }
  }, [fetcher, errorMessage]);

  useEffect(() => {
    isMounted.current = true;

    if (!skip) {
      fetchData();
    }

    return () => {
      isMounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, skip]);

  const setData = useCallback((data: T | null) => {
    setState((prev) => ({ ...prev, data }));
  }, []);

  const reset = useCallback(() => {
    setState({ data: null, isLoading: false, error: null });
  }, []);

  return {
    ...state,
    refetch: fetchData,
    setData,
    reset,
  };
}
