import { 
  type MedicalRecord, 
  type InsertMedicalRecord,
  type AnalysisResult,
  type InsertAnalysisResult,
  type Icd10Code,
  type InsertIcd10Code,
  type Medication,
  type InsertMedication,
  type DashboardStats,
  type SpecialtyData,
  type CompatibilityConfig,
  defaultCompatibilityConfig,
  medicalRecords,
  analysisResults,
  icd10Codes,
  medications
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, count, sql } from "drizzle-orm";
import { icd10Service } from "./services/icd10Service";
import { medicationService, type MedicationSearchResult, type MedicationContraindication } from "./services/medicationService";

export interface IStorage {
  // Medical Records
  getMedicalRecord(id: string): Promise<MedicalRecord | undefined>;
  getAllMedicalRecords(): Promise<MedicalRecord[]>;
  createMedicalRecord(record: InsertMedicalRecord): Promise<MedicalRecord>;
  createMedicalRecords(records: InsertMedicalRecord[]): Promise<MedicalRecord[]>;
  
  // Analysis Results
  getAnalysisResult(id: string): Promise<AnalysisResult | undefined>;
  getAllAnalysisResults(): Promise<AnalysisResult[]>;
  createAnalysisResult(result: InsertAnalysisResult): Promise<AnalysisResult>;
  
  // ICD-10 Codes
  getIcd10Code(code: string): Promise<Icd10Code | undefined>;
  getAllIcd10Codes(): Promise<Icd10Code[]>;
  searchIcd10Codes(searchTerm: string, maxResults?: number): Promise<Icd10Code[]>;
  createIcd10Code(icd10: InsertIcd10Code): Promise<Icd10Code>;
  
  // Medications
  getMedication(name: string): Promise<Medication | undefined>;
  getMedicationByActiveIngredient(ingredient: string): Promise<Medication | undefined>;
  getAllMedications(): Promise<Medication[]>;
  searchMedicationsFDA(searchTerm: string, maxResults?: number): Promise<MedicationSearchResult[]>;
  getMedicationContraindications(medicationName: string): Promise<MedicationContraindication[]>;
  createMedication(medication: InsertMedication): Promise<Medication>;
  
  // Dashboard Analytics
  getDashboardStats(config?: CompatibilityConfig): Promise<DashboardStats>;
  getSpecialtyBreakdown(): Promise<SpecialtyData[]>;
  getIncompatibleRecords(limit?: number): Promise<MedicalRecord[]>;
  
  // Data Management
  clearAllMedicalRecords(): Promise<void>;
  updateMedicalRecordSpecialty(id: string, specialty: string): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  constructor() {
    // Initialize static data on first run
    this.initializeStaticData();
  }

  private async initializeStaticData() {
    // Check if data already exists
    const existingMedCount = await db.select({ count: count() }).from(medications);
    
    if (existingMedCount[0].count > 0) {
      return; // Data already initialized
    }

    // Note: ICD-10 codes are now dynamically loaded from NLM API as needed
    // We only initialize a few common ones for bootstrapping
    const bootstrapIcd10Codes = [
      { code: "I21.9", description: "Acute myocardial infarction, unspecified", category: "Diseases of the Circulatory System", specialty: "Cardiology" },
      { code: "E11.9", description: "Type 2 diabetes mellitus without complications", category: "Endocrine, Nutritional and Metabolic Diseases", specialty: "Endocrinology" },
      { code: "J45.9", description: "Asthma, unspecified", category: "Diseases of the Respiratory System", specialty: "Pulmonology" },
      { code: "N18.6", description: "End stage renal disease", category: "Diseases of the Genitourinary System", specialty: "Nephrology" },
      { code: "K25.9", description: "Gastric ulcer, unspecified", category: "Diseases of the Digestive System", specialty: "Gastroenterology" }
    ];

    try {
      await db.insert(icd10Codes).values(bootstrapIcd10Codes);
    } catch (error) {
      console.log("Bootstrap ICD-10 codes already exist, skipping insertion");
    }

    // Note: Medications are now dynamically loaded from FDA API as needed
    // We initialize only a few commonly used medications for bootstrapping
    const bootstrapMedications = [
      {
        name: "Metformin",
        activeIngredient: "Metformin",
        contraindications: ["Renal disease", "Heart failure"],
        compatibleIcd10Codes: [],
        incompatibleIcd10Codes: ["I21.9", "N18.6"]
      },
      {
        name: "Aspirin",
        activeIngredient: "Acetylsalicylic Acid",
        contraindications: ["Asthma", "Peptic ulcer"],
        compatibleIcd10Codes: [],
        incompatibleIcd10Codes: ["J45.9", "K25.9"]
      }
    ];

    try {
      await db.insert(medications).values(bootstrapMedications);
    } catch (error) {
      console.log("Bootstrap medications already exist, skipping insertion");
    }
  }

