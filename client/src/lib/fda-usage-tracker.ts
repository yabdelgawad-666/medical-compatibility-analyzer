/**
 * FDA API Usage Tracking System
 * 
 * Tracks FDA API calls to monitor rate limits and usage patterns.
 * Stores data in localStorage for persistence across sessions.
 */

interface ApiCallRecord {
  timestamp: number;
  endpoint: string;
  success: boolean;
  errorType?: string;
}

interface UsageStats {
  dailyUsage: number;
  hourlyUsage: number;
  minuteUsage: number;
  lastCall?: number;
  canMakeCall: boolean;
  nextAvailableTime?: number;
  quotaInfo: {
    dailyLimit: number;
    hourlyLimit: number;
    minuteLimit: number;
    dailyRemaining: number;
    hourlyRemaining: number;
    minuteRemaining: number;
  };
}

class FdaUsageTracker {
  private static instance: FdaUsageTracker;
  private readonly storageKey = 'fda_api_usage';
  private readonly maxStoredRecords = 1000; // Limit stored records for performance
  
  // FDA API Limits (public API without API key)
  // Note: These are default limits, actual limits should come from server
  private readonly dailyLimit = 1000;
  private readonly hourlyLimit = 240;
  private readonly minuteLimit = 240; // FDA allows 240 requests per minute (4/second)
  
  private constructor() {
    this.cleanupOldRecords();
  }

  public static getInstance(): FdaUsageTracker {
    if (!FdaUsageTracker.instance) {
      FdaUsageTracker.instance = new FdaUsageTracker();
    }
    return FdaUsageTracker.instance;
  }

  /**
   * Record a new API call
   */
  public recordApiCall(endpoint: string, success: boolean, errorType?: string): void {
    if (!this.isLocalStorageAvailable()) {
      console.warn('localStorage not available, cannot track FDA API usage');
      return;
    }

    const record: ApiCallRecord = {
      timestamp: Date.now(),
      endpoint,
      success,
      errorType
    };

    const records = this.getStoredRecords();
    records.push(record);

    // Keep only recent records and limit total count
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
    const filteredRecords = records
      .filter(r => r.timestamp > cutoffTime)
      .slice(-this.maxStoredRecords);

    this.saveRecords(filteredRecords);
  }

  /**
   * Get current usage statistics
   */
  public getUsageStats(): UsageStats {
    const records = this.getStoredRecords();
    const now = Date.now();
    
    // Calculate time boundaries
    const dayStart = new Date().setHours(0, 0, 0, 0);
    const hourStart = now - (60 * 60 * 1000);
    const minuteStart = now - (60 * 1000);

    // Count successful calls in each time period
    const dailyUsage = records.filter(r => 
      r.success && r.timestamp >= dayStart
    ).length;
    
    const hourlyUsage = records.filter(r => 
      r.success && r.timestamp >= hourStart
    ).length;
    
    const minuteUsage = records.filter(r => 
      r.success && r.timestamp >= minuteStart
    ).length;

    // Find last call timestamp
    const lastCall = records.length > 0 ? Math.max(...records.map(r => r.timestamp)) : undefined;

    // Calculate remaining quotas
    const dailyRemaining = Math.max(0, this.dailyLimit - dailyUsage);
    const hourlyRemaining = Math.max(0, this.hourlyLimit - hourlyUsage);
    const minuteRemaining = Math.max(0, this.minuteLimit - minuteUsage);

    // Determine if we can make a call and when next call is available
    const { canMakeCall, nextAvailableTime } = this.calculateAvailability(
      dailyRemaining, hourlyRemaining, minuteRemaining, records
    );

    return {
      dailyUsage,
      hourlyUsage,
      minuteUsage,
      lastCall,
      canMakeCall,
      nextAvailableTime,
      quotaInfo: {
        dailyLimit: this.dailyLimit,
        hourlyLimit: this.hourlyLimit,
        minuteLimit: this.minuteLimit,
        dailyRemaining,
        hourlyRemaining,
        minuteRemaining
      }
    };
  }

  /**
   * Check if we can make an API call right now
   */
  public canMakeCall(): boolean {
    return this.getUsageStats().canMakeCall;
  }

  /**
   * Get when the next API call will be available
   */
  public getNextAvailableTime(): number | null {
    const stats = this.getUsageStats();
    return stats.nextAvailableTime || null;
  }

  /**
   * Get daily usage count
   */
  public getDailyUsage(): number {
    return this.getUsageStats().dailyUsage;
  }

  /**
   * Get minute usage count (for burst protection)
   */
  public getMinuteUsage(): number {
    return this.getUsageStats().minuteUsage;
  }

  /**
   * Get recent API call history with error information
   */
  public getRecentActivity(hours = 24): ApiCallRecord[] {
    const records = this.getStoredRecords();
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    
    return records
      .filter(r => r.timestamp >= cutoff)
      .sort((a, b) => b.timestamp - a.timestamp); // Most recent first
  }

