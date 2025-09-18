export interface MedicationInfo {
  name: string;
  activeIngredient: string;
  contraindications: string[];
  compatibleICD10Codes: string[];
  incompatibleICD10Codes: string[];
  riskFactors: string[];
}

export const medicationDatabase: MedicationInfo[] = [
  {
    name: "Metformin HCl",
    activeIngredient: "Metformin",
    contraindications: ["I21.9", "N18.6", "N18.3"],
    compatibleICD10Codes: ["E11.9", "E11.65"],
    incompatibleICD10Codes: ["I21.9", "N18.6", "N18.3"],
    riskFactors: ["Renal impairment", "Heart failure", "Acidosis"]
  },
  {
    name: "Warfarin",
    activeIngredient: "Warfarin",
    contraindications: ["F31.2", "K25.9"],
    compatibleICD10Codes: ["I21.9", "I25.10", "I50.9"],
    incompatibleICD10Codes: ["F31.2", "K25.9"],
    riskFactors: ["Bleeding disorders", "GI ulcers", "Drug interactions"]
  },
  {
    name: "Insulin Glargine",
    activeIngredient: "Insulin",
    contraindications: ["N18.6"],
    compatibleICD10Codes: ["E11.9", "E11.65"],
    incompatibleICD10Codes: ["N18.6"],
    riskFactors: ["Severe kidney disease", "Hypoglycemia"]
  },
  {
    name: "Phenytoin",
    activeIngredient: "Phenytoin",
    contraindications: ["K25.9", "F32.9"],
    compatibleICD10Codes: ["G40.9"],
    incompatibleICD10Codes: ["K25.9", "F32.9"],
    riskFactors: ["GI irritation", "Drug interactions", "Mood changes"]
  },
  {
    name: "Aspirin",
    activeIngredient: "Acetylsalicylic Acid",
    contraindications: ["J45.9", "K25.9"],
    compatibleICD10Codes: ["I21.9", "I25.10"],
    incompatibleICD10Codes: ["J45.9", "K25.9"],
    riskFactors: ["Asthma", "GI bleeding", "Allergy"]
  },
  {
    name: "Prednisone",
    activeIngredient: "Prednisone",
    contraindications: ["E11.9", "F41.9"],
    compatibleICD10Codes: ["J45.9", "K50.90"],
    incompatibleICD10Codes: ["E11.9", "F41.9"],
    riskFactors: ["Diabetes", "Anxiety", "Immunosuppression"]
  },
  {
    name: "Lisinopril",
    activeIngredient: "Lisinopril",
    contraindications: ["N18.6"],
    compatibleICD10Codes: ["I25.10", "I50.9"],
    incompatibleICD10Codes: ["N18.6"],
    riskFactors: ["Renal impairment", "Hyperkalemia"]
  },
  {
    name: "Levothyroxine",
    activeIngredient: "Levothyroxine",
    contraindications: ["I21.9", "F31.2"],
    compatibleICD10Codes: ["E03.9"],
    incompatibleICD10Codes: ["I21.9", "F31.2"],
    riskFactors: ["Cardiovascular disease", "Bipolar disorder"]
  },
  {
    name: "Albuterol",
    activeIngredient: "Albuterol",
    contraindications: ["I25.10", "F41.9"],
    compatibleICD10Codes: ["J45.9", "J44.1"],
    incompatibleICD10Codes: ["I25.10", "F41.9"],
    riskFactors: ["Heart disease", "Anxiety disorders"]
  },
  {
    name: "Carbamazepine",
    activeIngredient: "Carbamazepine",
    contraindications: ["F32.9", "K25.9"],
    compatibleICD10Codes: ["G40.9", "F31.2"],
    incompatibleICD10Codes: ["F32.9", "K25.9"],
    riskFactors: ["Depression", "GI issues", "Blood disorders"]
  }
];

export function findMedicationByName(name: string): MedicationInfo | undefined {
  return medicationDatabase.find(med => 
    med.name.toLowerCase() === name.toLowerCase() ||
    med.name.toLowerCase().includes(name.toLowerCase())
  );
}

export function findMedicationByActiveIngredient(ingredient: string): MedicationInfo | undefined {
  return medicationDatabase.find(med => 
    med.activeIngredient.toLowerCase() === ingredient.toLowerCase()
  );
}

export function checkCompatibility(medicationName: string, icd10Code: string): {
  isCompatible: boolean;
  riskLevel: "low" | "medium" | "high";
  notes: string;
} {
  const medication = findMedicationByName(medicationName);
  
  if (!medication) {
    return {
      isCompatible: false,
      riskLevel: "medium",
      notes: "Medication not found in database"
    };
  }
  
  if (medication.incompatibleICD10Codes.includes(icd10Code)) {
    return {
      isCompatible: false,
      riskLevel: "high",
      notes: `${medicationName} is contraindicated for this diagnosis`
    };
  }
  
  if (medication.compatibleICD10Codes.includes(icd10Code)) {
    return {
      isCompatible: true,
      riskLevel: "low",
      notes: `${medicationName} is appropriate for this diagnosis`
    };
  }
  
  return {
    isCompatible: true,
    riskLevel: "medium",
    notes: "Compatibility requires manual review"
  };
}