  async getMedicalRecord(id: string): Promise<MedicalRecord | undefined> {
    const [record] = await db.select().from(medicalRecords).where(eq(medicalRecords.id, id));
    return record || undefined;
  }

  async getAllMedicalRecords(): Promise<MedicalRecord[]> {
    return await db.select().from(medicalRecords);
  }

  async createMedicalRecord(insertRecord: InsertMedicalRecord): Promise<MedicalRecord> {
    const [record] = await db
      .insert(medicalRecords)
      .values(insertRecord)
      .returning();
    return record;
  }

  async createMedicalRecords(insertRecords: InsertMedicalRecord[]): Promise<MedicalRecord[]> {
    const records = await db
      .insert(medicalRecords)
      .values(insertRecords)
      .returning();
    return records;
  }

  async getAnalysisResult(id: string): Promise<AnalysisResult | undefined> {
    const [result] = await db.select().from(analysisResults).where(eq(analysisResults.id, id));
    return result || undefined;
  }

  async getAllAnalysisResults(): Promise<AnalysisResult[]> {
    return await db.select().from(analysisResults);
  }

  async createAnalysisResult(insertResult: InsertAnalysisResult): Promise<AnalysisResult> {
    const [result] = await db
      .insert(analysisResults)
      .values(insertResult)
      .returning();
    return result;
  }

  async getIcd10Code(code: string): Promise<Icd10Code | undefined> {
    // First check local database for cached codes
    const [icd10] = await db.select().from(icd10Codes).where(eq(icd10Codes.code, code));
    if (icd10) {
      return icd10;
    }

    // If not found locally, validate using the NLM API service
    try {
      const validationResult = await icd10Service.validateIcd10Code(code);
      if (validationResult.isValid) {
        // Cache the validated code locally
        const newIcd10Code = await this.createIcd10Code({
          code: code,
          description: validationResult.description || 'Description from NLM API',
          category: validationResult.category || 'Unknown',
          specialty: validationResult.specialty || 'Unknown'
        });
        return newIcd10Code;
      }
    } catch (error) {
      console.warn(`Error validating ICD-10 code ${code}:`, error);
    }

    return undefined;
  }

  async getAllIcd10Codes(): Promise<Icd10Code[]> {
    // Return cached codes from local database
    // For comprehensive searches, use the searchIcd10Codes method instead
    return await db.select().from(icd10Codes);
  }

  async searchIcd10Codes(searchTerm: string, maxResults: number = 20): Promise<Icd10Code[]> {
    try {
      // Use the NLM API service for comprehensive search
      const searchResults = await icd10Service.searchIcd10Code(searchTerm, maxResults);
      
      // Convert search results to our Icd10Code format and cache them
      const icd10Codes: Icd10Code[] = [];
      for (const result of searchResults) {
        // Check if we already have this code cached
        const existing = await this.getIcd10Code(result.code);
        if (existing) {
          icd10Codes.push(existing);
        } else {
          // Cache new codes from search results
          try {
            const newCode = await this.createIcd10Code({
              code: result.code,
              description: result.description,
              category: result.category || 'Unknown',
              specialty: this.determineSpecialtyFromCode(result.code)
            });
            icd10Codes.push(newCode);
          } catch (error) {
            // If creation fails (e.g., duplicate), try to get existing
            const existing = await this.getIcd10Code(result.code);
            if (existing) {
              icd10Codes.push(existing);
            }
          }
        }
      }
      
      return icd10Codes;
    } catch (error) {
      console.warn('Error searching ICD-10 codes via API, falling back to local database:', error);
      // Fallback to local database search
      const localCodes = await db.select().from(icd10Codes);
      return localCodes.filter(code => 
        code.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        code.code.toLowerCase().includes(searchTerm.toLowerCase())
      ).slice(0, maxResults);
    }
  }

