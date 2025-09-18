import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import UploadZone from "@/components/upload/upload-zone";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, AlertTriangle, FileText, Upload as UploadIcon, FileSpreadsheet } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface UploadResponse {
  success: boolean;
  analysisId: string;
  summary: {
    totalRecords: number;
    compatibleRecords: number;
    incompatibleRecords: number;
    needsReviewRecords: number;
    successRate: string;
    specialtiesAffected: number;
  };
}

export default function Upload() {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [analysisResult, setAnalysisResult] = useState<UploadResponse | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      
      // Simulate progress
      setUploadProgress(10);
      
      const response = await apiRequest("POST", "/api/upload", formData);
      
      setUploadProgress(50);
      
      // Simulate additional processing time
      await new Promise(resolve => setTimeout(resolve, 1000));
      setUploadProgress(80);
      
      const result = await response.json();
      setUploadProgress(100);
      
      return result;
    },
    onSuccess: (data: UploadResponse) => {
      setAnalysisResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mismatches"] });
      toast({
        title: "Analysis Complete",
        description: `Successfully analyzed ${data.summary.totalRecords} records`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to process the uploaded file",
        variant: "destructive",
      });
      setUploadProgress(0);
      setUploadedFile(null);
    },
  });

  const handleFileUpload = (file: File) => {
    setUploadedFile(file);
    setUploadProgress(0);
    setAnalysisResult(null);
    uploadMutation.mutate(file);
  };

  return (
    <div className="flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Upload Medical Data</h2>
            <p className="text-muted-foreground">Upload Excel files for medication-diagnosis compatibility analysis</p>
          </div>
          <Link href="/">
            <Button variant="outline" data-testid="button-back-dashboard">
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </header>

      {/* Upload Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {/* Upload Section */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
              <UploadIcon className="mr-2 h-5 w-5 text-primary" />
              Upload Medical Data
            </h3>
            
            <Card>
              <CardContent className="p-6">
                <UploadZone 
                  onFileUpload={handleFileUpload}
                  disabled={uploadMutation.isPending}
                />
                
                {/* Format Information */}
                <div className="mt-6 p-4 bg-accent/50 rounded-lg border" data-testid="format-info">
                  <h4 className="font-medium text-foreground mb-3 flex items-center">
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Expected Excel Format
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <h5 className="font-medium text-foreground mb-2">Required Columns:</h5>
                      <ul className="space-y-1 text-muted-foreground">
                        <li>• <strong>Claim Code Ref</strong> - Patient identifier</li>
                        <li>• <strong>Speciality</strong> - Medical specialty</li>
                        <li>• <strong>Active Ingredient</strong> - Medication ingredient</li>
                        <li>• <strong>Diag 1</strong> - Primary ICD-10 diagnosis code</li>
                      </ul>
                    </div>
                    <div>
                      <h5 className="font-medium text-foreground mb-2">Optional Columns:</h5>
                      <ul className="space-y-1 text-muted-foreground">
                        <li>• <strong>Diag 2, Diag 3...</strong> - Additional diagnoses</li>
                        <li>• <strong>Activity Code</strong> - Procedure code</li>
                        <li>• <strong>Gender</strong> - Patient gender</li>
                      </ul>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    Note: The system will automatically map your Excel columns to the required format.
                  </div>
                </div>
                
                {/* Upload Progress */}
                {uploadMutation.isPending && uploadedFile && (
                  <div className="mt-6" data-testid="upload-progress">
                    <Card className="bg-accent">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-foreground">
                            Processing: {uploadedFile.name}
                          </span>
                          <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
                        </div>
                        <Progress value={uploadProgress} className="mb-2" />
                        <div className="text-xs text-muted-foreground">
                          {uploadProgress < 30 ? "Validating data structure..." :
                           uploadProgress < 70 ? "Analyzing ICD-10 codes..." :
                           "Generating compatibility report..."}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Analysis Results */}
          {analysisResult && (
            <div className="mb-8" data-testid="analysis-results">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
                <CheckCircle className="mr-2 h-5 w-5 text-success" />
                Analysis Complete
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Records</p>
                        <p className="text-2xl font-bold text-foreground" data-testid="text-total-records">
                          {analysisResult.summary.totalRecords}
                        </p>
                      </div>
                      <FileText className="h-8 w-8 text-primary" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Compatibility Issues</p>
                        <p className="text-2xl font-bold text-destructive" data-testid="text-issues">
                          {analysisResult.summary.incompatibleRecords + analysisResult.summary.needsReviewRecords}
                        </p>
                      </div>
                      <AlertTriangle className="h-8 w-8 text-destructive" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Success Rate</p>
                        <p className="text-2xl font-bold text-success" data-testid="text-success-rate">
                          {analysisResult.summary.successRate}
                        </p>
                      </div>
                      <CheckCircle className="h-8 w-8 text-success" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="p-6">
                  <h4 className="text-lg font-semibold text-foreground mb-4">Analysis Summary</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Compatible Records:</span>
                      <span className="font-medium text-success">{analysisResult.summary.compatibleRecords}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Records Needing Review:</span>
                      <span className="font-medium text-warning">{analysisResult.summary.needsReviewRecords}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Incompatible Records:</span>
                      <span className="font-medium text-destructive">{analysisResult.summary.incompatibleRecords}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Medical Specialties Affected:</span>
                      <span className="font-medium text-foreground">{analysisResult.summary.specialtiesAffected}</span>
                    </div>
                  </div>
                  
                  <div className="mt-6 flex space-x-4">
                    <Link href="/">
                      <Button data-testid="button-view-dashboard">
                        View Dashboard
                      </Button>
                    </Link>
                    <Link href="/mismatches">
                      <Button variant="outline" data-testid="button-view-mismatches">
                        View Detailed Mismatches
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* File Format Instructions */}
          <Card>
            <CardContent className="p-6">
              <h4 className="text-lg font-semibold text-foreground mb-4">Required File Format</h4>
              <div className="space-y-3">
                <p className="text-muted-foreground">
                  Your Excel file should contain the following columns:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  <li><strong>patientId:</strong> Unique identifier for each patient</li>
                  <li><strong>medication:</strong> Name of the prescribed medication</li>
                  <li><strong>dosage:</strong> Medication dosage (optional)</li>
                  <li><strong>diagnosis:</strong> Patient's diagnosis description</li>
                  <li><strong>icd10Code:</strong> ICD-10 diagnosis code (optional, will be auto-detected if missing)</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-3">
                  <strong>Supported formats:</strong> .xlsx, .xls (max 10MB)
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
