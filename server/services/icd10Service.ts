interface Icd10SearchResult {
  code: string;
  description: string;
  category?: string;
}

interface Icd10ApiResponse {
  0: number; // Total count
  1: string[]; // Array of codes
  2: null;
  3: string[][]; // Array of [code, description, additional_info]
}

interface CachedIcd10Result {
  data: Icd10SearchResult[];
  timestamp: number;
  expiresAt: number;
}

interface Icd10ValidationResult {
  isValid: boolean;
  description?: string;
  category?: string;
  specialty?: string;
}

class Icd10Service {
  private static instance: Icd10Service;
  private cache = new Map<string, CachedIcd10Result>();
  private readonly baseUrl = 'https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search';
  private readonly cacheExpirationMs = 1000 * 60 * 60 * 24; // 24 hours
  private readonly requestTimeout = 10000; // 10 seconds

  private constructor() {}

  public static getInstance(): Icd10Service {
    if (!Icd10Service.instance) {
      Icd10Service.instance = new Icd10Service();
    }
    return Icd10Service.instance;
  }

  /**
   * Search for ICD-10 codes based on a search term
   * @param term - The search term (e.g., "diabetes", "heart attack")
   * @param maxResults - Maximum number of results to return (default: 20)
   * @returns Promise<Icd10SearchResult[]>
   */
  public async searchIcd10Code(term: string, maxResults: number = 20): Promise<Icd10SearchResult[]> {
    if (!term || term.trim().length === 0) {
      throw new Error('Search term cannot be empty');
    }

    const normalizedTerm = term.trim().toLowerCase();
    const cacheKey = `search:${normalizedTerm}:${maxResults}`;

    // Check cache first
    const cachedResult = this.getFromCache(cacheKey);
    if (cachedResult) {
      return cachedResult.slice(0, maxResults);
    }

    try {
      // Try NLM API first with corrected format
      const searchParams = new URLSearchParams({
        terms: normalizedTerm,
        sf: 'name',
        df: 'code,name',
        maxList: maxResults.toString()
      });

      const url = `${this.baseUrl}?${searchParams.toString()}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Medical-Compatibility-System/1.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Fallback to mock data if API is unavailable
        console.warn(`NLM API unavailable (${response.status}), using fallback data for: ${normalizedTerm}`);
        const fallbackResults = this.getFallbackSearchResults(normalizedTerm, maxResults);
        this.setCache(cacheKey, fallbackResults);
        return fallbackResults;
      }

      const data: Icd10ApiResponse = await response.json();
      const results = this.parseSearchResponse(data);

      // Cache the results
      this.setCache(cacheKey, results);

      return results.slice(0, maxResults);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('ICD-10 search request timed out');
      }
      
      // Fallback to mock data if there's any API error
      console.warn(`ICD-10 API error, using fallback data for: ${normalizedTerm}`, error);
      const fallbackResults = this.getFallbackSearchResults(normalizedTerm, maxResults);
      this.setCache(cacheKey, fallbackResults);
      return fallbackResults;
    }
  }

  /**
   * Validate and get information about a specific ICD-10 code
   * @param code - The ICD-10 code to validate (e.g., "E11.9")
   * @returns Promise<Icd10ValidationResult>
   */
  public async validateIcd10Code(code: string): Promise<Icd10ValidationResult> {
    if (!code || code.trim().length === 0) {
      return { isValid: false };
    }

    const normalizedCode = code.trim().toUpperCase();
    const cacheKey = `validate:${normalizedCode}`;

    // Check cache first
    const cachedResult = this.getValidationFromCache(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    try {
      // Try NLM API first with corrected format
      const searchParams = new URLSearchParams({
        terms: normalizedCode,
        sf: 'code',
        df: 'code,name',
        maxList: '1'
      });

      const url = `${this.baseUrl}?${searchParams.toString()}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Medical-Compatibility-System/1.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Try fallback validation
        console.warn(`NLM API unavailable for validation (${response.status}), using fallback for: ${normalizedCode}`);
        const fallbackResult = this.getFallbackValidationResult(normalizedCode);
        this.setValidationCache(cacheKey, fallbackResult);
        return fallbackResult;
      }

      const data: Icd10ApiResponse = await response.json();
      const results = this.parseSearchResponse(data);

      // Check if we found an exact match
      const exactMatch = results.find(result => result.code === normalizedCode);
      
      if (exactMatch) {
        const validationResult: Icd10ValidationResult = {
          isValid: true,
          description: exactMatch.description,
          category: exactMatch.category || this.determineCategory(normalizedCode),
          specialty: this.determineSpecialty(normalizedCode)
        };

        this.setValidationCache(cacheKey, validationResult);
        return validationResult;
      } else {
        const result: Icd10ValidationResult = { isValid: false };
        this.setValidationCache(cacheKey, result);
        return result;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('ICD-10 validation request timed out');
      }
      
      // Try fallback validation
      console.warn(`ICD-10 validation API error, using fallback for: ${normalizedCode}`, error);
      const fallbackResult = this.getFallbackValidationResult(normalizedCode);
      this.setValidationCache(cacheKey, fallbackResult);
      return fallbackResult;
    }
  }

  /**
   * Clear all cached data
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics for monitoring
   */
  public getCacheStats(): { size: number; hitRate?: number } {
    return {
      size: this.cache.size
    };
  }

  private parseSearchResponse(data: Icd10ApiResponse): Icd10SearchResult[] {
    if (!data || !Array.isArray(data[3])) {
      return [];
    }

    return data[3].map(item => ({
      code: item[0] || '',
      description: item[1] || '',
      category: this.determineCategory(item[0] || '')
    })).filter(result => result.code && result.description);
  }

  private determineCategory(code: string): string {
    if (!code) return 'Unknown';

    const firstChar = code.charAt(0).toUpperCase();
    
    // ICD-10 category mapping based on first character
    const categoryMap: { [key: string]: string } = {
      'A': 'Infectious and Parasitic Diseases',
      'B': 'Infectious and Parasitic Diseases', 
      'C': 'Neoplasms',
      'D': 'Neoplasms',
      'E': 'Endocrine, Nutritional and Metabolic Diseases',
      'F': 'Mental, Behavioral and Neurodevelopmental Disorders',
      'G': 'Diseases of the Nervous System',
      'H': 'Diseases of the Eye and Ear',
      'I': 'Diseases of the Circulatory System',
      'J': 'Diseases of the Respiratory System',
      'K': 'Diseases of the Digestive System',
      'L': 'Diseases of the Skin and Subcutaneous Tissue',
      'M': 'Diseases of the Musculoskeletal System',
      'N': 'Diseases of the Genitourinary System',
      'O': 'Pregnancy, Childbirth and the Puerperium',
      'P': 'Certain Conditions Originating in the Perinatal Period',
      'Q': 'Congenital Malformations',
      'R': 'Symptoms, Signs and Abnormal Clinical Findings',
      'S': 'Injury, Poisoning and External Causes',
      'T': 'Injury, Poisoning and External Causes',
      'V': 'External Causes of Morbidity',
      'W': 'External Causes of Morbidity',
      'X': 'External Causes of Morbidity',
      'Y': 'External Causes of Morbidity',
      'Z': 'Factors Influencing Health Status'
    };

    return categoryMap[firstChar] || 'Unknown';
  }

  private determineSpecialty(code: string): string {
    if (!code) return 'Unknown';

    const upperCode = code.toUpperCase();
    
    // Enhanced specialty mapping with specific code ranges for better accuracy
    const enhancedSpecialtyMapping = this.getEnhancedSpecialtyMapping();
    
    // Try specific code mapping first
    for (const mapping of enhancedSpecialtyMapping.specificCodes) {
      if (upperCode.startsWith(mapping.codePrefix) || mapping.codes.includes(upperCode)) {
        return mapping.specialty;
      }
    }
    
    // Try code range mapping
    for (const mapping of enhancedSpecialtyMapping.codeRanges) {
      if (this.isCodeInRange(upperCode, mapping.startCode, mapping.endCode)) {
        return mapping.specialty;
      }
    }
    
    // Fall back to basic first character mapping
    const firstChar = upperCode.charAt(0);
    const basicSpecialtyMap: { [key: string]: string } = {
      'A': 'Infectious Disease',
      'B': 'Infectious Disease',
      'C': 'Oncology',
      'D': 'Hematology', // More specific for D codes
      'E': 'Endocrinology',
      'F': 'Psychiatry',
      'G': 'Neurology',
      'H': 'Ophthalmology', // H00-H59 are eye, H60-H95 are ear
      'I': 'Cardiology',
      'J': 'Pulmonology',
      'K': 'Gastroenterology',
      'L': 'Dermatology',
      'M': 'Rheumatology', // More specific for musculoskeletal
      'N': 'Nephrology', // N00-N39 are kidney, N40-N99 are genitourinary
      'O': 'Obstetrics and Gynecology',
      'P': 'Neonatology', // More specific for perinatal
      'Q': 'Medical Genetics',
      'R': 'Internal Medicine',
      'S': 'Trauma Surgery',
      'T': 'Emergency Medicine',
      'V': 'Emergency Medicine',
      'W': 'Emergency Medicine',
      'X': 'Emergency Medicine',
      'Y': 'Emergency Medicine',
      'Z': 'Family Medicine' // More appropriate for health status factors
    };

    return basicSpecialtyMap[firstChar] || 'Internal Medicine';
  }

  /**
   * Enhanced specialty mapping with specific code ranges and conditions
   */
  private getEnhancedSpecialtyMapping() {
    return {
      specificCodes: [
        // Cardiology - more specific mappings
        { codePrefix: 'I20', specialty: 'Cardiology', codes: [] }, // Angina pectoris
        { codePrefix: 'I21', specialty: 'Cardiology', codes: [] }, // Acute myocardial infarction
        { codePrefix: 'I25', specialty: 'Cardiology', codes: [] }, // Chronic ischemic heart disease
        { codePrefix: 'I35', specialty: 'Cardiothoracic Surgery', codes: [] }, // Aortic valve disorders
        { codePrefix: 'I42', specialty: 'Cardiology', codes: [] }, // Cardiomyopathy
        { codePrefix: 'I48', specialty: 'Electrophysiology', codes: [] }, // Atrial fibrillation
        { codePrefix: 'I50', specialty: 'Cardiology', codes: [] }, // Heart failure
        
        // Endocrinology - specific conditions
        { codePrefix: 'E10', specialty: 'Endocrinology', codes: [] }, // Type 1 diabetes
        { codePrefix: 'E11', specialty: 'Endocrinology', codes: [] }, // Type 2 diabetes
        { codePrefix: 'E05', specialty: 'Endocrinology', codes: [] }, // Hyperthyroidism
        { codePrefix: 'E06', specialty: 'Endocrinology', codes: [] }, // Thyroiditis
        { codePrefix: 'E27', specialty: 'Endocrinology', codes: [] }, // Adrenal disorders
        
        // Nephrology - kidney specific
        { codePrefix: 'N17', specialty: 'Nephrology', codes: [] }, // Acute kidney failure
        { codePrefix: 'N18', specialty: 'Nephrology', codes: [] }, // Chronic kidney disease
        { codePrefix: 'N00', specialty: 'Nephrology', codes: [] }, // Glomerular diseases
        { codePrefix: 'N04', specialty: 'Nephrology', codes: [] }, // Nephrotic syndrome
        
        // Urology - genitourinary
        { codePrefix: 'N40', specialty: 'Urology', codes: [] }, // Benign prostatic hyperplasia
        { codePrefix: 'N20', specialty: 'Urology', codes: [] }, // Calculus of kidney and ureter
        { codePrefix: 'N39', specialty: 'Urology', codes: [] }, // Urinary tract disorders
        
        // Pulmonology - respiratory specific
        { codePrefix: 'J44', specialty: 'Pulmonology', codes: [] }, // COPD
        { codePrefix: 'J45', specialty: 'Pulmonology', codes: [] }, // Asthma
        { codePrefix: 'J18', specialty: 'Pulmonology', codes: [] }, // Pneumonia
        { codePrefix: 'J84', specialty: 'Pulmonology', codes: [] }, // Interstitial lung diseases
        
        // Gastroenterology - specific conditions
        { codePrefix: 'K25', specialty: 'Gastroenterology', codes: [] }, // Gastric ulcer
        { codePrefix: 'K50', specialty: 'Gastroenterology', codes: [] }, // Crohn's disease
        { codePrefix: 'K51', specialty: 'Gastroenterology', codes: [] }, // Ulcerative colitis
        { codePrefix: 'K70', specialty: 'Hepatology', codes: [] }, // Alcoholic liver disease
        { codePrefix: 'K72', specialty: 'Hepatology', codes: [] }, // Hepatic failure
        { codePrefix: 'K76', specialty: 'Hepatology', codes: [] }, // Other diseases of liver
        
        // Neurology - specific conditions
        { codePrefix: 'G40', specialty: 'Epileptology', codes: [] }, // Epilepsy
        { codePrefix: 'G35', specialty: 'Multiple Sclerosis', codes: [] }, // Multiple sclerosis
        { codePrefix: 'G20', specialty: 'Movement Disorders', codes: [] }, // Parkinson's disease
        { codePrefix: 'G93', specialty: 'Neurology', codes: [] }, // Other disorders of brain
        
        // Oncology - cancer specific
        { codePrefix: 'C78', specialty: 'Medical Oncology', codes: [] }, // Secondary malignant neoplasm
        { codePrefix: 'C80', specialty: 'Medical Oncology', codes: [] }, // Malignant neoplasm, unspecified
        
        // Hematology - blood disorders
        { codePrefix: 'D50', specialty: 'Hematology', codes: [] }, // Iron deficiency anemia
        { codePrefix: 'D64', specialty: 'Hematology', codes: [] }, // Other anemias
        { codePrefix: 'D65', specialty: 'Hematology', codes: [] }, // Disseminated intravascular coagulation
        { codePrefix: 'D68', specialty: 'Hematology', codes: [] }, // Other coagulation defects
        { codePrefix: 'D69', specialty: 'Hematology', codes: [] }, // Purpura and other hemorrhagic conditions
        
        // Rheumatology - autoimmune and joint diseases
        { codePrefix: 'M05', specialty: 'Rheumatology', codes: [] }, // Rheumatoid arthritis
        { codePrefix: 'M32', specialty: 'Rheumatology', codes: [] }, // Systemic lupus erythematosus
        { codePrefix: 'M79', specialty: 'Rheumatology', codes: [] }, // Other soft tissue disorders
        
        // Orthopedics - bone and joint specific
        { codePrefix: 'M84', specialty: 'Orthopedic Surgery', codes: [] }, // Disorders of continuity of bone
        { codePrefix: 'S72', specialty: 'Orthopedic Surgery', codes: [] }, // Fracture of femur
        
        // ENT - ear, nose, throat
        { codePrefix: 'H60', specialty: 'Otolaryngology', codes: [] }, // Otitis externa
        { codePrefix: 'H65', specialty: 'Otolaryngology', codes: [] }, // Nonsuppurative otitis media
        { codePrefix: 'H66', specialty: 'Otolaryngology', codes: [] }, // Suppurative otitis media
        { codePrefix: 'J30', specialty: 'Otolaryngology', codes: [] }, // Vasomotor and allergic rhinitis
        
        // Pain Management - chronic pain conditions
        { codePrefix: 'M54', specialty: 'Pain Management', codes: [] }, // Dorsalgia (back pain)
        { codePrefix: 'G89', specialty: 'Pain Management', codes: [] }, // Pain, not elsewhere classified
        
        // Emergency Medicine - trauma and acute conditions
        { codePrefix: 'R57', specialty: 'Critical Care Medicine', codes: [] }, // Shock
        { codePrefix: 'R50', specialty: 'Emergency Medicine', codes: [] }, // Fever
        { codePrefix: 'T78', specialty: 'Allergy and Immunology', codes: [] }, // Adverse effects
        
        // Psychiatry - mental health specific
        { codePrefix: 'F20', specialty: 'Psychiatry', codes: [] }, // Schizophrenia
        { codePrefix: 'F31', specialty: 'Psychiatry', codes: [] }, // Bipolar disorder
        { codePrefix: 'F32', specialty: 'Psychiatry', codes: [] }, // Major depressive disorder
        { codePrefix: 'F41', specialty: 'Psychiatry', codes: [] }, // Other anxiety disorders
        { codePrefix: 'F90', specialty: 'Child Psychiatry', codes: [] } // ADHD
      ],
      
      codeRanges: [
        // Ophthalmology
        { startCode: 'H00', endCode: 'H59', specialty: 'Ophthalmology' },
        
        // Otolaryngology
        { startCode: 'H60', endCode: 'H95', specialty: 'Otolaryngology' },
        
        // Obstetrics (pregnancy related)
        { startCode: 'O00', endCode: 'O9A', specialty: 'Obstetrics and Gynecology' },
        
        // Pediatrics - perinatal conditions
        { startCode: 'P00', endCode: 'P96', specialty: 'Neonatology' },
        
        // Congenital malformations
        { startCode: 'Q00', endCode: 'Q99', specialty: 'Medical Genetics' },
        
        // Mental health in children
        { startCode: 'F90', endCode: 'F98', specialty: 'Child Psychiatry' }
      ]
    };
  }

  /**
   * Check if a code falls within a specific range
   */
  private isCodeInRange(code: string, startCode: string, endCode: string): boolean {
    // Simple alphabetical comparison for ICD-10 codes
    return code >= startCode && code <= endCode;
  }

  private getFromCache(key: string): Icd10SearchResult[] | null {
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

  private getValidationFromCache(key: string): Icd10ValidationResult | null {
    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached.data as unknown as Icd10ValidationResult;
  }

  private setCache(key: string, data: Icd10SearchResult[]): void {
    const cached: CachedIcd10Result = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.cacheExpirationMs
    };

    this.cache.set(key, cached);

    // Clean up expired entries periodically
    if (this.cache.size > 1000) {
      this.cleanupExpiredEntries();
    }
  }

  private setValidationCache(key: string, data: Icd10ValidationResult): void {
    const cached = {
      data: data as unknown as Icd10SearchResult[],
      timestamp: Date.now(),
      expiresAt: Date.now() + this.cacheExpirationMs
    };

    this.cache.set(key, cached);
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    Array.from(this.cache.entries()).forEach(([key, value]) => {
      if (now > value.expiresAt) {
        this.cache.delete(key);
      }
    });
  }

  private getFallbackSearchResults(term: string, maxResults: number): Icd10SearchResult[] {
    // Common ICD-10 codes that can be returned as fallback data
    const fallbackData: Icd10SearchResult[] = [
      { code: "E11.9", description: "Type 2 diabetes mellitus without complications", category: "Endocrine, Nutritional and Metabolic Diseases" },
      { code: "E11.65", description: "Type 2 diabetes mellitus with hyperglycemia", category: "Endocrine, Nutritional and Metabolic Diseases" },
      { code: "I21.9", description: "Acute myocardial infarction, unspecified", category: "Diseases of the Circulatory System" },
      { code: "J45.9", description: "Asthma, unspecified", category: "Diseases of the Respiratory System" },
      { code: "N18.6", description: "End stage renal disease", category: "Diseases of the Genitourinary System" },
      { code: "K25.9", description: "Gastric ulcer, unspecified", category: "Diseases of the Digestive System" },
      { code: "F31.2", description: "Bipolar disorder, current episode manic", category: "Mental, Behavioral and Neurodevelopmental Disorders" },
      { code: "G40.9", description: "Epilepsy, unspecified", category: "Diseases of the Nervous System" },
      { code: "K50.90", description: "Crohn's disease, unspecified, without complications", category: "Diseases of the Digestive System" }
    ];

    const termLower = term.toLowerCase();
    
    // Filter results based on search term
    const filtered = fallbackData.filter(item => 
      item.description.toLowerCase().includes(termLower) ||
      item.code.toLowerCase().includes(termLower) ||
      item.category?.toLowerCase().includes(termLower)
    );

    return filtered.slice(0, maxResults);
  }

  private getFallbackValidationResult(code: string): Icd10ValidationResult {
    // Common ICD-10 codes that can be validated
    const knownCodes: { [key: string]: { description: string; category: string } } = {
      "E11.9": { description: "Type 2 diabetes mellitus without complications", category: "Endocrine, Nutritional and Metabolic Diseases" },
      "E11.65": { description: "Type 2 diabetes mellitus with hyperglycemia", category: "Endocrine, Nutritional and Metabolic Diseases" },
      "I21.9": { description: "Acute myocardial infarction, unspecified", category: "Diseases of the Circulatory System" },
      "J45.9": { description: "Asthma, unspecified", category: "Diseases of the Respiratory System" },
      "N18.6": { description: "End stage renal disease", category: "Diseases of the Genitourinary System" },
      "K25.9": { description: "Gastric ulcer, unspecified", category: "Diseases of the Digestive System" },
      "F31.2": { description: "Bipolar disorder, current episode manic", category: "Mental, Behavioral and Neurodevelopmental Disorders" },
      "G40.9": { description: "Epilepsy, unspecified", category: "Diseases of the Nervous System" },
      "K50.90": { description: "Crohn's disease, unspecified, without complications", category: "Diseases of the Digestive System" }
    };

    const known = knownCodes[code];
    if (known) {
      return {
        isValid: true,
        description: known.description,
        category: known.category,
        specialty: this.determineSpecialty(code)
      };
    }

    // For unknown codes, try to determine validity based on format
    const isValidFormat = /^[A-Z]\d{2}(\.\d+)?$/.test(code);
    if (isValidFormat) {
      return {
        isValid: true,
        description: `ICD-10 code (fallback validation)`,
        category: this.determineCategory(code),
        specialty: this.determineSpecialty(code)
      };
    }

    return { isValid: false };
  }
}

export const icd10Service = Icd10Service.getInstance();
export type { Icd10SearchResult, Icd10ValidationResult };