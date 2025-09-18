import type { CompatibilityConfig } from "@shared/schema";
import { defaultCompatibilityConfig } from "@shared/schema";

const STORAGE_KEY = "medicalAnalysis.compatibilityConfig";

/**
 * Validates if a loaded config object has the correct structure
 */
function isValidCompatibilityConfig(config: any): config is CompatibilityConfig {
  if (!config || typeof config !== 'object') return false;
  
  const { compatible, needsReview, incompatible } = config;
  
  if (!compatible || !needsReview || !incompatible) return false;
  
  // Check compatible structure
  if (!Array.isArray(compatible.riskLevels) || typeof compatible.requiresCompatibleFlag !== 'boolean') {
    return false;
  }
  
  // Check needsReview structure
  if (!Array.isArray(needsReview.riskLevels)) {
    return false;
  }
  
  // Check incompatible structure
  if (!Array.isArray(incompatible.riskLevels) || typeof incompatible.includeIncompatibleFlag !== 'boolean') {
    return false;
  }
  
  // Validate risk level values
  const validRiskLevels = ["low", "medium", "high"];
  const allRiskLevels = [
    ...compatible.riskLevels,
    ...needsReview.riskLevels,
    ...incompatible.riskLevels
  ];
  
  return allRiskLevels.every(level => validRiskLevels.includes(level));
}

/**
 * Saves compatibility configuration to localStorage
 */
export function saveCompatibilityConfig(config: CompatibilityConfig): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      console.warn('localStorage is not available');
      return false;
    }
    
    const serialized = JSON.stringify(config);
    localStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch (error) {
    console.error('Failed to save compatibility config to localStorage:', error);
    
    // Handle quota exceeded error specifically
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded. Cannot save compatibility configuration.');
    }
    
    return false;
  }
}

/**
 * Loads compatibility configuration from localStorage with fallback to default
 */
export function loadCompatibilityConfig(): CompatibilityConfig {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      console.warn('localStorage is not available, using default config');
      return defaultCompatibilityConfig;
    }
    
    const serialized = localStorage.getItem(STORAGE_KEY);
    
    if (!serialized) {
      // No saved config, return default
      return defaultCompatibilityConfig;
    }
    
    const parsed = JSON.parse(serialized);
    
    if (isValidCompatibilityConfig(parsed)) {
      return parsed;
    } else {
      console.warn('Invalid compatibility config found in localStorage, using default');
      // Clear invalid config
      clearCompatibilityConfig();
      return defaultCompatibilityConfig;
    }
  } catch (error) {
    console.error('Failed to load compatibility config from localStorage:', error);
    
    // Clear corrupted data
    clearCompatibilityConfig();
    return defaultCompatibilityConfig;
  }
}

/**
 * Clears compatibility configuration from localStorage
 */
export function clearCompatibilityConfig(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (error) {
    console.error('Failed to clear compatibility config from localStorage:', error);
    return false;
  }
}

/**
 * Checks if localStorage is available and functional
 */
export function isLocalStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    
    // Test localStorage functionality
    const testKey = '__localStorage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}