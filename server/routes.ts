import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import * as XLSX from "xlsx";

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}
import { storage } from "./storage";
import { insertMedicalRecordSchema, insertAnalysisResultSchema, type UploadedFileData, type CompatibilityAnalysis, type CompatibilityConfig, defaultCompatibilityConfig } from "@shared/schema";
import { z } from "zod";
import { icd10Service } from "./services/icd10Service";
import { medicationService, type MedicationContraindication } from "./services/medicationService";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// FDA status caching to avoid burning quota
interface CachedFdaStatus {
  data: any;
  timestamp: number;
  expiresAt: number;
}

let fdaStatusCache: CachedFdaStatus | null = null;
const FDA_STATUS_CACHE_DURATION = 8 * 60 * 1000; // 8 minutes cache

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Upload and analyze Excel file
  app.post("/api/upload", upload.single("file"), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data: UploadedFileData[] = XLSX.utils.sheet_to_json(worksheet);

      if (data.length === 0) {
        return res.status(400).json({ message: "No data found in the uploaded file" });
      }

      // Define column mapping for different Excel formats
      const firstRow = data[0];
      const columnMapping = detectColumnMapping(firstRow);
      
      if (!columnMapping.isValid) {
        return res.status(400).json({ 
          message: `Missing required columns. Expected format should include: Claim Code Ref, Speciality, Active Ingredient, and at least one Diag column. Found columns: ${Object.keys(firstRow).join(", ")}` 
        });
      }

      // Analyze each record
      const analyzedRecords = [];
      let compatibleCount = 0;
      let needsReviewCount = 0;
      let incompatibleCount = 0;

      for (const row of data) {
        // Map Excel columns to our expected format (now async to use FDA API)
        
        // Process each mapped row (one per diagnosis if multiple diagnoses)
        const mappedRows = await mapRowData(row, columnMapping);
        for (const mappedRow of mappedRows) {
          const analysis = await analyzeCompatibility(mappedRow);
          
          const medicalRecord = {
            patientId: mappedRow.patientId,
            medication: mappedRow.medication,
            dosage: mappedRow.dosage || "",
            activeIngredient: analysis.activeIngredient,
            diagnosis: mappedRow.diagnosis,
            icd10Code: mappedRow.icd10Code || await findIcd10Code(mappedRow.diagnosis),
            specialty: analysis.specialty,
            riskLevel: analysis.riskLevel,
            isCompatible: analysis.isCompatible,
            analysisNotes: analysis.notes,
          };

          analyzedRecords.push(medicalRecord);

          if (analysis.isCompatible && analysis.riskLevel === "low") {
            compatibleCount++;
          } else if (analysis.riskLevel === "medium") {
            needsReviewCount++;
          } else {
            incompatibleCount++;
          }
        }
      }

      // Validate that we have records to analyze
      const totalAnalyzedRecords = analyzedRecords.length;
      if (totalAnalyzedRecords === 0) {
        return res.status(400).json({ 
          message: "No valid diagnosis data found in the uploaded file. Please ensure your Excel file contains at least one row with valid diagnosis codes in Diag columns." 
        });
      }
      
      // Save records to storage
      const savedRecords = await storage.createMedicalRecords(analyzedRecords);
      
      // Create analysis result
      const successRate = ((compatibleCount / totalAnalyzedRecords) * 100).toFixed(1);
      const specialties = new Set(analyzedRecords.map(r => r.specialty));
      
      const analysisResult = await storage.createAnalysisResult({
        fileName: req.file.originalname,
        totalRecords: totalAnalyzedRecords,
        compatibleRecords: compatibleCount,
        incompatibleRecords: incompatibleCount,
        needsReviewRecords: needsReviewCount,
        successRate: `${successRate}%`,
        specialtiesAffected: specialties.size,
        processingStatus: "completed"
      });

      res.json({
        success: true,
        analysisId: analysisResult.id,
        summary: {
          totalRecords: totalAnalyzedRecords,
          compatibleRecords: compatibleCount,
          incompatibleRecords: incompatibleCount,
          needsReviewRecords: needsReviewCount,
          successRate: `${successRate}%`,
          specialtiesAffected: specialties.size
        }
      });

    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Failed to process file" });
    }
  });

  // Zod schema for CompatibilityConfig validation
  const compatibilityConfigSchema = z.object({
    compatible: z.object({
      riskLevels: z.array(z.enum(["low", "medium", "high"])),
      requiresCompatibleFlag: z.boolean()
    }),
    needsReview: z.object({
      riskLevels: z.array(z.enum(["low", "medium", "high"]))
    }),
    incompatible: z.object({
      riskLevels: z.array(z.enum(["low", "medium", "high"])),
      includeIncompatibleFlag: z.boolean()
    })
  });

  // Get dashboard statistics (backward compatibility)
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ message: "Failed to fetch dashboard statistics" });
    }
  });

  // Post dashboard statistics with custom config
  app.post("/api/dashboard/stats", async (req, res) => {
    try {
      let config: CompatibilityConfig = defaultCompatibilityConfig;
      
      // If config is provided in request body, validate and use it
      if (req.body && Object.keys(req.body).length > 0) {
        try {
          const validatedConfig = compatibilityConfigSchema.parse(req.body);
          config = validatedConfig;
        } catch (validationError) {
          return res.status(400).json({ 
            message: "Invalid compatibility configuration", 
            errors: validationError instanceof z.ZodError ? validationError.errors : ["Invalid configuration format"]
          });
        }
      }
      
      const stats = await storage.getDashboardStats(config);
      res.json(stats);
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ message: "Failed to fetch dashboard statistics" });
    }
  });

  // Get specialty breakdown
  app.get("/api/dashboard/specialties", async (req, res) => {
    try {
      const specialties = await storage.getSpecialtyBreakdown();
      res.json(specialties);
    } catch (error) {
      console.error("Specialty breakdown error:", error);
      res.status(500).json({ message: "Failed to fetch specialty breakdown" });
    }
  });

  // Get incompatible records
  app.get("/api/mismatches", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const records = await storage.getIncompatibleRecords(limit);
      res.json(records);
    } catch (error) {
      console.error("Mismatches error:", error);
      res.status(500).json({ message: "Failed to fetch mismatch records" });
    }
  });

  // Get all medical records
  app.get("/api/records", async (req, res) => {
    try {
      const records = await storage.getAllMedicalRecords();
      res.json(records);
    } catch (error) {
      console.error("Records error:", error);
      res.status(500).json({ message: "Failed to fetch medical records" });
    }
  });

  // Get a single medical record by ID
  app.get("/api/records/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ message: "Record ID is required" });
      }

      const record = await storage.getMedicalRecord(id);
      if (!record) {
        return res.status(404).json({ message: "Medical record not found" });
      }

      res.json(record);
    } catch (error) {
      console.error("Get record error:", error);
      res.status(500).json({ message: "Failed to fetch medical record" });
    }
  });

  // Get ICD-10 codes (cached local codes)
  app.get("/api/icd10", async (req, res) => {
    try {
      const codes = await storage.getAllIcd10Codes();
      res.json(codes);
    } catch (error) {
      console.error("ICD-10 error:", error);
      res.status(500).json({ message: "Failed to fetch ICD-10 codes" });
    }
  });

  // Search ICD-10 codes using comprehensive NLM API
  app.get("/api/icd10/search", async (req, res) => {
    try {
      const searchTerm = req.query.term as string;
      const maxResults = parseInt(req.query.limit as string) || 20;
      
      if (!searchTerm || searchTerm.trim() === '') {
        return res.status(400).json({ message: "Search term is required" });
      }

      const codes = await storage.searchIcd10Codes(searchTerm, maxResults);
      res.json(codes);
    } catch (error) {
      console.error("ICD-10 search error:", error);
      res.status(500).json({ message: "Failed to search ICD-10 codes" });
    }
  });

  // Get medications (cached local medications)
  app.get("/api/medications", async (req, res) => {
    try {
      const medications = await storage.getAllMedications();
      res.json(medications);
    } catch (error) {
      console.error("Medications error:", error);
      res.status(500).json({ message: "Failed to fetch medications" });
    }
  });

  // Search medications using FDA API
  app.get("/api/medications/search", async (req, res) => {
    try {
      const searchTerm = req.query.term as string;
      const maxResults = parseInt(req.query.limit as string) || 10;
      
      if (!searchTerm || searchTerm.trim() === '') {
        return res.status(400).json({ message: "Search term is required" });
      }

      const medications = await storage.searchMedicationsFDA(searchTerm, maxResults);
      res.json(medications);
    } catch (error) {
      console.error("FDA medication search error:", error);
      res.status(500).json({ message: "Failed to search FDA medications" });
    }
  });

  // Get medication contraindications from FDA
  app.get("/api/medications/:name/contraindications", async (req, res) => {
    try {
      const medicationName = decodeURIComponent(req.params.name);
      
      if (!medicationName || medicationName.trim() === '') {
        return res.status(400).json({ message: "Medication name is required" });
      }

      const contraindications = await storage.getMedicationContraindications(medicationName);
      res.json(contraindications);
    } catch (error) {
      console.error(`Contraindications error for ${req.params.name}:`, error);
      res.status(500).json({ message: "Failed to fetch medication contraindications" });
    }
  });

  // Test FDA API status and availability (with caching to preserve quota)
  app.get("/api/fda-status", async (req, res) => {
    try {
      const forceRefresh = req.query.force === 'true';
      const now = Date.now();
      
      // Check if we have valid cached data and don't need to force refresh
      if (!forceRefresh && fdaStatusCache && now < fdaStatusCache.expiresAt) {
        // Return cached data but update with current server stats
        const currentStats = medicationService.getDetailedStats();
        const cachedResponse = { 
          ...fdaStatusCache.data,
          // Update dynamic server-side information
          rateLimitInfo: {
            ...fdaStatusCache.data.rateLimitInfo,
            remaining: currentStats.quotaInfo.hourlyRemaining,
            dailyRemaining: currentStats.quotaInfo.dailyRemaining,
            minuteRemaining: currentStats.quotaInfo.minuteRemaining
          },
          cacheInfo: {
            entriesCount: currentStats.cacheSize
          },
          lastUpdated: new Date(fdaStatusCache.timestamp).toISOString(),
          fromCache: true,
          cacheExpiresAt: new Date(fdaStatusCache.expiresAt).toISOString(),
          apiConfig: medicationService.getApiConfig(),
          serverUsageStats: {
            dailyUsage: currentStats.dailyUsage,
            hourlyUsage: currentStats.hourlyUsage,
            minuteUsage: currentStats.minuteUsage,
            canMakeCall: currentStats.canMakeCall,
            errorRate: currentStats.errorRate,
            quotaInfo: currentStats.quotaInfo
          }
        };
        
        return res.json(cachedResponse);
      }
      
      // Need to make fresh FDA API call - either cache expired or forced refresh
      const startTime = Date.now();
      
      // Get comprehensive stats from medication service
      const detailedStats = medicationService.getDetailedStats();
      
      // Skip live test if we have very recent successful FDA activity (last 2 minutes)
      // and we're not forcing a refresh
      const recentSuccess = detailedStats.recentActivity
        .filter(call => call.success && (now - call.timestamp) < 2 * 60 * 1000)
        .length > 0;
      
      let liveTestResult = null;
      let liveTestTime = 0;
      
      // Only perform live test if needed
      if (forceRefresh || !recentSuccess || !detailedStats.canMakeCall) {
        try {
          if (detailedStats.canMakeCall) {
            // Use a very common medication to test - should always return results
            liveTestResult = await medicationService.searchMedication("aspirin", 1);
            liveTestTime = Date.now() - startTime;
          }
        } catch (apiError) {
          // Live test failed - will be handled below
          liveTestTime = Date.now() - startTime;
        }
      }
      
      try {
        // Determine overall status based on server stats and live test (if performed)
        let status: 'available' | 'rate_limited' | 'warning' | 'error' = 'available';
        let message = 'FDA API is accessible and responding normally';
        let responseTime = liveTestTime || 0;
        
        // Check rate limits first
        if (!detailedStats.canMakeCall) {
          if (detailedStats.quotaInfo.dailyRemaining === 0) {
            status = 'rate_limited';
            message = 'Daily rate limit reached. Please wait until tomorrow.';
          } else if (detailedStats.quotaInfo.hourlyRemaining === 0) {
            status = 'rate_limited';
            message = 'Hourly rate limit reached. Please wait for the next hour.';
          } else {
            status = 'rate_limited';
            message = 'Rate limit reached. Please wait before making more requests.';
          }
        } else if (detailedStats.quotaInfo.hourlyRemaining < 20 || detailedStats.quotaInfo.dailyRemaining < 50) {
          status = 'warning';
          message = `Approaching rate limits. ${detailedStats.quotaInfo.hourlyRemaining} requests remaining this hour.`;
        } else if (detailedStats.errorRate > 20) {
          status = 'warning';
          message = `High error rate detected (${detailedStats.errorRate}%). FDA API may be experiencing issues.`;
        }
        
        // If live test was performed and failed, update status
        if (liveTestResult === null && detailedStats.canMakeCall && (forceRefresh || !recentSuccess)) {
          status = 'error';
          message = 'FDA API is not responding or unavailable';
        }
        
        const statusResponse = {
          status,
          message,
          lastChecked: new Date().toISOString(),
          responseTimeMs: responseTime,
          rateLimitInfo: {
            remaining: detailedStats.quotaInfo.hourlyRemaining,
            dailyRemaining: detailedStats.quotaInfo.dailyRemaining,
            minuteRemaining: detailedStats.quotaInfo.minuteRemaining,
            total: detailedStats.quotaInfo.hourlyLimit,
            resetTime: new Date(Date.now() + 3600000).toISOString(), // Next hour
            minutesUntilReset: 60 - new Date().getMinutes()
          },
          cacheInfo: {
            entriesCount: detailedStats.cacheSize
          },
          apiEndpoint: 'api.fda.gov/drug/label.json',
          testQuery: liveTestResult !== null ? 'aspirin' : 'skipped_recent_activity',
          testResultsFound: liveTestResult ? liveTestResult.length : undefined,
          fromCache: false,
          apiConfig: medicationService.getApiConfig(),
          serverUsageStats: {
            dailyUsage: detailedStats.dailyUsage,
            hourlyUsage: detailedStats.hourlyUsage,
            minuteUsage: detailedStats.minuteUsage,
            canMakeCall: detailedStats.canMakeCall,
            errorRate: detailedStats.errorRate,
            quotaInfo: detailedStats.quotaInfo,
            recentActivity: detailedStats.recentActivity.slice(-5) // Last 5 calls
          }
        };
        
        // Cache the response
        fdaStatusCache = {
          data: statusResponse,
          timestamp: now,
          expiresAt: now + FDA_STATUS_CACHE_DURATION
        };
        
        res.json(statusResponse);
        
      } catch (error) {
        // Handle any errors that occurred
        const responseTime = Date.now() - startTime;
        
        const errorResponse = {
          status: 'error' as const,
          message: 'Failed to determine FDA API status',
          lastChecked: new Date().toISOString(),
          responseTimeMs: responseTime,
          error: 'server_error',
          details: error instanceof Error ? error.message : 'Unknown error',
          fromCache: false,
          serverUsageStats: {
            dailyUsage: detailedStats.dailyUsage,
            hourlyUsage: detailedStats.hourlyUsage,
            minuteUsage: detailedStats.minuteUsage,
            canMakeCall: detailedStats.canMakeCall,
            errorRate: detailedStats.errorRate,
            quotaInfo: detailedStats.quotaInfo
          }
        };
        
        res.json(errorResponse);
      }
      
    } catch (error) {
      console.error("FDA status check error:", error);
      res.status(500).json({ 
        status: 'error',
        message: "Failed to check FDA API status",
        lastChecked: new Date().toISOString(),
        error: 'server_error'
      });
    }
  });

  // Reset/clear all uploaded medical data
  app.delete("/api/data/reset", async (req, res) => {
    try {
      await storage.clearAllMedicalRecords();
      res.json({ message: "All medical records cleared successfully" });
    } catch (error) {
      console.error("Error clearing medical records:", error);
      res.status(500).json({ message: "Failed to clear medical records" });
    }
  });

  // Fix existing specialty mappings
  app.post("/api/data/fix-specialties", async (req, res) => {
    try {
      const updatedCount = await fixExistingSpecialties();
      res.json({ 
        message: "Specialty mappings updated successfully", 
        updatedRecords: updatedCount 
      });
    } catch (error) {
      console.error("Error fixing specialty mappings:", error);
      res.status(500).json({ message: "Failed to fix specialty mappings" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Helper function to analyze medication-diagnosis compatibility using FDA data
async function analyzeCompatibility(record: UploadedFileData): Promise<CompatibilityAnalysis> {
  // First, determine specialty from ICD-10 code - this should always work regardless of API failures
  const icd10Code = record.icd10Code || await findIcd10Code(record.diagnosis);
  let specialty = "Unknown";
  let icd10Data = null;
  
  // Try to get detailed ICD-10 data from storage/API
  try {
    icd10Data = await storage.getIcd10Code(icd10Code);
    if (icd10Data && icd10Data.specialty) {
      specialty = icd10Data.specialty;
    }
  } catch (error) {
    console.warn(`Error fetching ICD-10 data for ${icd10Code}:`, error);
  }
  
  // If no detailed ICD-10 data, use robust fallback specialty mapping
  if (specialty === "Unknown" && icd10Code) {
    specialty = determineSpecialtyFromIcd10Code(icd10Code);
  }
  
  // Enhanced medication matching using fuzzy search
  let medication = null;
  let activeIngredient = "Unknown";
  let medicationValidated = false;
  
  try {
    medication = await getEnhancedMedicationData(record.medication);
    if (medication) {
      activeIngredient = medication.activeIngredient;
      record.medication = medication.name;
      medicationValidated = true;
    }
  } catch (error) {
    console.warn(`Error fetching medication data for ${record.medication}:`, error);
  }
  
  // If ICD-10 code determination failed completely, return with determined specialty
  if (!icd10Code) {
    return {
      isCompatible: false,
      riskLevel: "medium",
      specialty: specialty,
      notes: `ICD-10 code not found for diagnosis: ${record.diagnosis}${medicationValidated ? '' : `. Medication "${record.medication}" validation also failed due to API limitations.`}`,
      activeIngredient
    };
  }

  // Get real FDA contraindication data and perform sophisticated risk assessment
  try {
    const fdaContraindications = medicationValidated ? 
      await storage.getMedicationContraindications(record.medication) : [];
    
    if (fdaContraindications.length > 0) {
      // Perform sophisticated risk assessment with clinical decision support
      const sophisticatedRiskAnalysis = performSophisticatedRiskAssessment(
        fdaContraindications,
        record.diagnosis,
        icd10Code,
        specialty,
        medication,
        record.medication
      );
      
      return {
        isCompatible: sophisticatedRiskAnalysis.isCompatible,
        riskLevel: sophisticatedRiskAnalysis.riskLevel,
        specialty: specialty,
        notes: sophisticatedRiskAnalysis.clinicalNotes,
        activeIngredient
      };
    }
  } catch (error) {
    console.warn(`Error fetching FDA contraindications for ${record.medication}:`, error);
  }

  // Fallback: Use cached medication data if FDA contraindications are not available
  if (medication) {
    const incompatibleCodes = medication.incompatibleIcd10Codes as string[] || [];
    const compatibleCodes = medication.compatibleIcd10Codes as string[] || [];
    
    if (incompatibleCodes.includes(icd10Code)) {
      return {
        isCompatible: false,
        riskLevel: "high",
        specialty: specialty,
        notes: `Cached data indicates ${record.medication} is contraindicated for ${record.diagnosis} (${icd10Code})`,
        activeIngredient
      };
    }
    
    if (compatibleCodes.includes(icd10Code)) {
      return {
        isCompatible: true,
        riskLevel: "low",
        specialty: specialty,
        notes: `Cached data indicates ${record.medication} is compatible with ${record.diagnosis} (${icd10Code})`,
        activeIngredient
      };
    }
  }

  // Default to needs review if no contraindication data available
  const fallbackNote = medicationValidated ? 
    `No contraindication data available. Manual review recommended for ${record.medication} and ${record.diagnosis}` :
    `Medication "${record.medication}" could not be validated due to API limitations. Manual review recommended for ${record.diagnosis} (${icd10Code})`;
    
  return {
    isCompatible: true,
    riskLevel: "medium",
    specialty: specialty,
    notes: fallbackNote,
    activeIngredient
  };
}

// Robust fallback function to determine specialty from ICD-10 code
function determineSpecialtyFromIcd10Code(code: string): string {
  if (!code) return 'Unknown';

  const firstChar = code.charAt(0).toUpperCase();
  
  // Enhanced specialty mapping based on comprehensive ICD-10 categories
  const enhancedSpecialtyMap: { [key: string]: string } = {
    'A': 'Infectious Disease',
    'B': 'Infectious Disease',
    'C': 'Oncology',
    'D': 'Hematology', // Blood/lymphatic disorders
    'E': 'Endocrinology',
    'F': 'Psychiatry',
    'G': 'Neurology',
    'H': 'Ophthalmology', // Note: H00-H59 are eye, H60-H95 are ear
    'I': 'Cardiology',
    'J': 'Pulmonology',
    'K': 'Gastroenterology',
    'L': 'Dermatology',
    'M': 'Rheumatology', // Musculoskeletal/connective tissue
    'N': 'Nephrology', // Note: N00-N39 are kidney, N40-N99 are genitourinary
    'O': 'Obstetrics and Gynecology',
    'P': 'Neonatology', // Perinatal conditions
    'Q': 'Medical Genetics', // Congenital malformations
    'R': 'Internal Medicine', // Symptoms and signs
    'S': 'Trauma Surgery', // Injury/trauma
    'T': 'Emergency Medicine',
    'V': 'Emergency Medicine',
    'W': 'Emergency Medicine',
    'X': 'Emergency Medicine',
    'Y': 'Emergency Medicine',
    'Z': 'Family Medicine' // Health status factors
  };
  
  // Handle specific subcategories for more precision
  if (code.startsWith('H0') || code.startsWith('H1') || code.startsWith('H2') || 
      code.startsWith('H3') || code.startsWith('H4') || code.startsWith('H5')) {
    return 'Ophthalmology'; // H00-H59: Eye and adnexa
  }
  if (code.startsWith('H6') || code.startsWith('H7') || code.startsWith('H8') || 
      code.startsWith('H9')) {
    return 'Otolaryngology'; // H60-H95: Ear and mastoid process
  }
  if (code.startsWith('N0') || code.startsWith('N1') || code.startsWith('N2') || 
      code.startsWith('N3')) {
    return 'Nephrology'; // N00-N39: Kidney diseases
  }
  if (code.startsWith('N4') || code.startsWith('N5') || code.startsWith('N6') || 
      code.startsWith('N7') || code.startsWith('N8') || code.startsWith('N9')) {
    return 'Urology'; // N40-N99: Genitourinary diseases
  }

  return enhancedSpecialtyMap[firstChar] || 'Internal Medicine';
}

// Function to fix existing specialty mappings in the database
async function fixExistingSpecialties(): Promise<number> {
  try {
    console.log("Starting specialty mapping fix for existing records...");
    const allRecords = await storage.getAllMedicalRecords();
    console.log(`Found ${allRecords.length} total records to examine`);
    
    let candidateCount = 0;
    let updatedCount = 0;
    
    for (const record of allRecords) {
      // Broaden candidate filter - check for null, empty, whitespace, or "unknown" (case insensitive)
      const needsFix = !record.specialty || 
                      record.specialty.trim().length === 0 || 
                      record.specialty.trim().toLowerCase() === 'unknown';
      
      if (needsFix && record.icd10Code) {
        candidateCount++;
        
        // Normalize ICD-10 code before mapping
        const normalizedCode = record.icd10Code.trim().toUpperCase();
        const newSpecialty = determineSpecialtyFromIcd10Code(normalizedCode);
        
        if (newSpecialty !== "Unknown" && newSpecialty !== "Internal Medicine") {
          // Update the record in the database
          try {
            const affectedRows = await storage.updateMedicalRecordSpecialty(record.id, newSpecialty);
            if (affectedRows > 0) {
              updatedCount++;
              console.log(`✓ Updated record ${record.id}: ${normalizedCode} -> ${newSpecialty}`);
            } else {
              console.warn(`⚠ Update returned 0 affected rows for record ${record.id}`);
            }
          } catch (updateError) {
            console.warn(`✗ Failed to update record ${record.id}:`, updateError);
          }
        } else {
          console.log(`◯ Skipped record ${record.id}: ${normalizedCode} -> ${newSpecialty} (not specific enough)`);
        }
      }
    }
    
    console.log(`Specialty mapping fix completed:`);
    console.log(`- Total records examined: ${allRecords.length}`);
    console.log(`- Candidates needing fix: ${candidateCount}`);
    console.log(`- Successfully updated: ${updatedCount}`);
    return updatedCount;
  } catch (error) {
    console.error("Error in fixExistingSpecialties:", error);
    throw error;
  }
}

// Helper function to detect Excel column mapping
function detectColumnMapping(firstRow: any): { isValid: boolean; mapping: any } {
  const columns = Object.keys(firstRow);
  
  // Check for the new format (medical claims data)
  const hasClaimRef = columns.some(col => col.toLowerCase().includes('claim') && col.toLowerCase().includes('ref'));
  const hasSpeciality = columns.some(col => col.toLowerCase().includes('speciality') || col.toLowerCase().includes('specialty'));
  const hasActiveIngredient = columns.some(col => col.toLowerCase().includes('active') && col.toLowerCase().includes('ingredient'));
  const hasDiagCode = columns.some(col => col.toLowerCase().includes('diag'));
  
  if (hasClaimRef && hasSpeciality && hasActiveIngredient && hasDiagCode) {
    return {
      isValid: true,
      mapping: {
        format: 'medical_claims',
        patientId: columns.find(col => col.toLowerCase().includes('claim') && col.toLowerCase().includes('ref')),
        specialty: columns.find(col => col.toLowerCase().includes('speciality') || col.toLowerCase().includes('specialty')),
        activeIngredient: columns.find(col => col.toLowerCase().includes('active') && col.toLowerCase().includes('ingredient')),
        diagnosisColumns: columns.filter(col => col.toLowerCase().includes('diag')),
        activityCode: columns.find(col => col.toLowerCase().includes('activity') && col.toLowerCase().includes('code'))
      }
    };
  }
  
  // Check for the old format (original expected format)
  const hasPatientId = columns.some(col => col.toLowerCase() === 'patientid');
  const hasMedication = columns.some(col => col.toLowerCase() === 'medication');
  const hasDiagnosis = columns.some(col => col.toLowerCase() === 'diagnosis');
  
  if (hasPatientId && hasMedication && hasDiagnosis) {
    return {
      isValid: true,
      mapping: {
        format: 'original',
        patientId: 'patientId',
        medication: 'medication',
        diagnosis: 'diagnosis',
        dosage: 'dosage',
        icd10Code: 'icd10Code'
      }
    };
  }
  
  return { isValid: false, mapping: null };
}

// Helper function to map row data based on detected format
async function mapRowData(row: any, columnMapping: any): Promise<UploadedFileData[]> {
  const mapping = columnMapping.mapping;
  
  if (mapping.format === 'medical_claims') {
    // For medical claims format - create one record per diagnosis
    const records: UploadedFileData[] = [];
    
    for (const diagnosisCol of mapping.diagnosisColumns) {
      const diagnosisCode = String(row[diagnosisCol] || '').trim();
      
      // Only create a record if diagnosis exists
      if (diagnosisCode !== '') {
        const medicationName = await deriveFromActiveIngredient(String(row[mapping.activeIngredient] || '').trim());
        records.push({
          patientId: String(row[mapping.patientId] || '').trim(),
          medication: medicationName,
          dosage: '', // Not available in this format
          diagnosis: diagnosisCode,
          icd10Code: diagnosisCode // Use diagnosis code directly
        });
      }
    }
    
    return records;
  } else {
    // For original format - single record
    return [{
      patientId: row[mapping.patientId] || '',
      medication: row[mapping.medication] || '',
      dosage: row[mapping.dosage] || '',
      diagnosis: row[mapping.diagnosis] || '',
      icd10Code: row[mapping.icd10Code] || ''
    }];
  }
}

// Enhanced helper function to derive medication name from active ingredient using FDA data
async function deriveFromActiveIngredient(activeIngredient: string): Promise<string> {
  if (!activeIngredient) return 'Unknown';
  
  // Normalize the active ingredient for better matching
  const normalizedIngredient = normalizeMedicationName(activeIngredient);
  
  // Try FDA API search first for most accurate results using multiple search strategies
  try {
    // Strategy 1: Direct search with original name
    let fdaResults = await storage.searchMedicationsFDA(activeIngredient, 3);
    
    // Strategy 2: Try normalized name if original didn't work
    if (fdaResults.length === 0 && normalizedIngredient !== activeIngredient) {
      fdaResults = await storage.searchMedicationsFDA(normalizedIngredient, 3);
    }
    
    // Strategy 3: Try first component if compound ingredient
    if (fdaResults.length === 0 && activeIngredient.includes(',')) {
      const firstComponent = activeIngredient.split(',')[0].trim();
      fdaResults = await storage.searchMedicationsFDA(firstComponent, 3);
    }
    
    if (fdaResults.length > 0) {
      // Find best match using fuzzy matching
      const bestMatch = findBestMedicationMatch(activeIngredient, fdaResults);
      return bestMatch.brandName || bestMatch.genericName;
    }
  } catch (error) {
    console.warn(`Error searching FDA for active ingredient ${activeIngredient}:`, error);
  }
  
  // Enhanced mapping for common ingredients with variations
  const enhancedIngredientMappings = getEnhancedIngredientMappings();
  
  // Check for exact matches first
  const exactMatch = enhancedIngredientMappings[normalizedIngredient];
  if (exactMatch) {
    return exactMatch;
  }
  
  // Use fuzzy matching for ingredient mappings
  const fuzzyMatch = findFuzzyIngredientMatch(normalizedIngredient, enhancedIngredientMappings);
  if (fuzzyMatch) {
    return fuzzyMatch;
  }
  
  // Default: clean up the active ingredient name
  const cleanIngredient = activeIngredient.split(',')[0].trim();
  return cleanIngredient;
}

// Helper function to normalize medication names for better matching
function normalizeMedicationName(name: string): string {
  if (!name) return '';
  
  return name
    .trim()
    .toLowerCase()
    // Remove common pharmaceutical suffixes/prefixes
    .replace(/\s+(hcl|hydrochloride|sodium|potassium|mesylate|maleate|succinate|tartrate|citrate|sulfate|phosphate|acetate|chloride)\b/g, '')
    .replace(/\b(extended|immediate|sustained|controlled|delayed)\s+release\b/g, '')
    .replace(/\b(tablet|capsule|injection|syrup|solution|suspension|cream|ointment)\b/g, '')
    // Remove dosage information
    .replace(/\b\d+\s*(mg|mcg|g|ml|units?)\b/g, '')
    // Clean up spacing and punctuation
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Enhanced medication matching using fuzzy logic
function findBestMedicationMatch(searchTerm: string, medications: any[]): any {
  if (!medications || medications.length === 0) return null;
  
  const normalizedSearch = normalizeMedicationName(searchTerm);
  
  let bestMatch = medications[0];
  let highestScore = 0;
  
  for (const medication of medications) {
    const brandScore = calculateSimilarityScore(normalizedSearch, normalizeMedicationName(medication.brandName || ''));
    const genericScore = calculateSimilarityScore(normalizedSearch, normalizeMedicationName(medication.genericName || ''));
    
    // Check active ingredients similarity
    let ingredientScore = 0;
    if (medication.activeIngredients && medication.activeIngredients.length > 0) {
      ingredientScore = Math.max(...medication.activeIngredients.map((ing: string) => 
        calculateSimilarityScore(normalizedSearch, normalizeMedicationName(ing))
      ));
    }
    
    const maxScore = Math.max(brandScore, genericScore, ingredientScore);
    
    if (maxScore > highestScore) {
      highestScore = maxScore;
      bestMatch = medication;
    }
  }
  
  return bestMatch;
}

// Calculate similarity score using Levenshtein distance
function calculateSimilarityScore(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

// Levenshtein distance implementation
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// Enhanced ingredient mappings with variations and synonyms
function getEnhancedIngredientMappings(): { [key: string]: string } {
  return {
    // Pain relief medications
    'paracetamol (acetaminophen)': 'Acetaminophen',
    'paracetamol': 'Acetaminophen',
    'acetaminophen': 'Acetaminophen',
    'tylenol': 'Acetaminophen',
    'aspirin': 'Aspirin',
    'acetylsalicylic acid': 'Aspirin',
    'ibuprofen': 'Ibuprofen',
    'advil': 'Ibuprofen',
    'motrin': 'Ibuprofen',
    'naproxen': 'Naproxen',
    'aleve': 'Naproxen',
    
    // Antihistamines
    'diphenhydramine': 'Diphenhydramine',
    'diphenhydramine hydrochloride': 'Diphenhydramine',
    'benadryl': 'Diphenhydramine',
    'ammonium chloride,diphenhydramine hydrochloride': 'Diphenhydramine',
    'loratadine': 'Loratadine',
    'claritin': 'Loratadine',
    'cetirizine': 'Cetirizine',
    'zyrtec': 'Cetirizine',
    
    // Diabetes medications
    'metformin': 'Metformin',
    'metformin hydrochloride': 'Metformin',
    'glucophage': 'Metformin',
    'insulin': 'Insulin',
    'insulin glargine': 'Insulin Glargine',
    'lantus': 'Insulin Glargine',
    'insulin aspart': 'Insulin Aspart',
    'novolog': 'Insulin Aspart',
    
    // Cardiovascular medications
    'warfarin': 'Warfarin',
    'warfarin sodium': 'Warfarin',
    'coumadin': 'Warfarin',
    'lisinopril': 'Lisinopril',
    'prinivil': 'Lisinopril',
    'zestril': 'Lisinopril',
    'amlodipine': 'Amlodipine',
    'norvasc': 'Amlodipine',
    'atorvastatin': 'Atorvastatin',
    'lipitor': 'Atorvastatin',
    
    // Antibiotics
    'amoxicillin': 'Amoxicillin',
    'amoxil': 'Amoxicillin',
    'azithromycin': 'Azithromycin',
    'zithromax': 'Azithromycin',
    'ciprofloxacin': 'Ciprofloxacin',
    'cipro': 'Ciprofloxacin',
    
    // Neurological medications
    'phenytoin': 'Phenytoin',
    'phenytoin sodium': 'Phenytoin',
    'dilantin': 'Phenytoin',
    'gabapentin': 'Gabapentin',
    'neurontin': 'Gabapentin',
    
    // Corticosteroids
    'prednisone': 'Prednisone',
    'deltasone': 'Prednisone',
    'prednisolone': 'Prednisolone',
    'hydrocortisone': 'Hydrocortisone',
    'cortef': 'Hydrocortisone'
  };
}

// Find fuzzy match in ingredient mappings
function findFuzzyIngredientMatch(searchTerm: string, mappings: { [key: string]: string }): string | null {
  const threshold = 0.8; // 80% similarity threshold
  
  let bestMatch = '';
  let highestScore = 0;
  
  for (const [ingredient, medication] of Object.entries(mappings)) {
    const score = calculateSimilarityScore(searchTerm, ingredient);
    
    if (score > highestScore && score >= threshold) {
      highestScore = score;
      bestMatch = medication;
    }
  }
  
  return bestMatch || null;
}

// Enhanced medication data retrieval using multiple search strategies
async function getEnhancedMedicationData(medicationName: string): Promise<any | null> {
  if (!medicationName) return null;
  
  // Strategy 1: Try local cache first
  let medication = await storage.getMedication(medicationName);
  if (medication) {
    return medication;
  }
  
  // Strategy 2: Try by active ingredient
  medication = await storage.getMedicationByActiveIngredient(medicationName);
  if (medication) {
    return medication;
  }
  
  // Strategy 3: Enhanced FDA search with fuzzy matching
  try {
    const normalizedName = normalizeMedicationName(medicationName);
    
    // Try multiple search variations
    const searchTerms = [
      medicationName,
      normalizedName,
      medicationName.split(' ')[0], // First word only
      medicationName.toLowerCase()
    ].filter((term, index, arr) => arr.indexOf(term) === index); // Remove duplicates
    
    for (const searchTerm of searchTerms) {
      const fdaResults = await storage.searchMedicationsFDA(searchTerm, 5);
      
      if (fdaResults.length > 0) {
        // Find best match using fuzzy matching
        const bestMatch = findBestMedicationMatch(medicationName, fdaResults);
        
        if (bestMatch) {
          // Get contraindications for the matched medication
          const contraindications = await storage.getMedicationContraindications(
            bestMatch.brandName || bestMatch.genericName
          );
          
          // Create medication object from FDA data
          const medicationData = {
            name: bestMatch.brandName || bestMatch.genericName,
            activeIngredient: bestMatch.activeIngredients[0] || 'Unknown',
            contraindications: contraindications.map(c => c.condition),
            compatibleIcd10Codes: [],
            incompatibleIcd10Codes: extractIcd10CodesFromContraindications(contraindications)
          };
          
          // Try to cache in local database for future requests
          try {
            const cachedMedication = await storage.createMedication(medicationData);
            return cachedMedication;
          } catch (error) {
            // Return the medication data even if caching fails
            console.warn(`Error caching medication ${medicationName}:`, error);
            return {
              id: `temp_${Date.now()}`,
              ...medicationData
            };
          }
        }
      }
    }
  } catch (error) {
    console.warn(`Error in enhanced FDA medication search for ${medicationName}:`, error);
  }
  
  return null;
}

// Helper function to extract ICD-10 codes from contraindications
function extractIcd10CodesFromContraindications(contraindications: any[]): string[] {
  const icd10Codes: string[] = [];
  
  // Map common contraindication conditions to ICD-10 codes
  const conditionToIcd10Map: { [key: string]: string[] } = {
    'renal disease': ['N18.6', 'N17.9'],
    'kidney disease': ['N18.6', 'N17.9'],
    'heart failure': ['I50.9', 'I21.9'],
    'cardiac disease': ['I25.9', 'I21.9'],
    'liver disease': ['K72.9', 'K76.9'],
    'hepatic impairment': ['K72.9', 'K76.9'],
    'asthma': ['J45.9'],
    'pregnancy': ['Z34.90'],
    'peptic ulcer': ['K25.9'],
    'diabetes': ['E11.9']
  };
  
  for (const contraindication of contraindications) {
    const condition = contraindication.condition?.toLowerCase() || '';
    
    for (const [conditionKey, codes] of Object.entries(conditionToIcd10Map)) {
      if (condition.includes(conditionKey)) {
        icd10Codes.push(...codes);
      }
    }
  }
  
  return Array.from(new Set(icd10Codes)); // Remove duplicates
}

// Enhanced helper function to analyze contraindications for compatibility
function analyzeContraindicationCompatibility(
  contraindications: MedicationContraindication[],
  diagnosis: string,
  icd10Code: string,
  specialty: string
): { isCompatible: boolean; riskLevel: "low" | "medium" | "high"; notes: string } {
  if (contraindications.length === 0) {
    return {
      isCompatible: true,
      riskLevel: "medium",
      notes: "No contraindication data available from FDA. Manual review recommended."
    };
  }

  let highestRiskLevel: "low" | "medium" | "high" = "low";
  const matchedContraindications: Array<{condition: string, severity: string, confidence: number}> = [];
  const detailedAnalysis = analyzeContraindicationsWithContext(contraindications, diagnosis, icd10Code, specialty);

  // Process analysis results
  for (const match of detailedAnalysis.matches) {
    matchedContraindications.push({
      condition: match.condition,
      severity: match.severity,
      confidence: match.confidence
    });
    
    // Enhanced risk level calculation with confidence weighting
    const effectiveRisk = calculateEffectiveRisk(match.severity, match.confidence);
    
    if (effectiveRisk === 'high' || (effectiveRisk === 'medium' && match.confidence > 0.8)) {
      highestRiskLevel = "high";
    } else if (effectiveRisk === 'medium' && highestRiskLevel !== "high") {
      highestRiskLevel = "medium";
    } else if (effectiveRisk === 'low' && highestRiskLevel === "low") {
      // Keep as low risk but note the match
    }
  }

  // Enhanced compatibility determination
  if (matchedContraindications.length > 0) {
    const isCompatible = determineCompatibilityWithContext(matchedContraindications, detailedAnalysis.contextualFactors);
    const enhancedNotes = generateEnhancedAnalysisNotes(matchedContraindications, detailedAnalysis, highestRiskLevel);
    
    return {
      isCompatible,
      riskLevel: highestRiskLevel,
      notes: enhancedNotes
    };
  }

  // Enhanced assessment even with no direct matches
  const contextualRisk = assessContextualRisk(diagnosis, icd10Code, specialty);
  
  return {
    isCompatible: true,
    riskLevel: contextualRisk.riskLevel,
    notes: contextualRisk.notes
  };
}

// Enhanced medical terminology and contextual analysis
function analyzeContraindicationsWithContext(
  contraindications: MedicationContraindication[],
  diagnosis: string,
  icd10Code: string,
  specialty: string
) {
  const matches: Array<{condition: string, severity: string, confidence: number, reasoning: string}> = [];
  const contextualFactors = {
    specialty,
    diagnosisCategory: getIcd10Category(icd10Code),
    riskFactors: identifyRiskFactors(diagnosis, icd10Code)
  };

  for (const contraindication of contraindications) {
    const matchResult = performAdvancedMedicalMatching(
      diagnosis, 
      icd10Code, 
      contraindication.condition, 
      contraindication.description,
      specialty
    );
    
    if (matchResult.isMatch && matchResult.confidence > 0.5) {
      matches.push({
        condition: contraindication.condition,
        severity: contraindication.severity,
        confidence: matchResult.confidence,
        reasoning: matchResult.reasoning
      });
    }
  }

  return { matches, contextualFactors };
}

// Advanced medical terminology matching with multiple strategies
function performAdvancedMedicalMatching(
  diagnosis: string,
  icd10Code: string,
  contraindicationCondition: string,
  contraindicationDescription: string,
  specialty: string
): { isMatch: boolean; confidence: number; reasoning: string } {
  const diagnosisLower = diagnosis.toLowerCase();
  const icd10Lower = icd10Code.toLowerCase();
  const conditionLower = contraindicationCondition.toLowerCase();
  const descriptionLower = contraindicationDescription.toLowerCase();

  let maxConfidence = 0;
  let matchReasoning = '';

  // Strategy 1: Direct text matching (high confidence if exact)
  if (conditionLower === diagnosisLower || conditionLower.includes(diagnosisLower)) {
    maxConfidence = Math.max(maxConfidence, 0.95);
    matchReasoning = 'Direct condition match';
  }

  // Strategy 2: ICD-10 code matching
  if (descriptionLower.includes(icd10Lower) || conditionLower.includes(icd10Lower)) {
    maxConfidence = Math.max(maxConfidence, 0.9);
    matchReasoning = 'ICD-10 code match';
  }

  // Strategy 3: Enhanced medical terminology matching
  const terminologyMatch = checkEnhancedMedicalTerminology(
    diagnosisLower, 
    icd10Lower, 
    conditionLower, 
    descriptionLower,
    specialty
  );
  if (terminologyMatch.confidence > maxConfidence) {
    maxConfidence = terminologyMatch.confidence;
    matchReasoning = terminologyMatch.reasoning;
  }

  // Strategy 4: Semantic similarity using medical synonyms
  const semanticMatch = checkMedicalSemanticSimilarity(diagnosisLower, conditionLower, icd10Code);
  if (semanticMatch.confidence > maxConfidence) {
    maxConfidence = semanticMatch.confidence;
    matchReasoning = semanticMatch.reasoning;
  }

  // Strategy 5: Drug class and mechanism-based matching
  const mechanismMatch = checkDrugMechanismContraindications(diagnosisLower, conditionLower, specialty);
  if (mechanismMatch.confidence > maxConfidence) {
    maxConfidence = mechanismMatch.confidence;
    matchReasoning = mechanismMatch.reasoning;
  }

  return {
    isMatch: maxConfidence > 0.5,
    confidence: maxConfidence,
    reasoning: matchReasoning
  };
}

// Enhanced medical terminology matching with comprehensive mappings
function checkEnhancedMedicalTerminology(
  diagnosisLower: string,
  icd10Lower: string,
  conditionLower: string,
  descriptionLower: string,
  specialty: string
): { confidence: number; reasoning: string } {
  const enhancedConditionMappings = getComprehensiveMedicalTerminologyMappings();
  
  let maxConfidence = 0;
  let bestReasoning = '';

  for (const category of enhancedConditionMappings) {
    // Check if diagnosis matches any keywords in this category
    const diagnosisMatch = category.keywords.some(keyword => 
      diagnosisLower.includes(keyword) || keyword.includes(diagnosisLower)
    );
    
    if (diagnosisMatch) {
      // Check if contraindication matches any conditions in this category
      const conditionMatches = category.conditions.filter(condition => 
        conditionLower.includes(condition.term) || 
        descriptionLower.includes(condition.term) ||
        condition.synonyms.some(synonym => 
          conditionLower.includes(synonym) || descriptionLower.includes(synonym)
        )
      );
      
      if (conditionMatches.length > 0) {
        // Calculate confidence based on exactness and category severity
        const bestMatch = conditionMatches.reduce((best, current) => 
          current.severity > best.severity ? current : best
        );
        
        const confidence = calculateMatchConfidence(diagnosisLower, bestMatch, category.category);
        
        if (confidence > maxConfidence) {
          maxConfidence = confidence;
          bestReasoning = `${category.category} terminology match: ${bestMatch.term}`;
        }
      }
    }
  }

  return { confidence: maxConfidence, reasoning: bestReasoning };
}

// Medical semantic similarity using comprehensive synonym database
function checkMedicalSemanticSimilarity(
  diagnosisLower: string,
  conditionLower: string,
  icd10Code: string
): { confidence: number; reasoning: string } {
  const medicalSynonyms = getMedicalSynonymDatabase();
  
  let maxConfidence = 0;
  let bestReasoning = '';

  // Extract key medical terms from diagnosis
  const diagnosisTerms = extractMedicalTerms(diagnosisLower);
  const conditionTerms = extractMedicalTerms(conditionLower);

  for (const diagnosisTerm of diagnosisTerms) {
    if (medicalSynonyms[diagnosisTerm as keyof typeof medicalSynonyms]) {
      const synonymGroup = medicalSynonyms[diagnosisTerm as keyof typeof medicalSynonyms];
      
      for (const conditionTerm of conditionTerms) {
        if (synonymGroup.synonyms.includes(conditionTerm)) {
          const confidence = synonymGroup.confidence * 0.85; // Slight reduction for synonym match
          if (confidence > maxConfidence) {
            maxConfidence = confidence;
            bestReasoning = `Medical synonym match: ${diagnosisTerm} ↔ ${conditionTerm}`;
          }
        }
      }
    }
  }

  return { confidence: maxConfidence, reasoning: bestReasoning };
}

// Drug mechanism and class-based contraindication checking
function checkDrugMechanismContraindications(
  diagnosisLower: string,
  conditionLower: string,
  specialty: string
): { confidence: number; reasoning: string } {
  const mechanismMappings = getDrugMechanismContraindications();
  
  let maxConfidence = 0;
  let bestReasoning = '';

  for (const mechanism of mechanismMappings) {
    const diagnosisInCategory = mechanism.diagnoses.some(diag => 
      diagnosisLower.includes(diag) || diag.includes(diagnosisLower)
    );
    
    const contraindicationInCategory = mechanism.contraindications.some(contraind => 
      conditionLower.includes(contraind) || contraind.includes(conditionLower)
    );
    
    if (diagnosisInCategory && contraindicationInCategory) {
      const confidence = mechanism.severity * 0.8; // Mechanism-based matches are slightly less certain
      if (confidence > maxConfidence) {
        maxConfidence = confidence;
        bestReasoning = `Drug mechanism contraindication: ${mechanism.category}`;
      }
    }
  }

  return { confidence: maxConfidence, reasoning: bestReasoning };
}

// Helper functions for enhanced contraindication analysis

function calculateEffectiveRisk(severity: string, confidence: number): 'low' | 'medium' | 'high' {
  const severityMap = {
    'contraindicated': 'high',
    'warning': 'medium',
    'precaution': 'low'
  } as const;
  
  const baseSeverity = severityMap[severity as keyof typeof severityMap] || 'medium';
  
  // Adjust based on confidence level
  if (confidence < 0.6) {
    // Low confidence reduces severity
    return baseSeverity === 'high' ? 'medium' : baseSeverity === 'medium' ? 'low' : 'low';
  }
  
  return baseSeverity;
}

function determineCompatibilityWithContext(
  matchedContraindications: Array<{condition: string, severity: string, confidence: number}>,
  contextualFactors: any
): boolean {
  // High confidence contraindicated conditions are incompatible
  const highRiskMatches = matchedContraindications.filter(match => 
    match.severity === 'contraindicated' && match.confidence > 0.7
  );
  
  if (highRiskMatches.length > 0) {
    return false;
  }
  
  // Consider specialty context
  const criticalSpecialties = ['Cardiology', 'Nephrology', 'Hepatology', 'Critical Care Medicine'];
  const mediumRiskMatches = matchedContraindications.filter(match => 
    match.severity === 'warning' && match.confidence > 0.6
  );
  
  if (mediumRiskMatches.length > 0 && criticalSpecialties.includes(contextualFactors.specialty)) {
    return false; // More strict in critical specialties
  }
  
  return true; // Compatible with monitoring
}

function generateEnhancedAnalysisNotes(
  matchedContraindications: Array<{condition: string, severity: string, confidence: number}>,
  detailedAnalysis: any,
  riskLevel: string
): string {
  if (matchedContraindications.length === 0) {
    return detailedAnalysis.contextualFactors?.riskFactors?.length > 0 
      ? `No direct contraindications found. Monitor for: ${detailedAnalysis.contextualFactors.riskFactors.join(', ')}`
      : "No contraindications identified in FDA database.";
  }
  
  const highConfidenceMatches = matchedContraindications.filter(match => match.confidence > 0.8);
  const mediumConfidenceMatches = matchedContraindications.filter(match => match.confidence > 0.6 && match.confidence <= 0.8);
  
  let notes = `${riskLevel.toUpperCase()} RISK: `;
  
  if (highConfidenceMatches.length > 0) {
    const conditions = highConfidenceMatches.map(match => `${match.condition} (${match.severity})`).join(', ');
    notes += `Strong contraindications: ${conditions}. `;
  }
  
  if (mediumConfidenceMatches.length > 0) {
    const conditions = mediumConfidenceMatches.map(match => match.condition).join(', ');
    notes += `Possible contraindications: ${conditions}. `;
  }
  
  notes += "Clinical review recommended before administration.";
  
  return notes;
}

function assessContextualRisk(diagnosis: string, icd10Code: string, specialty: string) {
  const riskFactors = identifyRiskFactors(diagnosis, icd10Code);
  const category = getIcd10Category(icd10Code);
  
  // Determine baseline risk based on specialty and category
  let baselineRisk: 'low' | 'medium' | 'high' = 'low';
  let notes = "No specific contraindications identified. ";
  
  const highRiskSpecialties = ['Critical Care Medicine', 'Cardiology', 'Nephrology', 'Hepatology'];
  const highRiskCategories = ['Diseases of the Circulatory System', 'Diseases of the Genitourinary System', 'Endocrine, Nutritional and Metabolic Diseases'];
  
  if (highRiskSpecialties.includes(specialty)) {
    baselineRisk = 'medium';
    notes += `${specialty} requires careful medication monitoring. `;
  }
  
  if (highRiskCategories.includes(category)) {
    baselineRisk = baselineRisk === 'low' ? 'medium' : baselineRisk;
    notes += `${category} may affect drug metabolism. `;
  }
  
  if (riskFactors.length > 0) {
    notes += `Consider: ${riskFactors.join(', ')}. `;
  }
  
  notes += "Proceed with standard clinical monitoring.";
  
  return { riskLevel: baselineRisk, notes };
}

function getIcd10Category(icd10Code: string): string {
  if (!icd10Code) return 'Unknown';
  
  const firstChar = icd10Code.charAt(0).toUpperCase();
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

function identifyRiskFactors(diagnosis: string, icd10Code: string): string[] {
  const riskFactors: string[] = [];
  const diagnosisLower = diagnosis.toLowerCase();
  
  // Age-related risk factors
  if (diagnosisLower.includes('elderly') || diagnosisLower.includes('geriatric') || icd10Code.startsWith('Z')) {
    riskFactors.push('Age-related dosing adjustments');
  }
  
  // Organ system risk factors
  if (diagnosisLower.includes('kidney') || diagnosisLower.includes('renal') || icd10Code.startsWith('N')) {
    riskFactors.push('Renal function monitoring');
  }
  
  if (diagnosisLower.includes('liver') || diagnosisLower.includes('hepatic') || icd10Code.startsWith('K7')) {
    riskFactors.push('Hepatic function monitoring');
  }
  
  if (diagnosisLower.includes('heart') || diagnosisLower.includes('cardiac') || icd10Code.startsWith('I')) {
    riskFactors.push('Cardiovascular monitoring');
  }
  
  if (diagnosisLower.includes('diabetes') || icd10Code.startsWith('E1')) {
    riskFactors.push('Blood glucose monitoring');
  }
  
  if (diagnosisLower.includes('pregnancy') || diagnosisLower.includes('pregnant') || icd10Code.startsWith('O')) {
    riskFactors.push('Pregnancy safety category review');
  }
  
  return riskFactors;
}

function getComprehensiveMedicalTerminologyMappings() {
  return [
    {
      category: 'Cardiovascular',
      keywords: ['heart', 'cardiac', 'cardio', 'myocardial', 'coronary', 'arrhythmia', 'hypertension'],
      conditions: [
        { term: 'heart failure', synonyms: ['cardiac failure', 'congestive heart failure', 'chf'], severity: 0.9 },
        { term: 'myocardial infarction', synonyms: ['heart attack', 'mi', 'acute coronary syndrome'], severity: 0.95 },
        { term: 'arrhythmia', synonyms: ['irregular heartbeat', 'dysrhythmia', 'atrial fibrillation'], severity: 0.8 },
        { term: 'hypertension', synonyms: ['high blood pressure', 'elevated blood pressure'], severity: 0.7 }
      ]
    },
    {
      category: 'Renal',
      keywords: ['kidney', 'renal', 'nephro', 'glomerular', 'creatinine'],
      conditions: [
        { term: 'kidney disease', synonyms: ['renal disease', 'nephropathy', 'renal impairment'], severity: 0.9 },
        { term: 'kidney failure', synonyms: ['renal failure', 'acute kidney injury', 'chronic kidney disease'], severity: 0.95 },
        { term: 'dialysis', synonyms: ['hemodialysis', 'peritoneal dialysis'], severity: 0.85 }
      ]
    },
    {
      category: 'Hepatic',
      keywords: ['liver', 'hepatic', 'hepato', 'cirrhosis', 'jaundice'],
      conditions: [
        { term: 'liver disease', synonyms: ['hepatic disease', 'hepatopathy'], severity: 0.9 },
        { term: 'liver failure', synonyms: ['hepatic failure', 'acute liver failure'], severity: 0.95 },
        { term: 'cirrhosis', synonyms: ['hepatic cirrhosis', 'liver cirrhosis'], severity: 0.9 }
      ]
    },
    {
      category: 'Respiratory',
      keywords: ['lung', 'respiratory', 'pulmonary', 'asthma', 'copd', 'broncho'],
      conditions: [
        { term: 'asthma', synonyms: ['bronchial asthma', 'allergic asthma'], severity: 0.8 },
        { term: 'copd', synonyms: ['chronic obstructive pulmonary disease', 'emphysema'], severity: 0.85 },
        { term: 'respiratory failure', synonyms: ['acute respiratory distress'], severity: 0.9 }
      ]
    },
    {
      category: 'Endocrine',
      keywords: ['diabetes', 'diabetic', 'thyroid', 'adrenal', 'insulin'],
      conditions: [
        { term: 'diabetes', synonyms: ['diabetes mellitus', 'diabetic', 'dm'], severity: 0.8 },
        { term: 'hyperthyroidism', synonyms: ['overactive thyroid', 'thyrotoxicosis'], severity: 0.8 },
        { term: 'hypothyroidism', synonyms: ['underactive thyroid', 'myxedema'], severity: 0.7 }
      ]
    },
    {
      category: 'Neurological',
      keywords: ['seizure', 'epilepsy', 'stroke', 'neurological', 'brain'],
      conditions: [
        { term: 'seizure', synonyms: ['epilepsy', 'convulsion', 'epileptic'], severity: 0.85 },
        { term: 'stroke', synonyms: ['cerebrovascular accident', 'cva'], severity: 0.9 },
        { term: 'brain injury', synonyms: ['traumatic brain injury', 'tbi'], severity: 0.85 }
      ]
    }
  ];
}

function calculateMatchConfidence(diagnosisLower: string, bestMatch: any, category: string): number {
  let baseConfidence = bestMatch.severity;
  
  // Boost confidence for exact matches
  if (diagnosisLower.includes(bestMatch.term)) {
    baseConfidence = Math.min(0.95, baseConfidence + 0.1);
  }
  
  // Boost confidence for high-risk categories
  const highRiskCategories = ['Cardiovascular', 'Renal', 'Hepatic'];
  if (highRiskCategories.includes(category)) {
    baseConfidence = Math.min(0.95, baseConfidence + 0.05);
  }
  
  return baseConfidence;
}

function getMedicalSynonymDatabase() {
  return {
    'diabetes': {
      synonyms: ['diabetic', 'dm', 'diabetes mellitus', 'hyperglycemia', 'insulin resistance'],
      confidence: 0.9
    },
    'kidney': {
      synonyms: ['renal', 'nephro', 'kidney disease', 'renal disease', 'nephropathy'],
      confidence: 0.9
    },
    'heart': {
      synonyms: ['cardiac', 'cardio', 'myocardial', 'coronary', 'cardiovascular'],
      confidence: 0.9
    },
    'liver': {
      synonyms: ['hepatic', 'hepato', 'liver disease', 'hepatopathy'],
      confidence: 0.9
    },
    'lung': {
      synonyms: ['pulmonary', 'respiratory', 'bronchial', 'alveolar'],
      confidence: 0.85
    },
    'asthma': {
      synonyms: ['bronchial asthma', 'allergic asthma', 'bronchospasm'],
      confidence: 0.85
    },
    'hypertension': {
      synonyms: ['high blood pressure', 'elevated blood pressure', 'htn'],
      confidence: 0.8
    },
    'seizure': {
      synonyms: ['epilepsy', 'epileptic', 'convulsion', 'fit'],
      confidence: 0.85
    },
    'pregnancy': {
      synonyms: ['pregnant', 'gestation', 'prenatal', 'maternal'],
      confidence: 0.95
    },
    'elderly': {
      synonyms: ['geriatric', 'aged', 'senior', 'older adult'],
      confidence: 0.8
    }
  };
}

function extractMedicalTerms(text: string): string[] {
  // Extract meaningful medical terms from text
  const medicalTerms: string[] = [];
  const words = text.toLowerCase().split(/\s+/);
  
  // Common medical root words and terms
  const medicalRoots = [
    'cardio', 'cardiac', 'heart', 'renal', 'kidney', 'hepatic', 'liver',
    'pulmonary', 'lung', 'diabetes', 'diabetic', 'asthma', 'hypertension',
    'seizure', 'epilepsy', 'stroke', 'pregnancy', 'pregnant', 'elderly',
    'geriatric', 'failure', 'disease', 'syndrome', 'disorder'
  ];
  
  for (const word of words) {
    if (medicalRoots.includes(word) || word.length > 4) {
      medicalTerms.push(word);
    }
  }
  
  // Also look for compound terms
  const text_lower = text.toLowerCase();
  const compoundTerms = [
    'heart failure', 'kidney disease', 'liver disease', 'diabetes mellitus',
    'myocardial infarction', 'renal failure', 'respiratory failure'
  ];
  
  for (const term of compoundTerms) {
    if (text_lower.includes(term)) {
      medicalTerms.push(term.replace(' ', '_'));
    }
  }
  
  return Array.from(new Set(medicalTerms)); // Remove duplicates
}

function getDrugMechanismContraindications() {
  return [
    {
      category: 'ACE Inhibitors',
      diagnoses: ['kidney', 'renal', 'hyperkalemia', 'angioedema'],
      contraindications: ['kidney disease', 'renal impairment', 'hyperkalemia', 'angioedema'],
      severity: 0.9
    },
    {
      category: 'Beta Blockers',
      diagnoses: ['asthma', 'copd', 'heart block', 'bradycardia'],
      contraindications: ['asthma', 'bronchospasm', 'heart block', 'severe bradycardia'],
      severity: 0.85
    },
    {
      category: 'NSAIDs',
      diagnoses: ['kidney', 'heart failure', 'peptic ulcer', 'bleeding'],
      contraindications: ['kidney disease', 'heart failure', 'peptic ulcer', 'bleeding disorder'],
      severity: 0.8
    },
    {
      category: 'Anticoagulants',
      diagnoses: ['bleeding', 'surgery', 'liver disease', 'peptic ulcer'],
      contraindications: ['active bleeding', 'recent surgery', 'liver disease', 'peptic ulcer'],
      severity: 0.9
    },
    {
      category: 'Metformin',
      diagnoses: ['kidney', 'liver', 'heart failure', 'acidosis'],
      contraindications: ['kidney disease', 'liver disease', 'heart failure', 'metabolic acidosis'],
      severity: 0.85
    },
    {
      category: 'Statins',
      diagnoses: ['liver disease', 'myopathy', 'rhabdomyolysis'],
      contraindications: ['active liver disease', 'myopathy', 'rhabdomyolysis'],
      severity: 0.8
    }
  ];
}

// Sophisticated Risk Assessment with Clinical Decision Support
function performSophisticatedRiskAssessment(
  contraindications: MedicationContraindication[],
  diagnosis: string,
  icd10Code: string,
  specialty: string,
  medication: any,
  medicationName: string
): { isCompatible: boolean; riskLevel: "low" | "medium" | "high"; clinicalNotes: string } {
  
  // Initialize sophisticated risk scoring components
  const riskComponents = {
    contraindicationSeverity: 0,
    clinicalContext: 0,
    patientSafety: 0,
    drugClass: 0,
    interactionPotential: 0
  };
  
  let criticalFindings: string[] = [];
  let clinicalConsiderations: string[] = [];
  let monitoringRequirements: string[] = [];
  
  // Component 1: Advanced contraindication severity analysis
  const contraindicationAnalysis = analyzeContraindicationSeverityWithContext(
    contraindications, diagnosis, icd10Code, specialty
  );
  riskComponents.contraindicationSeverity = contraindicationAnalysis.severityScore;
  criticalFindings.push(...contraindicationAnalysis.criticalFindings);
  
  // Component 2: Clinical context assessment
  const clinicalContextAnalysis = assessClinicalContext(diagnosis, icd10Code, specialty, medication);
  riskComponents.clinicalContext = clinicalContextAnalysis.contextScore;
  clinicalConsiderations.push(...clinicalContextAnalysis.considerations);
  
  // Component 3: Patient safety prioritization
  const patientSafetyAnalysis = evaluatePatientSafetyFactors(diagnosis, icd10Code, medication);
  riskComponents.patientSafety = patientSafetyAnalysis.safetyScore;
  monitoringRequirements.push(...patientSafetyAnalysis.monitoringNeeded);
  
  // Component 4: Drug class specific risk assessment
  const drugClassAnalysis = assessDrugClassSpecificRisks(medication, diagnosis, specialty);
  riskComponents.drugClass = drugClassAnalysis.drugClassRisk;
  clinicalConsiderations.push(...drugClassAnalysis.classConsiderations);
  
  // Component 5: Interaction potential scoring
  const interactionAnalysis = calculateInteractionPotential(medication, diagnosis, icd10Code);
  riskComponents.interactionPotential = interactionAnalysis.interactionScore;
  
  // Calculate comprehensive risk score using weighted algorithm
  const comprehensiveRiskScore = calculateComprehensiveRiskScore(riskComponents, specialty);
  
  // Determine final risk level using sophisticated algorithm
  const finalRiskLevel = determineFinalRiskLevel(comprehensiveRiskScore, criticalFindings);
  
  // Generate clinical decision support notes
  const clinicalNotes = generateClinicalDecisionSupportNotes(
    finalRiskLevel,
    criticalFindings,
    clinicalConsiderations,
    monitoringRequirements,
    comprehensiveRiskScore,
    medicationName,
    diagnosis
  );
  
  // Determine compatibility with enhanced decision logic
  const isCompatible = determineCompatibilityWithSophisticatedLogic(
    finalRiskLevel, 
    criticalFindings, 
    specialty, 
    comprehensiveRiskScore
  );
  
  return {
    isCompatible,
    riskLevel: finalRiskLevel,
    clinicalNotes
  };
}

// Advanced contraindication severity analysis with clinical context
function analyzeContraindicationSeverityWithContext(
  contraindications: MedicationContraindication[],
  diagnosis: string,
  icd10Code: string,
  specialty: string
): { severityScore: number; criticalFindings: string[] } {
  
  let severityScore = 0;
  const criticalFindings: string[] = [];
  
  // Enhanced matching with confidence weighting
  const detailedAnalysis = analyzeContraindicationsWithContext(contraindications, diagnosis, icd10Code, specialty);
  
  for (const match of detailedAnalysis.matches) {
    // Calculate weighted severity based on confidence and FDA classification
    let matchSeverity = 0;
    
    switch (match.severity) {
      case 'contraindicated':
        matchSeverity = 10 * match.confidence;
        if (match.confidence > 0.8) {
          criticalFindings.push(`CRITICAL: ${match.condition} - Contraindicated (Confidence: ${(match.confidence * 100).toFixed(1)}%)`);
        }
        break;
      case 'warning':
        matchSeverity = 6 * match.confidence;
        if (match.confidence > 0.7) {
          criticalFindings.push(`WARNING: ${match.condition} - Major precaution required (Confidence: ${(match.confidence * 100).toFixed(1)}%)`);
        }
        break;
      case 'precaution':
        matchSeverity = 3 * match.confidence;
        if (match.confidence > 0.6) {
          criticalFindings.push(`CAUTION: ${match.condition} - Monitor closely (Confidence: ${(match.confidence * 100).toFixed(1)}%)`);
        }
        break;
      default:
        matchSeverity = 2 * match.confidence;
    }
    
    severityScore = Math.max(severityScore, matchSeverity);
  }
  
  return { severityScore, criticalFindings };
}

// Clinical context assessment
function assessClinicalContext(
  diagnosis: string, 
  icd10Code: string, 
  specialty: string, 
  medication: any
): { contextScore: number; considerations: string[] } {
  
  let contextScore = 0;
  const considerations: string[] = [];
  
  // High-risk specialties and conditions
  const criticalSpecialties = {
    'Critical Care Medicine': 8,
    'Cardiology': 7,
    'Nephrology': 7,
    'Hepatology': 6,
    'Oncology': 6,
    'Emergency Medicine': 5
  };
  
  const specialtyRisk = criticalSpecialties[specialty as keyof typeof criticalSpecialties] || 2;
  contextScore += specialtyRisk;
  
  if (specialtyRisk >= 6) {
    considerations.push(`High-risk specialty (${specialty}) - Enhanced monitoring required`);
  }
  
  // ICD-10 category risk assessment
  const categoryRisk = assessIcd10CategoryRisk(icd10Code);
  contextScore += categoryRisk.score;
  considerations.push(...categoryRisk.considerations);
  
  // Comorbidity risk factors
  const comorbidityRisk = identifyComorbidityRiskFactors(diagnosis, icd10Code);
  contextScore += comorbidityRisk.score;
  considerations.push(...comorbidityRisk.considerations);
  
  return { contextScore, considerations };
}

// Patient safety factor evaluation
function evaluatePatientSafetyFactors(
  diagnosis: string, 
  icd10Code: string, 
  medication: any
): { safetyScore: number; monitoringNeeded: string[] } {
  
  let safetyScore = 0;
  const monitoringNeeded: string[] = [];
  
  const diagnosisLower = diagnosis.toLowerCase();
  
  // Age-related safety factors
  if (diagnosisLower.includes('elderly') || diagnosisLower.includes('geriatric') || icd10Code.startsWith('Z')) {
    safetyScore += 3;
    monitoringNeeded.push('Geriatric dosing protocols and enhanced monitoring');
  }
  
  // Organ system specific safety
  const organSystemSafety = {
    renal: { keywords: ['kidney', 'renal'], score: 5, monitoring: 'Creatinine clearance and renal function monitoring' },
    hepatic: { keywords: ['liver', 'hepatic'], score: 5, monitoring: 'Liver function tests and hepatic monitoring' },
    cardiac: { keywords: ['heart', 'cardiac'], score: 4, monitoring: 'Cardiac function and rhythm monitoring' },
    respiratory: { keywords: ['lung', 'respiratory', 'asthma'], score: 3, monitoring: 'Respiratory function assessment' },
    neurological: { keywords: ['seizure', 'stroke', 'brain'], score: 4, monitoring: 'Neurological status monitoring' }
  };
  
  for (const [system, config] of Object.entries(organSystemSafety)) {
    if (config.keywords.some(keyword => diagnosisLower.includes(keyword)) || 
        isRelevantIcd10Category(icd10Code, system)) {
      safetyScore += config.score;
      monitoringNeeded.push(config.monitoring);
    }
  }
  
  // Pregnancy and reproductive safety
  if (diagnosisLower.includes('pregnancy') || diagnosisLower.includes('pregnant') || icd10Code.startsWith('O')) {
    safetyScore += 6;
    monitoringNeeded.push('Pregnancy safety category review and fetal monitoring');
  }
  
  return { safetyScore, monitoringNeeded };
}

// Drug class specific risk assessment
function assessDrugClassSpecificRisks(
  medication: any, 
  diagnosis: string, 
  specialty: string
): { drugClassRisk: number; classConsiderations: string[] } {
  
  let drugClassRisk = 0;
  const classConsiderations: string[] = [];
  
  if (!medication || !medication.activeIngredient) {
    return { drugClassRisk: 1, classConsiderations: ['Unknown drug class - exercise caution'] };
  }
  
  const activeIngredient = medication.activeIngredient.toLowerCase();
  const diagnosisLower = diagnosis.toLowerCase();
  
  // High-risk drug classes with specific considerations
  const riskProfileMap = [
    {
      drugs: ['warfarin', 'heparin', 'rivaroxaban', 'dabigatran'],
      class: 'Anticoagulants',
      baseRisk: 7,
      conditions: [
        { condition: ['bleeding', 'surgery', 'trauma'], additionalRisk: 3, note: 'High bleeding risk - consider alternatives' },
        { condition: ['liver'], additionalRisk: 2, note: 'Hepatic metabolism affects anticoagulation' }
      ]
    },
    {
      drugs: ['insulin', 'metformin', 'glimepiride', 'glyburide'],
      class: 'Antidiabetic Agents',
      baseRisk: 5,
      conditions: [
        { condition: ['kidney', 'renal'], additionalRisk: 3, note: 'Renal impairment affects drug clearance' },
        { condition: ['liver', 'hepatic'], additionalRisk: 2, note: 'Hepatic dysfunction affects metabolism' }
      ]
    },
    {
      drugs: ['lisinopril', 'losartan', 'amlodipine', 'metoprolol'],
      class: 'Cardiovascular Agents',
      baseRisk: 4,
      conditions: [
        { condition: ['heart failure', 'cardiac'], additionalRisk: 2, note: 'Careful titration required in heart failure' },
        { condition: ['kidney'], additionalRisk: 3, note: 'Monitor renal function closely' }
      ]
    },
    {
      drugs: ['phenytoin', 'carbamazepine', 'valproic acid', 'lamotrigine'],
      class: 'Antiepileptic Drugs',
      baseRisk: 6,
      conditions: [
        { condition: ['liver'], additionalRisk: 3, note: 'Hepatic enzyme induction/inhibition concerns' },
        { condition: ['pregnancy'], additionalRisk: 4, note: 'Teratogenic risk - specialized management required' }
      ]
    }
  ];
  
  for (const profile of riskProfileMap) {
    if (profile.drugs.some(drug => activeIngredient.includes(drug))) {
      drugClassRisk = profile.baseRisk;
      classConsiderations.push(`${profile.class} therapy identified`);
      
      for (const condition of profile.conditions) {
        if (condition.condition.some(cond => diagnosisLower.includes(cond))) {
          drugClassRisk += condition.additionalRisk;
          classConsiderations.push(condition.note);
        }
      }
      break;
    }
  }
  
  return { drugClassRisk, classConsiderations };
}

// Calculate interaction potential
function calculateInteractionPotential(
  medication: any, 
  diagnosis: string, 
  icd10Code: string
): { interactionScore: number } {
  
  let interactionScore = 0;
  
  if (!medication) return { interactionScore: 1 };
  
  const activeIngredient = medication.activeIngredient?.toLowerCase() || '';
  const diagnosisLower = diagnosis.toLowerCase();
  
  // High interaction potential drugs
  const highInteractionDrugs = [
    'warfarin', 'phenytoin', 'carbamazepine', 'rifampin', 'ketoconazole',
    'erythromycin', 'cimetidine', 'omeprazole'
  ];
  
  if (highInteractionDrugs.some(drug => activeIngredient.includes(drug))) {
    interactionScore += 4;
  }
  
  // Disease states that increase interaction risk
  const interactionRiskConditions = [
    { conditions: ['liver', 'hepatic'], risk: 3 },
    { conditions: ['kidney', 'renal'], risk: 2 },
    { conditions: ['elderly', 'geriatric'], risk: 2 }
  ];
  
  for (const riskCondition of interactionRiskConditions) {
    if (riskCondition.conditions.some(condition => diagnosisLower.includes(condition))) {
      interactionScore += riskCondition.risk;
    }
  }
  
  return { interactionScore };
}

// Calculate comprehensive risk score using sophisticated weighting
function calculateComprehensiveRiskScore(
  riskComponents: any, 
  specialty: string
): number {
  
  // Specialty-specific weighting factors
  const specialtyWeights = {
    'Critical Care Medicine': { contraindication: 1.2, clinical: 1.1, safety: 1.3, drugClass: 1.1, interaction: 1.2 },
    'Cardiology': { contraindication: 1.1, clinical: 1.2, safety: 1.1, drugClass: 1.3, interaction: 1.1 },
    'Nephrology': { contraindication: 1.0, clinical: 1.1, safety: 1.3, drugClass: 1.2, interaction: 1.2 },
    'Hepatology': { contraindication: 1.0, clinical: 1.1, safety: 1.2, drugClass: 1.3, interaction: 1.3 },
    'default': { contraindication: 1.0, clinical: 1.0, safety: 1.0, drugClass: 1.0, interaction: 1.0 }
  };
  
  const weights = specialtyWeights[specialty as keyof typeof specialtyWeights] || specialtyWeights['default'];
  
  const weightedScore = (
    riskComponents.contraindicationSeverity * weights.contraindication * 0.35 +
    riskComponents.clinicalContext * weights.clinical * 0.20 +
    riskComponents.patientSafety * weights.safety * 0.25 +
    riskComponents.drugClass * weights.drugClass * 0.15 +
    riskComponents.interactionPotential * weights.interaction * 0.05
  );
  
  return Math.min(10, weightedScore); // Cap at 10
}

// Determine final risk level with sophisticated logic
function determineFinalRiskLevel(
  comprehensiveRiskScore: number, 
  criticalFindings: string[]
): "low" | "medium" | "high" {
  
  // Critical findings override score-based assessment
  if (criticalFindings.some(finding => finding.includes('CRITICAL'))) {
    return 'high';
  }
  
  // Score-based risk level determination with nuanced thresholds
  if (comprehensiveRiskScore >= 7.5) {
    return 'high';
  } else if (comprehensiveRiskScore >= 4.5) {
    return 'medium';
  } else if (comprehensiveRiskScore >= 2.5) {
    return criticalFindings.length > 0 ? 'medium' : 'low';
  } else {
    return 'low';
  }
}

// Generate comprehensive clinical decision support notes
function generateClinicalDecisionSupportNotes(
  riskLevel: "low" | "medium" | "high",
  criticalFindings: string[],
  clinicalConsiderations: string[],
  monitoringRequirements: string[],
  riskScore: number,
  medicationName: string,
  diagnosis: string
): string {
  
  let notes = `CLINICAL DECISION SUPPORT - ${riskLevel.toUpperCase()} RISK (Score: ${riskScore.toFixed(1)}/10)\n\n`;
  
  // Risk level specific guidance
  switch (riskLevel) {
    case 'high':
      notes += "⚠️  HIGH RISK: Consider alternative therapy or specialist consultation.\n";
      break;
    case 'medium':
      notes += "⚡ MEDIUM RISK: Proceed with enhanced monitoring and dose adjustments as needed.\n";
      break;
    case 'low':
      notes += "✓ LOW RISK: Standard monitoring protocols apply.\n";
      break;
  }
  
  // Critical findings
  if (criticalFindings.length > 0) {
    notes += "\n🔴 CRITICAL FINDINGS:\n";
    criticalFindings.forEach(finding => notes += `• ${finding}\n`);
  }
  
  // Clinical considerations
  if (clinicalConsiderations.length > 0) {
    notes += "\n📋 CLINICAL CONSIDERATIONS:\n";
    clinicalConsiderations.slice(0, 5).forEach(consideration => notes += `• ${consideration}\n`); // Limit to top 5
  }
  
  // Monitoring requirements
  if (monitoringRequirements.length > 0) {
    notes += "\n🔬 MONITORING REQUIREMENTS:\n";
    monitoringRequirements.slice(0, 4).forEach(requirement => notes += `• ${requirement}\n`); // Limit to top 4
  }
  
  // Final recommendation
  notes += `\n💊 RECOMMENDATION: `;
  if (riskLevel === 'high') {
    notes += `Consider alternative to ${medicationName} for ${diagnosis}. If no alternatives available, requires specialist oversight.`;
  } else if (riskLevel === 'medium') {
    notes += `${medicationName} may be used for ${diagnosis} with appropriate monitoring and dose adjustments.`;
  } else {
    notes += `${medicationName} appears suitable for ${diagnosis} with standard clinical monitoring.`;
  }
  
  return notes;
}

// Determine compatibility with sophisticated decision logic
function determineCompatibilityWithSophisticatedLogic(
  riskLevel: "low" | "medium" | "high",
  criticalFindings: string[],
  specialty: string,
  riskScore: number
): boolean {
  
  // Absolute contraindications
  if (criticalFindings.some(finding => 
    finding.includes('CRITICAL') && finding.includes('Contraindicated')
  )) {
    return false;
  }
  
  // High risk scenarios in critical specialties
  const criticalSpecialties = ['Critical Care Medicine', 'Emergency Medicine'];
  if (riskLevel === 'high' && criticalSpecialties.includes(specialty) && riskScore > 8) {
    return false;
  }
  
  // Medium and low risk generally compatible with monitoring
  return riskLevel !== 'high' || riskScore < 8;
}

// Helper functions for sophisticated risk assessment

function assessIcd10CategoryRisk(icd10Code: string): { score: number; considerations: string[] } {
  const firstChar = icd10Code.charAt(0).toUpperCase();
  const considerations: string[] = [];
  
  const categoryRisks: { [key: string]: { score: number; note: string } } = {
    'E': { score: 4, note: 'Endocrine disorders require careful medication management' },
    'I': { score: 5, note: 'Cardiovascular conditions increase medication risks' },
    'N': { score: 4, note: 'Kidney/urogenital conditions affect drug clearance' },
    'K': { score: 3, note: 'Gastrointestinal conditions may affect absorption' },
    'F': { score: 3, note: 'Mental health conditions require consideration of drug interactions' },
    'O': { score: 6, note: 'Pregnancy requires specialized medication safety protocols' }
  };
  
  const risk = categoryRisks[firstChar];
  if (risk) {
    considerations.push(risk.note);
    return { score: risk.score, considerations };
  }
  
  return { score: 1, considerations };
}

function identifyComorbidityRiskFactors(diagnosis: string, icd10Code: string): { score: number; considerations: string[] } {
  const diagnosisLower = diagnosis.toLowerCase();
  let score = 0;
  const considerations: string[] = [];
  
  const comorbidityFactors = [
    { keywords: ['diabetes', 'diabetic'], score: 2, note: 'Diabetes increases medication monitoring requirements' },
    { keywords: ['hypertension', 'high blood pressure'], score: 1, note: 'Hypertension may be affected by medication choice' },
    { keywords: ['heart failure'], score: 3, note: 'Heart failure significantly impacts medication selection' },
    { keywords: ['chronic kidney disease', 'renal failure'], score: 4, note: 'Kidney disease requires dose adjustments' },
    { keywords: ['liver disease', 'cirrhosis'], score: 3, note: 'Liver disease affects medication metabolism' }
  ];
  
  for (const factor of comorbidityFactors) {
    if (factor.keywords.some(keyword => diagnosisLower.includes(keyword))) {
      score += factor.score;
      considerations.push(factor.note);
    }
  }
  
  return { score, considerations };
}

function isRelevantIcd10Category(icd10Code: string, organSystem: string): boolean {
  const firstChar = icd10Code.charAt(0).toUpperCase();
  
  const systemMappings: { [key: string]: string[] } = {
    'renal': ['N'],
    'hepatic': ['K'],
    'cardiac': ['I'],
    'respiratory': ['J'],
    'neurological': ['G', 'F']
  };
  
  return systemMappings[organSystem]?.includes(firstChar) || false;
}

// Helper function to find ICD-10 code for diagnosis
async function findIcd10Code(diagnosis: string): Promise<string> {
  // Guard against empty/whitespace diagnoses
  if (!diagnosis || diagnosis.trim() === '') {
    return '';
  }
  
  const trimmedDiagnosis = diagnosis.trim();
  
  // If diagnosis is already an ICD-10 code (format: Letter + digits + optional dot + digits)
  if (/^[A-Z]\d{2}(\.\d+)?$/.test(trimmedDiagnosis)) {
    // Validate the ICD-10 code using NLM API service
    try {
      const validationResult = await icd10Service.validateIcd10Code(trimmedDiagnosis);
      if (validationResult.isValid) {
        return trimmedDiagnosis;
      }
    } catch (error) {
      console.warn(`Error validating ICD-10 code ${trimmedDiagnosis}:`, error);
    }
    return trimmedDiagnosis; // Return as-is if validation fails but format is correct
  }
  
  // Try comprehensive search using NLM API service first
  try {
    const searchResults = await storage.searchIcd10Codes(trimmedDiagnosis, 5);
    if (searchResults && searchResults.length > 0) {
      // Return the most relevant match (first result)
      const bestMatch = searchResults[0];
      return bestMatch.code;
    }
  } catch (error) {
    console.warn(`Error searching ICD-10 codes for ${trimmedDiagnosis}:`, error);
  }
  
  // Fallback to local database search
  const allCodes = await storage.getAllIcd10Codes();
  const foundCode = allCodes.find(code => 
    code.description.toLowerCase().includes(trimmedDiagnosis.toLowerCase()) ||
    trimmedDiagnosis.toLowerCase().includes(code.description.toLowerCase().split(',')[0])
  );
  
  return foundCode?.code || trimmedDiagnosis; // Return original if not found, might already be ICD-10 code
}
