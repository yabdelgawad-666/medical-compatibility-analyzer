import { ResilientApiClient } from '../utils/errorHandler';

interface MedicationSearchResult {
  brandName: string;
  genericName: string;
  activeIngredients: string[];
  dosageForm?: string;
  manufacturer?: string;
  ndc?: string;
}

interface MedicationContraindication {
  condition: string;
  severity: 'contraindicated' | 'warning' | 'precaution';
  description: string;
}

interface OpenFdaApiResponse {
  results?: OpenFdaDrugLabel[];
  error?: {
    code: string;
    message: string;
  };
}

interface OpenFdaDrugLabel {
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    substance_name?: string[];
    manufacturer_name?: string[];
    product_ndc?: string[];
    dosage_form?: string[];
  };
  contraindications?: string[];
  warnings?: string[];
  precautions?: string[];
  drug_interactions?: string[];
  active_ingredient?: string[];
}

interface CachedMedicationResult {
  data: MedicationSearchResult[] | MedicationContraindication[];
  timestamp: number;
  expiresAt: number;
}

interface RateLimitState {
  requests: number;
  resetTime: number;
}

interface ApiCallRecord {
  timestamp: number;
  endpoint: string;
  success: boolean;
  errorType?: string;
  responseTimeMs?: number;
}

interface DetailedUsageStats {
  dailyUsage: number;
  hourlyUsage: number;
  minuteUsage: number;
  lastCall?: number;
  canMakeCall: boolean;
  quotaInfo: {
    dailyLimit: number;
    hourlyLimit: number;
    minuteLimit: number;
    dailyRemaining: number;
    hourlyRemaining: number;
    minuteRemaining: number;
  };
  recentActivity: ApiCallRecord[];
  errorRate: number;
  cacheSize: number;
}

class MedicationService {
  private static instance: MedicationService;
  private cache = new Map<string, CachedMedicationResult>();
  private readonly baseUrl = 'https://api.fda.gov/drug/label.json';
  private readonly cacheExpirationMs = 1000 * 60 * 60 * 12; // 12 hours
  private readonly requestTimeout = 15000; // 15 seconds
  private rateLimit: RateLimitState = { requests: 0, resetTime: Date.now() + 3600000 }; // Reset hourly
  
  // Comprehensive usage tracking
  private apiCallHistory: ApiCallRecord[] = [];
  private readonly maxHistoryRecords = 2000; // Keep recent history for analysis
  
  // Configurable FDA API limits (can be updated based on API key presence)
  private apiLimits = {
    dailyLimit: 1000,      // Default without API key
    hourlyLimit: 240,      // 240 requests per hour (4 per second)
    minuteLimit: 240,      // 240 requests per minute
  };
  
  // Enhanced error handling and resilience
  private resilientClient: ResilientApiClient;

  private constructor() {
    this.resilientClient = new ResilientApiClient('FDA_API', this.requestTimeout);
    
    // Configure API limits based on API key availability
    this.configureApiLimitsFromEnvironment();
  }

  /**
   * Configure API limits based on environment (API key presence)
   */
  private configureApiLimitsFromEnvironment(): void {
    // Check for FDA API key in environment variables
    const fdaApiKey = process.env.FDA_API_KEY || process.env.OPENFDA_API_KEY;
    
    if (fdaApiKey && fdaApiKey.trim() !== '') {
      // With API key: much higher limits
      this.apiLimits = {
        dailyLimit: 120000,    // 120,000 requests per day with API key
        hourlyLimit: 5000,     // 5,000 requests per hour with API key
        minuteLimit: 240,      // Still 240 per minute (4/second burst)
      };
      console.log('FDA API: Using enhanced limits (API key detected)');
    } else {
      // Without API key: default limits
      this.apiLimits = {
        dailyLimit: 1000,      // 1,000 requests per day without API key
        hourlyLimit: 240,      // 240 requests per hour without API key
        minuteLimit: 240,      // 240 requests per minute (4/second)
      };
      console.log('FDA API: Using standard limits (no API key)');
    }
  }

