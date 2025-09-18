import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { fdaUsageTracker } from "./fda-usage-tracker";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// FDA-related endpoints that trigger backend FDA API calls
const FDA_TRIGGERING_ENDPOINTS = [
  '/api/upload',
  '/api/medications/search',
  '/api/medications/',
  '/api/fda-status'
];

// Determine if a URL triggers FDA API usage on the backend
function triggersFdaApiUsage(url: string): boolean {
  return FDA_TRIGGERING_ENDPOINTS.some(endpoint => {
    if (endpoint.endsWith('/')) {
      return url.includes(endpoint);
    }
    return url === endpoint || url.startsWith(endpoint + '?');
  });
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Handle FormData differently - don't set Content-Type header
  const isFormData = data instanceof FormData;
  
  // Track when we're about to make a call that triggers FDA API usage
  const willTriggerFda = triggersFdaApiUsage(url);
  
  try {
    const res = await fetch(url, {
      method,
      headers: data && !isFormData ? { "Content-Type": "application/json" } : {},
      body: isFormData ? data : data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    await throwIfResNotOk(res);
    
    // Record successful FDA-triggering operation
    if (willTriggerFda) {
      fdaUsageTracker.recordApiCall(url, true);
    }
    
    return res;
  } catch (error) {
    // Record failed FDA-triggering operation
    if (willTriggerFda) {
      const errorType = error instanceof Error ? error.message : 'unknown_error';
      fdaUsageTracker.recordApiCall(url, false, errorType);
    }
    
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