  /**
   * Get error rate for recent calls
   */
  public getErrorRate(hours = 24): number {
    const recentCalls = this.getRecentActivity(hours);
    if (recentCalls.length === 0) return 0;
    
    const errorCount = recentCalls.filter(r => !r.success).length;
    return (errorCount / recentCalls.length) * 100;
  }

  /**
   * Clear all stored usage data
   */
  public clearUsageData(): void {
    if (this.isLocalStorageAvailable()) {
      localStorage.removeItem(this.storageKey);
    }
  }

  /**
   * Export usage data for analysis
   */
  public exportUsageData(): ApiCallRecord[] {
    return this.getStoredRecords();
  }

  /**
   * Get summary statistics for dashboard display
   */
  public getSummaryStats(): {
    dailyUsage: string;
    status: 'healthy' | 'warning' | 'critical';
    statusMessage: string;
    lastCallAgo?: string;
  } {
    const stats = this.getUsageStats();
    const errorRate = this.getErrorRate(1); // Last hour error rate
    
    // Format daily usage
    const dailyUsage = `${stats.dailyUsage}/${stats.quotaInfo.dailyLimit}`;
    
    // Determine status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    let statusMessage = 'API ready';
    
    if (!stats.canMakeCall) {
      status = 'critical';
      if (stats.quotaInfo.dailyRemaining === 0) {
        statusMessage = 'Daily limit reached';
      } else if (stats.quotaInfo.hourlyRemaining === 0) {
        statusMessage = 'Hourly limit reached';
      } else {
        statusMessage = 'Rate limited';
      }
    } else if (stats.quotaInfo.dailyRemaining < 50 || stats.quotaInfo.hourlyRemaining < 20) {
      status = 'warning';
      statusMessage = 'Approaching limits';
    } else if (errorRate > 20) {
      status = 'warning';
      statusMessage = 'High error rate';
    }
    
    // Format last call time
    let lastCallAgo: string | undefined;
    if (stats.lastCall) {
      const minutesAgo = Math.floor((Date.now() - stats.lastCall) / (60 * 1000));
      if (minutesAgo < 1) {
        lastCallAgo = 'Just now';
      } else if (minutesAgo < 60) {
        lastCallAgo = `${minutesAgo}m ago`;
      } else {
        const hoursAgo = Math.floor(minutesAgo / 60);
        lastCallAgo = `${hoursAgo}h ago`;
      }
    }
    
    return {
      dailyUsage,
      status,
      statusMessage,
      lastCallAgo
    };
  }

  private calculateAvailability(
    dailyRemaining: number,
    hourlyRemaining: number,
    minuteRemaining: number,
    records: ApiCallRecord[]
  ): { canMakeCall: boolean; nextAvailableTime?: number } {
    
    // If any quota is exhausted, we can't make a call
    if (dailyRemaining === 0) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return { canMakeCall: false, nextAvailableTime: tomorrow.getTime() };
    }
    
    if (hourlyRemaining === 0) {
      // Find the oldest call in the last hour and add 1 hour
      const hourAgo = Date.now() - (60 * 60 * 1000);
      const hourlyRecords = records
        .filter(r => r.success && r.timestamp >= hourAgo)
        .sort((a, b) => a.timestamp - b.timestamp);
      
      if (hourlyRecords.length > 0) {
        const nextAvailable = hourlyRecords[0].timestamp + (60 * 60 * 1000);
        return { canMakeCall: false, nextAvailableTime: nextAvailable };
      }
    }
    
    if (minuteRemaining === 0) {
      // Find the oldest call in the last minute and add 1 minute
      const minuteAgo = Date.now() - (60 * 1000);
      const minuteRecords = records
        .filter(r => r.success && r.timestamp >= minuteAgo)
        .sort((a, b) => a.timestamp - b.timestamp);
      
      if (minuteRecords.length > 0) {
        const nextAvailable = minuteRecords[0].timestamp + (60 * 1000);
        return { canMakeCall: false, nextAvailableTime: nextAvailable };
      }
    }
    
    return { canMakeCall: true };
  }

  private getStoredRecords(): ApiCallRecord[] {
    if (!this.isLocalStorageAvailable()) {
      return [];
    }

    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('Error reading FDA usage data from localStorage:', error);
      return [];
    }
  }

  private saveRecords(records: ApiCallRecord[]): void {
    if (!this.isLocalStorageAvailable()) {
      return;
    }

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(records));
    } catch (error) {
      console.warn('Error saving FDA usage data to localStorage:', error);
    }
  }

  private cleanupOldRecords(): void {
    const records = this.getStoredRecords();
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
    const filteredRecords = records.filter(r => r.timestamp > cutoffTime);
    
    if (filteredRecords.length !== records.length) {
      this.saveRecords(filteredRecords);
    }
  }

  private isLocalStorageAvailable(): boolean {
    try {
      const test = '__fda_tracker_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const fdaUsageTracker = FdaUsageTracker.getInstance();
export type { UsageStats, ApiCallRecord };