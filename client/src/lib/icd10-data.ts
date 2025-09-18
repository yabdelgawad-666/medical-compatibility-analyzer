export interface ICD10Code {
  code: string;
  description: string;
  category: string;
  specialty: string;
}

export const icd10Database: ICD10Code[] = [
  // Cardiovascular
  {
    code: "I21.9",
    description: "Acute myocardial infarction, unspecified",
    category: "Cardiovascular",
    specialty: "Cardiology"
  },
  {
    code: "I25.10",
    description: "Atherosclerotic heart disease of native coronary artery without angina pectoris",
    category: "Cardiovascular",
    specialty: "Cardiology"
  },
  {
    code: "I50.9",
    description: "Heart failure, unspecified",
    category: "Cardiovascular",
    specialty: "Cardiology"
  },
  
  // Mental Health
  {
    code: "F31.2",
    description: "Bipolar disorder, current episode manic severe without psychotic features",
    category: "Mental Health",
    specialty: "Psychiatry"
  },
  {
    code: "F32.9",
    description: "Major depressive disorder, single episode, unspecified",
    category: "Mental Health",
    specialty: "Psychiatry"
  },
  {
    code: "F41.9",
    description: "Anxiety disorder, unspecified",
    category: "Mental Health",
    specialty: "Psychiatry"
  },
  
  // Renal/Genitourinary
  {
    code: "N18.6",
    description: "End stage renal disease",
    category: "Genitourinary",
    specialty: "Nephrology"
  },
  {
    code: "N18.3",
    description: "Chronic kidney disease, stage 3 (moderate)",
    category: "Genitourinary",
    specialty: "Nephrology"
  },
  
  // Digestive
  {
    code: "K25.9",
    description: "Gastric ulcer, unspecified as acute or chronic, without hemorrhage or perforation",
    category: "Digestive",
    specialty: "Gastroenterology"
  },
  {
    code: "K50.90",
    description: "Crohn's disease, unspecified, without complications",
    category: "Digestive",
    specialty: "Gastroenterology"
  },
  
  // Respiratory
  {
    code: "J45.9",
    description: "Asthma, unspecified",
    category: "Respiratory",
    specialty: "Pulmonology"
  },
  {
    code: "J44.1",
    description: "Chronic obstructive pulmonary disease with acute exacerbation",
    category: "Respiratory",
    specialty: "Pulmonology"
  },
  
  // Endocrine
  {
    code: "E11.9",
    description: "Type 2 diabetes mellitus without complications",
    category: "Endocrine",
    specialty: "Endocrinology"
  },
  {
    code: "E11.65",
    description: "Type 2 diabetes mellitus with hyperglycemia",
    category: "Endocrine",
    specialty: "Endocrinology"
  },
  {
    code: "E03.9",
    description: "Hypothyroidism, unspecified",
    category: "Endocrine",
    specialty: "Endocrinology"
  },
  
  // Neurological
  {
    code: "G40.9",
    description: "Epilepsy, unspecified",
    category: "Neurological",
    specialty: "Neurology"
  },
  {
    code: "G35",
    description: "Multiple sclerosis",
    category: "Neurological",
    specialty: "Neurology"
  },
  {
    code: "G20",
    description: "Parkinson's disease",
    category: "Neurological",
    specialty: "Neurology"
  },
  
  // Default/Unknown
  {
    code: "Z00.00",
    description: "Encounter for general adult medical examination without abnormal findings",
    category: "General",
    specialty: "General Medicine"
  }
];

export function findICD10ByCode(code: string): ICD10Code | undefined {
  return icd10Database.find(icd => icd.code === code);
}

export function findICD10ByDescription(description: string): ICD10Code | undefined {
  const lowerDescription = description.toLowerCase();
  return icd10Database.find(icd => 
    icd.description.toLowerCase().includes(lowerDescription) ||
    lowerDescription.includes(icd.description.toLowerCase().split(',')[0])
  );
}

export function getICD10sBySpecialty(specialty: string): ICD10Code[] {
  return icd10Database.filter(icd => icd.specialty === specialty);
}