  private determineSpecialtyFromCode(code: string): string {
    if (!code) return 'Unknown';

    const firstChar = code.charAt(0).toUpperCase();
    
    // Enhanced specialty mapping based on comprehensive ICD-10 categories
    // This matches the enhanced logic in icd10Service.ts
    const enhancedSpecialtyMap: { [key: string]: string } = {
      'A': 'Infectious Disease',
      'B': 'Infectious Disease',
      'C': 'Oncology',
      'D': 'Hematology', // More specific for blood/lymphatic disorders
      'E': 'Endocrinology',
      'F': 'Psychiatry',
      'G': 'Neurology',
      'H': 'Ophthalmology', // Note: H00-H59 are eye, H60-H95 are ear
      'I': 'Cardiology',
      'J': 'Pulmonology',
      'K': 'Gastroenterology',
      'L': 'Dermatology',
      'M': 'Rheumatology', // More specific for musculoskeletal/connective tissue
      'N': 'Nephrology', // Note: N00-N39 are kidney, N40-N99 are genitourinary
      'O': 'Obstetrics and Gynecology',
      'P': 'Neonatology', // More specific for perinatal conditions
      'Q': 'Medical Genetics', // More appropriate for congenital malformations
      'R': 'Internal Medicine', // Symptoms and signs
      'S': 'Trauma Surgery', // More specific for injury/trauma
      'T': 'Emergency Medicine',
      'V': 'Emergency Medicine',
      'W': 'Emergency Medicine',
      'X': 'Emergency Medicine',
      'Y': 'Emergency Medicine',
      'Z': 'Family Medicine' // More appropriate for health status factors
    };

    return enhancedSpecialtyMap[firstChar] || 'Internal Medicine';
  }

  private extractIcd10CodesFromContraindications(contraindications: MedicationContraindication[]): string[] {
    // Extract potential ICD-10 codes from contraindication descriptions
    const icd10Codes: string[] = [];
    const icd10Pattern = /\b[A-Z]\d{2}(\.\d{1,2})?\b/g;
    
    for (const contraindication of contraindications) {
      const matches = contraindication.description.match(icd10Pattern);
      if (matches) {
        icd10Codes.push(...matches);
      }
      
      // Also map common condition names to known ICD-10 codes
      const conditionMappings: { [key: string]: string[] } = {
        'diabetes': ['E11.9', 'E10.9'],
        'renal disease': ['N18.6', 'N18.5'],
        'kidney disease': ['N18.6', 'N18.5'],
        'heart failure': ['I50.9'],
        'asthma': ['J45.9'],
        'peptic ulcer': ['K25.9', 'K26.9'],
        'pregnancy': ['O99.89'],
        'liver disease': ['K72.90'],
        'hepatic impairment': ['K72.90']
      };
      
      const condition = contraindication.condition.toLowerCase();
      for (const [key, codes] of Object.entries(conditionMappings)) {
        if (condition.includes(key)) {
          icd10Codes.push(...codes);
        }
      }
    }
    
    // Remove duplicates and return
    return Array.from(new Set(icd10Codes));
  }

  async createIcd10Code(insertIcd10: InsertIcd10Code): Promise<Icd10Code> {
    const [icd10] = await db
      .insert(icd10Codes)
      .values(insertIcd10)
      .returning();
    return icd10;
  }

  async getMedication(name: string): Promise<Medication | undefined> {
    // First check local database for cached medications
    const [localMedication] = await db.select().from(medications).where(eq(medications.name, name));
    if (localMedication) {
      return localMedication;
    }

    // Search FDA database for real medication data
    try {
      const fdaResults = await medicationService.searchMedication(name, 1);
      if (fdaResults.length > 0) {
        const fdaMed = fdaResults[0];
        
        // Get contraindications from FDA
        const contraindications = await medicationService.getMedicationContraindications(name);
        
        // Convert FDA data to our medication format and cache it
        const medicationData = {
          name: fdaMed.brandName || fdaMed.genericName,
          activeIngredient: fdaMed.activeIngredients[0] || 'Unknown',
          contraindications: contraindications.map(c => c.condition),
          compatibleIcd10Codes: [],
          incompatibleIcd10Codes: this.extractIcd10CodesFromContraindications(contraindications)
        };
        
        // Cache in local database for future requests
        try {
          const cachedMedication = await this.createMedication(medicationData);
          return cachedMedication;
        } catch (error) {
          console.warn(`Error caching medication ${name}:`, error);
          // Return the medication data even if caching fails
          return {
            id: randomUUID(),
            ...medicationData
          } as Medication;
        }
      }
    } catch (error) {
      console.warn(`Error fetching FDA medication data for ${name}:`, error);
    }

    return undefined;
  }

