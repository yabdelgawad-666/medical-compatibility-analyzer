import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const medicalRecords = pgTable("medical_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: text("patient_id").notNull(),
  medication: text("medication").notNull(),
  dosage: text("dosage"),
  activeIngredient: text("active_ingredient").notNull(),
  diagnosis: text("diagnosis").notNull(),
  icd10Code: text("icd10_code").notNull(),
  specialty: text("specialty").notNull(),
  riskLevel: text("risk_level").notNull(), // "low", "medium", "high"
  isCompatible: boolean("is_compatible").notNull(),
  analysisNotes: text("analysis_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const analysisResults = pgTable("analysis_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  totalRecords: integer("total_records").notNull(),
  compatibleRecords: integer("compatible_records").notNull(),
  incompatibleRecords: integer("incompatible_records").notNull(),
  needsReviewRecords: integer("needs_review_records").notNull(),
  successRate: text("success_rate").notNull(),
  specialtiesAffected: integer("specialties_affected").notNull(),
  processingStatus: text("processing_status").notNull(), // "processing", "completed", "failed"
  createdAt: timestamp("created_at").defaultNow(),
});

export const icd10Codes = pgTable("icd10_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  specialty: text("specialty").notNull(),
});

export const medications = pgTable("medications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  activeIngredient: text("active_ingredient").notNull(),
  contraindications: jsonb("contraindications"),
  compatibleIcd10Codes: jsonb("compatible_icd10_codes"),
  incompatibleIcd10Codes: jsonb("incompatible_icd10_codes"),
});

export const insertMedicalRecordSchema = createInsertSchema(medicalRecords).omit({
  id: true,
  createdAt: true,
});

export const insertAnalysisResultSchema = createInsertSchema(analysisResults).omit({
  id: true,
  createdAt: true,
});

export const insertIcd10CodeSchema = createInsertSchema(icd10Codes).omit({
  id: true,
});

export const insertMedicationSchema = createInsertSchema(medications).omit({
  id: true,
});

export type InsertMedicalRecord = z.infer<typeof insertMedicalRecordSchema>;
export type MedicalRecord = typeof medicalRecords.$inferSelect;

export type InsertAnalysisResult = z.infer<typeof insertAnalysisResultSchema>;
export type AnalysisResult = typeof analysisResults.$inferSelect;

export type InsertIcd10Code = z.infer<typeof insertIcd10CodeSchema>;
export type Icd10Code = typeof icd10Codes.$inferSelect;

export type InsertMedication = z.infer<typeof insertMedicationSchema>;
export type Medication = typeof medications.$inferSelect;

export interface UploadedFileData {
  patientId: string;
  medication: string;
  dosage?: string;
  diagnosis: string;
  icd10Code?: string;
}

export interface CompatibilityAnalysis {
  isCompatible: boolean;
  riskLevel: "low" | "medium" | "high";
  specialty: string;
  notes: string;
  activeIngredient: string;
}

export interface DashboardStats {
  totalRecords: number;
  compatibilityIssues: number;
  successRate: string;
  specialtiesAffected: number;
  compatibleCount: number;
  needsReviewCount: number;
  incompatibleCount: number;
}

export interface SpecialtyData {
  name: string;
  issueCount: number;
  percentage: number;
  riskLevel: "low" | "medium" | "high";
}

// Configuration types for user-customizable compatibility categorization
export type RiskLevel = "low" | "medium" | "high";

export type CompatibilityConfig = {
  compatible: {
    riskLevels: RiskLevel[];
    requiresCompatibleFlag: boolean;
  };
  needsReview: {
    riskLevels: RiskLevel[];
  };
  incompatible: {
    riskLevels: RiskLevel[];
    includeIncompatibleFlag: boolean;
  };
};

export const defaultCompatibilityConfig: CompatibilityConfig = {
  compatible: {
    riskLevels: ["low"],
    requiresCompatibleFlag: true
  },
  needsReview: {
    riskLevels: ["medium"]
  },
  incompatible: {
    riskLevels: ["high"],
    includeIncompatibleFlag: true
  }
};

export const compatibilityPresets = {
  conservative: {
    name: "Conservative",
    description: "Only low-risk records as compatible",
    config: {
      compatible: { riskLevels: ["low" as RiskLevel], requiresCompatibleFlag: true },
      needsReview: { riskLevels: ["medium" as RiskLevel] },
      incompatible: { riskLevels: ["high" as RiskLevel], includeIncompatibleFlag: true }
    }
  },
  standard: {
    name: "Standard", 
    description: "Low and medium-risk as compatible",
    config: {
      compatible: { riskLevels: ["low" as RiskLevel, "medium" as RiskLevel], requiresCompatibleFlag: true },
      needsReview: { riskLevels: [] as RiskLevel[] },
      incompatible: { riskLevels: ["high" as RiskLevel], includeIncompatibleFlag: true }
    }
  },
  permissive: {
    name: "Permissive",
    description: "All risk levels as compatible unless flagged incompatible",
    config: {
      compatible: { riskLevels: ["low" as RiskLevel, "medium" as RiskLevel, "high" as RiskLevel], requiresCompatibleFlag: false },
      needsReview: { riskLevels: [] as RiskLevel[] },
      incompatible: { riskLevels: [] as RiskLevel[], includeIncompatibleFlag: true }
    }
  }
};