  /**
   * Get API configuration information
   */
  public getApiConfig(): { hasApiKey: boolean; limits: { dailyLimit: number; hourlyLimit: number; minuteLimit: number } } {
    const fdaApiKey = process.env.FDA_API_KEY || process.env.OPENFDA_API_KEY;
    return {
      hasApiKey: !!(fdaApiKey && fdaApiKey.trim() !== ''),
      limits: { ...this.apiLimits }
    };
  }

  public static getInstance(): MedicationService {
    if (!MedicationService.instance) {
      MedicationService.instance = new MedicationService();
    }
    return MedicationService.instance;
  }

  /**
   * Search for medications by name
   * @param name - The medication name to search for
   * @param maxResults - Maximum number of results to return (default: 10)
   * @returns Promise<MedicationSearchResult[]>
   */
  public async searchMedication(name: string, maxResults: number = 10): Promise<MedicationSearchResult[]> {
    if (!name || name.trim().length === 0) {
      throw new Error('Medication name cannot be empty');
    }

    const normalizedName = name.trim().toLowerCase();
    const cacheKey = `search:${normalizedName}:${maxResults}`;

    // Check cache first
    const cachedResult = this.getFromCache(cacheKey) as MedicationSearchResult[] | null;
    if (cachedResult) {
      return cachedResult.slice(0, maxResults);
    }

    await this.checkRateLimit();

    try {
      // Search by brand name and generic name
      const searchQueries = [
        `openfda.brand_name:"${name}"`,
        `openfda.generic_name:"${name}"`,
        `openfda.substance_name:"${name}"`
      ];

      const searchQuery = searchQueries.join(' OR ');
      const searchParams = new URLSearchParams({
        search: searchQuery,
        limit: Math.min(maxResults * 2, 100).toString() // Get more results to filter later
      });

      const url = `${this.baseUrl}?${searchParams.toString()}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
      const startTime = Date.now();

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Medical-Compatibility-System/1.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      
      this.incrementRateLimit();
      this.recordApiCall('search', response.ok, responseTime);

      if (!response.ok) {
        this.recordApiCall('search', false, responseTime, `HTTP_${response.status}`);
        throw new Error(`OpenFDA API request failed: ${response.status} ${response.statusText}`);
      }

      const data: OpenFdaApiResponse = await response.json();
      
      if (data.error) {
        this.recordApiCall('search', false, responseTime, `FDA_ERROR`);
        throw new Error(`OpenFDA API error: ${data.error.message}`);
      }

      const results = this.parseSearchResponse(data, name);

      // Cache the results
      this.setCache(cacheKey, results);

      return results.slice(0, maxResults);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.recordApiCall('search', false, undefined, 'TIMEOUT');
        throw new Error('Medication search request timed out');
      }
      if (!(error instanceof Error) || !error.toString().includes('OpenFDA API')) {
        this.recordApiCall('search', false, undefined, 'NETWORK_ERROR');
      }
      throw new Error(`Failed to search medications: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get contraindications for a specific medication
   * @param name - The medication name
   * @returns Promise<MedicationContraindication[]>
   */
  public async getMedicationContraindications(name: string): Promise<MedicationContraindication[]> {
    if (!name || name.trim().length === 0) {
      throw new Error('Medication name cannot be empty');
    }

    const normalizedName = name.trim().toLowerCase();
    const cacheKey = `contraindications:${normalizedName}`;

    // Check cache first
    const cachedResult = this.getFromCache(cacheKey) as MedicationContraindication[] | null;
    if (cachedResult) {
      return cachedResult;
    }

    await this.checkRateLimit();

    try {
      // Search for the specific medication
      const searchQuery = `openfda.brand_name:"${name}" OR openfda.generic_name:"${name}" OR openfda.substance_name:"${name}"`;
      const searchParams = new URLSearchParams({
        search: searchQuery,
        limit: '5' // We only need a few results to get contraindications
      });

      const url = `${this.baseUrl}?${searchParams.toString()}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
      const startTime = Date.now();

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Medical-Compatibility-System/1.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      
      this.incrementRateLimit();
      this.recordApiCall('search', response.ok, responseTime);

      if (!response.ok) {
        this.recordApiCall('search', false, responseTime, `HTTP_${response.status}`);
        throw new Error(`OpenFDA API request failed: ${response.status} ${response.statusText}`);
      }

      const data: OpenFdaApiResponse = await response.json();
      
      if (data.error) {
        this.recordApiCall('search', false, responseTime, `FDA_ERROR`);
        throw new Error(`OpenFDA API error: ${data.error.message}`);
      }

      const contraindications = this.parseContraindications(data);

      // Cache the results
      this.setCache(cacheKey, contraindications);

      return contraindications;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Medication contraindications request timed out');
      }
      throw new Error(`Failed to get medication contraindications: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get active ingredients for a medication
   * @param name - The medication name
   * @returns Promise<string[]>
   */
  public async getActiveIngredients(name: string): Promise<string[]> {
    try {
      const medications = await this.searchMedication(name, 1);
      if (medications.length > 0) {
        return medications[0].activeIngredients;
      }
      return [];
    } catch (error) {
      console.warn(`Failed to get active ingredients for ${name}:`, error);
      return [];
    }
  }

  /**
   * Check if two medications have potential interactions
   * @param medication1 - First medication name
   * @param medication2 - Second medication name
   * @returns Promise<boolean>
   */
  public async checkDrugInteraction(medication1: string, medication2: string): Promise<boolean> {
    try {
      const contraindications1 = await this.getMedicationContraindications(medication1);
      const contraindications2 = await this.getMedicationContraindications(medication2);
      
      // Simple check - in a real system this would be more sophisticated
      const med1Lower = medication1.toLowerCase();
      const med2Lower = medication2.toLowerCase();
      
      const hasInteraction1 = contraindications1.some(c => 
        c.description.toLowerCase().includes(med2Lower)
      );
      
      const hasInteraction2 = contraindications2.some(c => 
        c.description.toLowerCase().includes(med1Lower)
      );
      
      return hasInteraction1 || hasInteraction2;
    } catch (error) {
      console.warn(`Failed to check drug interaction between ${medication1} and ${medication2}:`, error);
      return false;
    }
  }

  /**
   * Clear all cached data
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Configure API limits (e.g., when API key is detected)
   */
  public configureApiLimits(limits: { dailyLimit?: number; hourlyLimit?: number; minuteLimit?: number }): void {
    if (limits.dailyLimit) this.apiLimits.dailyLimit = limits.dailyLimit;
    if (limits.hourlyLimit) this.apiLimits.hourlyLimit = limits.hourlyLimit;
    if (limits.minuteLimit) this.apiLimits.minuteLimit = limits.minuteLimit;
  }

  /**
   * Record an API call for comprehensive tracking
   */
  private recordApiCall(endpoint: string, success: boolean, responseTimeMs?: number, errorType?: string): void {
    const record: ApiCallRecord = {
      timestamp: Date.now(),
      endpoint,
      success,
      responseTimeMs,
      errorType
    };

    this.apiCallHistory.push(record);

    // Keep only recent records to manage memory
    if (this.apiCallHistory.length > this.maxHistoryRecords) {
      // Remove older half of records
      this.apiCallHistory = this.apiCallHistory.slice(-Math.floor(this.maxHistoryRecords / 2));
    }
  }

  /**
   * Get comprehensive usage statistics for monitoring and status reporting
   */
  public getDetailedStats(): DetailedUsageStats {
    const now = Date.now();
    
    // Calculate time boundaries
    const dayStart = new Date().setHours(0, 0, 0, 0);
    const hourStart = now - (60 * 60 * 1000);
    const minuteStart = now - (60 * 1000);

    // Filter successful calls for usage counting
    const successfulCalls = this.apiCallHistory.filter(r => r.success);
    
    // Count usage in different time windows
    const dailyUsage = successfulCalls.filter(r => r.timestamp >= dayStart).length;
    const hourlyUsage = successfulCalls.filter(r => r.timestamp >= hourStart).length;
    const minuteUsage = successfulCalls.filter(r => r.timestamp >= minuteStart).length;

    // Find last call timestamp
    const lastCall = this.apiCallHistory.length > 0 
      ? Math.max(...this.apiCallHistory.map(r => r.timestamp)) 
      : undefined;

    // Calculate remaining quotas
    const dailyRemaining = Math.max(0, this.apiLimits.dailyLimit - dailyUsage);
    const hourlyRemaining = Math.max(0, this.apiLimits.hourlyLimit - hourlyUsage);
    const minuteRemaining = Math.max(0, this.apiLimits.minuteLimit - minuteUsage);

    // Check if we can make a call
    const canMakeCall = dailyRemaining > 0 && hourlyRemaining > 0 && minuteRemaining > 0;

    // Calculate error rate for last 24 hours
    const recentCalls = this.apiCallHistory.filter(r => r.timestamp >= (now - 24 * 60 * 60 * 1000));
    const errorRate = recentCalls.length > 0 
      ? (recentCalls.filter(r => !r.success).length / recentCalls.length) * 100 
      : 0;

    return {
      dailyUsage,
      hourlyUsage,
      minuteUsage,
      lastCall,
      canMakeCall,
      quotaInfo: {
        dailyLimit: this.apiLimits.dailyLimit,
        hourlyLimit: this.apiLimits.hourlyLimit,
        minuteLimit: this.apiLimits.minuteLimit,
        dailyRemaining,
        hourlyRemaining,
        minuteRemaining
      },
      recentActivity: this.apiCallHistory.slice(-20), // Last 20 calls
      errorRate: Math.round(errorRate * 10) / 10, // Round to 1 decimal
      cacheSize: this.cache.size
    };
  }

  /**
   * Get cache and rate limit statistics for monitoring (backward compatibility)
   */
  public getStats(): { cacheSize: number; requestsThisHour: number; rateLimitReset: number } {
    const detailed = this.getDetailedStats();
    return {
      cacheSize: detailed.cacheSize,
      requestsThisHour: detailed.hourlyUsage,
      rateLimitReset: this.rateLimit.resetTime
    };
  }

  private parseSearchResponse(data: OpenFdaApiResponse, searchTerm: string): MedicationSearchResult[] {
    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }

    const results: MedicationSearchResult[] = [];
    const seenCombinations = new Set<string>();

    for (const item of data.results) {
      if (!item.openfda) continue;

      const brandNames = item.openfda.brand_name || [];
      const genericNames = item.openfda.generic_name || [];
      const activeIngredients = item.openfda.substance_name || item.active_ingredient || [];
      const dosageForms = item.openfda.dosage_form || [];
      const manufacturers = item.openfda.manufacturer_name || [];
      const ndcs = item.openfda.product_ndc || [];

      // Create combinations of brand/generic names
      const allNames = [...brandNames, ...genericNames];
      
      for (const name of allNames) {
        if (!name) continue;

        const key = `${name}-${activeIngredients.join(',')}-${dosageForms.join(',')}`;
        if (seenCombinations.has(key)) continue;
        seenCombinations.add(key);

        const result: MedicationSearchResult = {
          brandName: brandNames[0] || name,
          genericName: genericNames[0] || name,
          activeIngredients: activeIngredients,
          dosageForm: dosageForms[0],
          manufacturer: manufacturers[0],
          ndc: ndcs[0]
        };

        results.push(result);

        if (results.length >= 20) break; // Limit results
      }

      if (results.length >= 20) break;
    }

    // Sort by relevance to search term
    return results.sort((a, b) => {
      const aScore = this.calculateRelevanceScore(a, searchTerm);
      const bScore = this.calculateRelevanceScore(b, searchTerm);
      return bScore - aScore;
    });
  }

  private calculateRelevanceScore(medication: MedicationSearchResult, searchTerm: string): number {
    const term = searchTerm.toLowerCase();
    let score = 0;

    if (medication.brandName.toLowerCase() === term) score += 100;
    else if (medication.brandName.toLowerCase().includes(term)) score += 50;

    if (medication.genericName.toLowerCase() === term) score += 90;
    else if (medication.genericName.toLowerCase().includes(term)) score += 40;

    for (const ingredient of medication.activeIngredients) {
      if (ingredient.toLowerCase() === term) score += 80;
      else if (ingredient.toLowerCase().includes(term)) score += 30;
    }

    return score;
  }

  private parseContraindications(data: OpenFdaApiResponse): MedicationContraindication[] {
    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }

    const contraindications: MedicationContraindication[] = [];
    const seen = new Set<string>();

    for (const item of data.results) {
      // Parse contraindications
      if (item.contraindications) {
        for (const contraindication of item.contraindications) {
          const conditions = this.extractConditions(contraindication, 'contraindicated');
          for (const condition of conditions) {
            const key = `contraindicated:${condition.condition}`;
            if (!seen.has(key)) {
              seen.add(key);
              contraindications.push(condition);
            }
          }
        }
      }

      // Parse warnings
      if (item.warnings) {
        for (const warning of item.warnings) {
          const conditions = this.extractConditions(warning, 'warning');
          for (const condition of conditions) {
            const key = `warning:${condition.condition}`;
            if (!seen.has(key)) {
              seen.add(key);
              contraindications.push(condition);
            }
          }
        }
      }

      // Parse precautions
      if (item.precautions) {
        for (const precaution of item.precautions) {
          const conditions = this.extractConditions(precaution, 'precaution');
          for (const condition of conditions) {
            const key = `precaution:${condition.condition}`;
            if (!seen.has(key)) {
              seen.add(key);
              contraindications.push(condition);
            }
          }
        }
      }
    }

    return contraindications.slice(0, 50); // Limit results
  }

  private extractConditions(text: string, severity: 'contraindicated' | 'warning' | 'precaution'): MedicationContraindication[] {
    if (!text || typeof text !== 'string') return [];

    const conditions: MedicationContraindication[] = [];
    
    // Common medical condition patterns
    const conditionPatterns = [
      /\b(?:patients with|history of|known|diagnosed with|suffering from)\s+([^.;,]+)/gi,
      /\b(?:in|for)\s+(pregnant|nursing|elderly|pediatric|geriatric)\s+patients/gi,
      /\b(?:renal|kidney|liver|hepatic|cardiac|heart|respiratory|pulmonary)\s+(?:impairment|disease|failure|dysfunction)/gi,
      /\b(?:diabetes|hypertension|asthma|epilepsy|depression|anxiety|bipolar)\b/gi,
      /\b(?:allergy|allergic reaction|hypersensitivity)\s+to\s+([^.;,]+)/gi
    ];

    for (const pattern of conditionPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const condition = match[1] ? match[1].trim() : match[0].trim();
        if (condition.length > 3 && condition.length < 100) {
          conditions.push({
            condition: this.cleanConditionText(condition),
            severity,
            description: text.substring(0, 200) + (text.length > 200 ? '...' : '')
          });
        }
      }
    }

    // If no specific conditions found, create a general one
    if (conditions.length === 0 && text.length > 10) {
      conditions.push({
        condition: 'General contraindication',
        severity,
        description: text.substring(0, 200) + (text.length > 200 ? '...' : '')
      });
    }

    return conditions;
  }

  private cleanConditionText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Reset counter if an hour has passed
    if (now >= this.rateLimit.resetTime) {
      this.rateLimit.requests = 0;
      this.rateLimit.resetTime = now + 3600000; // Next hour
    }

    // Check if we're at the limit
    if (this.rateLimit.requests >= this.apiLimits.hourlyLimit) {
      const waitTime = this.rateLimit.resetTime - now;
      throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(waitTime / 60000)} minutes before making more requests.`);
    }
  }

  private incrementRateLimit(): void {
    this.rateLimit.requests++;
  }

  private getFromCache(key: string): MedicationSearchResult[] | MedicationContraindication[] | null {
    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private setCache(key: string, data: MedicationSearchResult[] | MedicationContraindication[]): void {
    const cached: CachedMedicationResult = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.cacheExpirationMs
    };

    this.cache.set(key, cached);

    // Clean up expired entries periodically
    if (this.cache.size > 500) {
      this.cleanupExpiredEntries();
    }
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    Array.from(this.cache.entries()).forEach(([key, value]) => {
      if (now > value.expiresAt) {
        this.cache.delete(key);
      }
    });
  }
}

export const medicationService = MedicationService.getInstance();
export type { MedicationSearchResult, MedicationContraindication };