  async getMedicationByActiveIngredient(ingredient: string): Promise<Medication | undefined> {
    // First check local database for cached medications by active ingredient
    const [localMedication] = await db.select().from(medications).where(sql`lower(${medications.activeIngredient}) = ${ingredient.toLowerCase()}`);
    if (localMedication) {
      return localMedication;
    }

    // Search FDA database by active ingredient
    try {
      const fdaResults = await medicationService.searchMedication(ingredient, 5);
      
      // Find medication with matching active ingredient
      for (const fdaMed of fdaResults) {
        if (fdaMed.activeIngredients.some(ai => 
          ai.toLowerCase().includes(ingredient.toLowerCase()) || 
          ingredient.toLowerCase().includes(ai.toLowerCase())
        )) {
          // Get contraindications from FDA
          const contraindications = await medicationService.getMedicationContraindications(fdaMed.brandName || fdaMed.genericName);
          
          // Convert FDA data to our medication format and cache it
          const medicationData = {
            name: fdaMed.brandName || fdaMed.genericName,
            activeIngredient: fdaMed.activeIngredients[0] || ingredient,
            contraindications: contraindications.map(c => c.condition),
            compatibleIcd10Codes: [],
            incompatibleIcd10Codes: this.extractIcd10CodesFromContraindications(contraindications)
          };
          
          // Cache in local database for future requests
          try {
            const cachedMedication = await this.createMedication(medicationData);
            return cachedMedication;
          } catch (error) {
            console.warn(`Error caching medication by ingredient ${ingredient}:`, error);
            // Return the medication data even if caching fails
            return {
              id: randomUUID(),
              ...medicationData
            } as Medication;
          }
        }
      }
    } catch (error) {
      console.warn(`Error fetching FDA medication data by ingredient ${ingredient}:`, error);
    }

    return undefined;
  }

  async getAllMedications(): Promise<Medication[]> {
    // Return cached medications from local database
    // Note: For comprehensive searches, use the searchMedicationsFDA method instead
    return await db.select().from(medications);
  }

  async searchMedicationsFDA(searchTerm: string, maxResults: number = 10): Promise<MedicationSearchResult[]> {
    try {
      // Use FDA API service for comprehensive medication search
      return await medicationService.searchMedication(searchTerm, maxResults);
    } catch (error) {
      console.warn('Error searching FDA medications:', error);
      return [];
    }
  }

  async getMedicationContraindications(medicationName: string): Promise<MedicationContraindication[]> {
    try {
      // Get real FDA contraindication data
      return await medicationService.getMedicationContraindications(medicationName);
    } catch (error) {
      console.warn(`Error getting contraindications for ${medicationName}:`, error);
      return [];
    }
  }

  async createMedication(insertMedication: InsertMedication): Promise<Medication> {
    const [medication] = await db
      .insert(medications)
      .values(insertMedication)
      .returning();
    return medication;
  }

  async getDashboardStats(config: CompatibilityConfig = defaultCompatibilityConfig): Promise<DashboardStats> {
    const records = await db.select().from(medicalRecords);
    const totalRecords = records.length;
    
    if (totalRecords === 0) {
      return {
        totalRecords: 0,
        compatibilityIssues: 0,
        successRate: "0.0%",
        specialtiesAffected: 0,
        compatibleCount: 0,
        needsReviewCount: 0,
        incompatibleCount: 0
      };
    }
    
    // Categorize records based on configuration
    let compatibleCount = 0;
    let needsReviewCount = 0;
    let incompatibleCount = 0;
    
    for (const record of records) {
      const category = this.categorizeRecord(record, config);
      switch (category) {
        case 'compatible':
          compatibleCount++;
          break;
        case 'needsReview':
          needsReviewCount++;
          break;
        case 'incompatible':
          incompatibleCount++;
          break;
      }
    }
    
    // Ensure math consistency
    const calculatedTotal = compatibleCount + needsReviewCount + incompatibleCount;
    if (calculatedTotal !== totalRecords) {
      console.warn(`Math inconsistency detected: ${calculatedTotal} !== ${totalRecords}`);
    }
    
    const compatibilityIssues = needsReviewCount + incompatibleCount;
    const successRate = totalRecords > 0 ? ((compatibleCount / totalRecords) * 100).toFixed(1) : "0.0";
    const specialties = new Set(records.map(r => r.specialty));
    
    return {
      totalRecords,
      compatibilityIssues,
      successRate: `${successRate}%`,
      specialtiesAffected: specialties.size,
      compatibleCount,
      needsReviewCount,
      incompatibleCount
    };
  }
  
