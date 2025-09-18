import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  XCircle, 
  Clock,
  TrendingUp,
  Database
} from "lucide-react";
import { fdaUsageTracker, type UsageStats } from "@/lib/fda-usage-tracker";
import { cn } from "@/lib/utils";

interface FdaApiStatusResponse {
  status: 'available' | 'rate_limited' | 'warning' | 'error';
  message: string;
  lastChecked: string;
  responseTimeMs: number;
  rateLimitInfo?: {
    remaining: number;
    dailyRemaining?: number;
    minuteRemaining?: number;
    total: number;
    resetTime: string;
    minutesUntilReset: number;
  };
  cacheInfo?: {
    entriesCount: number;
  };
  apiEndpoint?: string;
  testQuery?: string;
  testResultsFound?: number;
  error?: string;
  details?: string;
  fromCache?: boolean;
  cacheExpiresAt?: string;
  lastUpdated?: string;
  apiConfig?: {
    hasApiKey: boolean;
    limits: {
      dailyLimit: number;
      hourlyLimit: number;
      minuteLimit: number;
    };
  };
  serverUsageStats?: {
    dailyUsage: number;
    hourlyUsage: number;
    minuteUsage: number;
    canMakeCall: boolean;
    errorRate: number;
    quotaInfo: {
      dailyLimit: number;
      hourlyLimit: number;
      minuteLimit: number;
      dailyRemaining: number;
      hourlyRemaining: number;
      minuteRemaining: number;
    };
    recentActivity?: Array<{
      timestamp: number;
      endpoint: string;
      success: boolean;
      errorType?: string;
      responseTimeMs?: number;
    }>;
  };
}

interface FdaApiStatusProps {
  className?: string;
  compact?: boolean;
}