  private categorizeRecord(record: MedicalRecord, config: CompatibilityConfig): 'compatible' | 'needsReview' | 'incompatible' {
    const { riskLevel, isCompatible } = record;
    
    // Priority order: incompatible -> needsReview -> compatible
    
    // 1. Check incompatible conditions (highest priority)
    const isIncompatibleByRisk = config.incompatible.riskLevels.includes(riskLevel as any);
    const isIncompatibleByFlag = config.incompatible.includeIncompatibleFlag && !isCompatible;
    
    if (isIncompatibleByRisk || isIncompatibleByFlag) {
      return 'incompatible';
    }
    
    // 2. Check needs review (medium priority)
    if (config.needsReview.riskLevels.includes(riskLevel as any)) {
      return 'needsReview';
    }
    
    // 3. Check compatible (lowest priority)
    if (config.compatible.riskLevels.includes(riskLevel as any)) {
      // If requiresCompatibleFlag is true, must also have isCompatible = true
      if (config.compatible.requiresCompatibleFlag && !isCompatible) {
        return 'incompatible';
      }
      return 'compatible';
    }
    
    // 4. Default fallback
    return 'incompatible';
  }

  async getSpecialtyBreakdown(): Promise<SpecialtyData[]> {
    const records = await db.select().from(medicalRecords);
    const specialtyMap = new Map<string, { total: number; issues: number }>();
    
    records.forEach(record => {
      const specialty = record.specialty;
      const current = specialtyMap.get(specialty) || { total: 0, issues: 0 };
      current.total += 1;
      if (!record.isCompatible || record.riskLevel !== "low") {
        current.issues += 1;
      }
      specialtyMap.set(specialty, current);
    });

    const specialtyData: SpecialtyData[] = Array.from(specialtyMap.entries()).map(([name, data]) => ({
      name,
      issueCount: data.issues,
      percentage: data.total > 0 ? (data.issues / data.total) * 100 : 0,
      riskLevel: data.issues / data.total > 0.6 ? "high" : data.issues / data.total > 0.3 ? "medium" : "low"
    }));

    return specialtyData.sort((a, b) => b.issueCount - a.issueCount);
  }

  async getIncompatibleRecords(limit: number = 10): Promise<MedicalRecord[]> {
    const records = await db.select().from(medicalRecords);
    return records
      .filter(r => !r.isCompatible || r.riskLevel !== "low")
      .sort((a, b) => {
        const riskOrder = { high: 3, medium: 2, low: 1 };
        return riskOrder[b.riskLevel as keyof typeof riskOrder] - riskOrder[a.riskLevel as keyof typeof riskOrder];
      })
      .slice(0, limit);
  }

  async clearAllMedicalRecords(): Promise<void> {
    try {
      await db.delete(medicalRecords);
      console.log("All medical records cleared successfully");
    } catch (error) {
      console.error("Error clearing medical records:", error);
      throw new Error("Failed to clear medical records");
    }
  }

  async updateMedicalRecordSpecialty(id: string, specialty: string): Promise<number> {
    try {
      const result = await db.update(medicalRecords)
        .set({ specialty })
        .where(eq(medicalRecords.id, id));
      
      // Return affected rows count (Drizzle returns an array of affected objects)
      return Array.isArray(result) ? result.length : 1;
    } catch (error) {
      console.error(`Error updating specialty for record ${id}:`, error);
      throw new Error("Failed to update medical record specialty");
    }
  }
}

export const storage = new DatabaseStorage();