export default function FdaApiStatus({ className, compact = false }: FdaApiStatusProps) {
  const queryClient = useQueryClient();
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());
  const [localUsageStats, setLocalUsageStats] = useState<UsageStats | null>(null);
  const [isPageVisible, setIsPageVisible] = useState<boolean>(!document.hidden);

  // Page Visibility API to pause polling when tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Query FDA API status with page visibility awareness
  const { 
    data: apiStatus, 
    isLoading, 
    error,
    refetch 
  } = useQuery<FdaApiStatusResponse>({
    queryKey: ['/api/fda-status', lastRefresh],
    queryFn: async () => {
      const response = await fetch('/api/fda-status');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: isPageVisible ? 3 * 60 * 1000 : false, // Only poll when page is visible
    refetchIntervalInBackground: false, // Disable background polling to save resources
    retry: 2,
    // Refetch when page becomes visible after being hidden
    refetchOnWindowFocus: true
  });

  // Update local usage stats periodically (fallback only)
  useEffect(() => {
    const updateLocalStats = () => {
      setLocalUsageStats(fdaUsageTracker.getUsageStats());
    };

    updateLocalStats();
    const interval = setInterval(updateLocalStats, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Manual refresh handler with force parameter
  const handleRefresh = async () => {
    setLastRefresh(Date.now());
    // Force fresh data from server by adding force parameter
    const response = await fetch('/api/fda-status?force=true');
    if (response.ok) {
      const data = await response.json();
      queryClient.setQueryData(['/api/fda-status', lastRefresh], data);
    }
    await refetch();
  };

  // Get summary stats from server (preferred) or local tracker (fallback)
  const getSummaryStats = () => {
    const serverStats = apiStatus?.serverUsageStats;
    const localStats = fdaUsageTracker.getSummaryStats();
    
    if (serverStats) {
      // Use server data as source of truth
      const dailyUsage = `${serverStats.dailyUsage}/${serverStats.quotaInfo.dailyLimit}`;
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      let statusMessage = 'API ready';
      
      if (!serverStats.canMakeCall) {
        status = 'critical';
        if (serverStats.quotaInfo.dailyRemaining === 0) {
          statusMessage = 'Daily limit reached';
        } else if (serverStats.quotaInfo.hourlyRemaining === 0) {
          statusMessage = 'Hourly limit reached';
        } else {
          statusMessage = 'Rate limited';
        }
      } else if (serverStats.quotaInfo.dailyRemaining < 50 || serverStats.quotaInfo.hourlyRemaining < 20) {
        status = 'warning';
        statusMessage = 'Approaching limits';
      } else if (serverStats.errorRate > 20) {
        status = 'warning';
        statusMessage = 'High error rate';
      }
      
      return { dailyUsage, status, statusMessage };
    }
    
    // Fallback to local stats if server data unavailable
    return localStats;
  };

  const summaryStats = getSummaryStats();

  // Determine overall status combining API and local data
  const getOverallStatus = (): {
    status: 'healthy' | 'warning' | 'critical';
    icon: React.ReactNode;
    color: string;
    bgColor: string;
  } => {
    if (error || apiStatus?.status === 'error') {
      return {
        status: 'critical',
        icon: <XCircle className="h-4 w-4" />,
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-50 dark:bg-red-950'
      };
    }

    if (apiStatus?.status === 'rate_limited' || summaryStats.status === 'critical') {
      return {
        status: 'critical',
        icon: <AlertTriangle className="h-4 w-4" />,
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-50 dark:bg-red-950'
      };
    }

    if (apiStatus?.status === 'warning' || summaryStats.status === 'warning') {
      return {
        status: 'warning',
        icon: <AlertTriangle className="h-4 w-4" />,
        color: 'text-yellow-600 dark:text-yellow-400',
        bgColor: 'bg-yellow-50 dark:bg-yellow-950'
      };
    }

    return {
      status: 'healthy',
      icon: <CheckCircle className="h-4 w-4" />,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-950'
    };
  };

  const overallStatus = getOverallStatus();

  // Format time ago helper
  const formatTimeAgo = (timestamp: string | number): string => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  // Format next available time
  const formatNextAvailable = (timestamp?: number): string => {
    if (!timestamp) return '';
    
    const diffMs = timestamp - Date.now();
    if (diffMs <= 0) return 'Now';
    
    const diffMinutes = Math.ceil(diffMs / (1000 * 60));
    if (diffMinutes < 60) return `${diffMinutes}m`;
    
    const diffHours = Math.ceil(diffMinutes / 60);
    return `${diffHours}h`;
  };

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn("flex items-center gap-2", className)} data-testid="fda-status-compact">
              <div className={cn("flex items-center justify-center w-3 h-3 rounded-full", overallStatus.bgColor)}>
                <div className={cn("w-2 h-2 rounded-full", overallStatus.color.replace('text-', 'bg-'))} />
              </div>
              <span className="text-sm text-muted-foreground">FDA API</span>
              {isLoading && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1 text-xs">
              <div className="font-medium">{apiStatus?.message || summaryStats.statusMessage}</div>
              <div>Daily usage: {summaryStats.dailyUsage}</div>
              {summaryStats.lastCallAgo && (
                <div>Last call: {summaryStats.lastCallAgo}</div>
              )}
              {apiStatus?.responseTimeMs && (
                <div>Response: {apiStatus.responseTimeMs}ms</div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Card className={cn("w-full", className)} data-testid="fda-status-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Database className="h-4 w-4" />
            FDA API Status
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge 
              variant={overallStatus.status === 'healthy' ? 'default' : 
                      overallStatus.status === 'warning' ? 'secondary' : 'destructive'}
              className={cn("text-xs", overallStatus.color)}
              data-testid="fda-status-badge"
            >
              {overallStatus.icon}
              <span className="ml-1 capitalize">{overallStatus.status}</span>
            </Badge>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleRefresh}
              disabled={isLoading}
              className="h-8 w-8 p-0"
              data-testid="button-refresh-fda-status"
            >
              <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* API Connection Status */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Connection</span>
            <span className={overallStatus.color} data-testid="text-connection-status">
              {isLoading ? 'Checking...' : (apiStatus?.message || summaryStats.statusMessage)}
            </span>
          </div>
          
          {apiStatus?.responseTimeMs && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Response Time</span>
              <span className="text-foreground" data-testid="text-response-time">
                {apiStatus.responseTimeMs}ms
              </span>
            </div>
          )}
        </div>

        {/* Usage Statistics */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="h-3 w-3" />
            Usage Statistics
            {apiStatus?.fromCache && (
              <Badge variant="outline" className="text-xs">
                Cached
              </Badge>
            )}
            {apiStatus?.apiConfig?.hasApiKey && (
              <Badge variant="outline" className="text-xs">
                API Key
              </Badge>
            )}
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Daily Calls</span>
              <span className="font-mono" data-testid="text-daily-usage">
                {summaryStats.dailyUsage}
              </span>
            </div>
            
            {/* Use server stats when available, fallback to local stats */}
            {apiStatus?.serverUsageStats ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">This Hour</span>
                  <span className="font-mono" data-testid="text-hourly-usage">
                    {apiStatus.serverUsageStats.hourlyUsage}/{apiStatus.serverUsageStats.quotaInfo.hourlyLimit}
                  </span>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Last Minute</span>
                  <span className="font-mono" data-testid="text-minute-usage">
                    {apiStatus.serverUsageStats.minuteUsage}/{apiStatus.serverUsageStats.quotaInfo.minuteLimit}
                  </span>
                </div>
                
                {apiStatus.serverUsageStats.errorRate > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Error Rate</span>
                    <span className={cn("font-mono", 
                      apiStatus.serverUsageStats.errorRate > 20 ? "text-red-500" : 
                      apiStatus.serverUsageStats.errorRate > 10 ? "text-yellow-500" : "text-green-500"
                    )} data-testid="text-error-rate">
                      {apiStatus.serverUsageStats.errorRate.toFixed(1)}%
                    </span>
                  </div>
                )}
              </>
            ) : localUsageStats && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">This Hour (Local)</span>
                  <span className="font-mono" data-testid="text-hourly-usage">
                    {localUsageStats.hourlyUsage}/{localUsageStats.quotaInfo.hourlyLimit}
                  </span>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Last Minute (Local)</span>
                  <span className="font-mono" data-testid="text-minute-usage">
                    {localUsageStats.minuteUsage}/{localUsageStats.quotaInfo.minuteLimit}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Rate Limit Information */}
        {apiStatus?.rateLimitInfo && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-3 w-3" />
              Rate Limits
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Remaining</span>
                <span className="font-mono" data-testid="text-rate-limit-remaining">
                  {apiStatus.rateLimitInfo.remaining}/{apiStatus.rateLimitInfo.total}
                </span>
              </div>
              
              {apiStatus.rateLimitInfo.minutesUntilReset > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Reset In</span>
                  <span className="font-mono" data-testid="text-rate-limit-reset">
                    {apiStatus.rateLimitInfo.minutesUntilReset}m
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rate Limited Warning */}
        {!localUsageStats?.canMakeCall && localUsageStats?.nextAvailableTime && (
          <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm text-yellow-800 dark:text-yellow-200">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">Rate Limited</span>
            </div>
            <div className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
              Next call available in {formatNextAvailable(localUsageStats.nextAvailableTime)}
            </div>
          </div>
        )}

        {/* Error Information */}
        {(error || apiStatus?.error) && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm text-red-800 dark:text-red-200">
              <XCircle className="h-4 w-4" />
              <span className="font-medium">API Error</span>
            </div>
            <div className="text-xs text-red-700 dark:text-red-300 mt-1" data-testid="text-error-details">
              {error?.message || apiStatus?.details || 'Unknown error occurred'}
            </div>
          </div>
        )}

        {/* Last Updated */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            <span>Last checked</span>
          </div>
          <span data-testid="text-last-checked">
            {apiStatus?.lastChecked ? formatTimeAgo(apiStatus.lastChecked) : 'Never'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}