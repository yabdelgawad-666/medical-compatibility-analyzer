import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, ArrowLeft, Pill, Stethoscope, FileText, User, Calendar } from "lucide-react";
import type { MedicalRecord } from "@shared/schema";

export default function MismatchDetail() {
  const [, params] = useRoute("/mismatch/:id");
  const recordId = params?.id;

  const { data: record, isLoading, error } = useQuery<MedicalRecord>({
    queryKey: ["/api/records", recordId],
    enabled: !!recordId,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col overflow-hidden">
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Link href="/mismatches">
                <Button variant="ghost" size="sm" className="mr-4">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>
              <h2 className="text-2xl font-semibold text-foreground">Loading...</h2>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="h-6 bg-muted rounded animate-pulse" />
                    <div className="h-4 bg-muted rounded animate-pulse" />
                    <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="flex flex-col overflow-hidden">
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Link href="/mismatches">
                <Button variant="ghost" size="sm" className="mr-4">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>
              <h2 className="text-2xl font-semibold text-foreground">Record Not Found</h2>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Card>
            <CardContent className="p-6 text-center">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Mismatch Record Not Found</h3>
              <p className="text-muted-foreground mb-4">
                The requested mismatch record could not be found or may have been removed.
              </p>
              <Link href="/mismatches">
                <Button>Return to Mismatches</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const getRiskBadgeVariant = (riskLevel: string) => {
    switch (riskLevel) {
      case "high":
        return "destructive";
      case "medium":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getRiskLabel = (riskLevel: string) => {
    switch (riskLevel) {
      case "high":
        return "High Risk";
      case "medium":
        return "Medium Risk";
      default:
        return "Low Risk";
    }
  };

  return (
    <div className="flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Link href="/mismatches">
              <Button variant="ghost" size="sm" className="mr-4" data-testid="button-back-mismatches">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h2 className="text-2xl font-semibold text-foreground flex items-center">
                <AlertTriangle className="mr-3 h-6 w-6 text-destructive" />
                Mismatch Details - Patient {record.patientId}
              </h2>
              <p className="text-muted-foreground">Review detailed medication-diagnosis compatibility analysis</p>
            </div>
          </div>
          <Badge 
            variant={getRiskBadgeVariant(record.riskLevel)}
            className="text-sm px-3 py-1"
            data-testid={`badge-risk-${record.riskLevel}`}
          >
            {getRiskLabel(record.riskLevel)}
          </Badge>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Patient Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="h-5 w-5 mr-2 text-primary" />
                Patient Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Patient ID</label>
                  <p className="text-lg font-semibold text-foreground" data-testid="text-patient-id">
                    {record.patientId}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Record Created</label>
                  <p className="text-foreground flex items-center" data-testid="text-created-date">
                    <Calendar className="h-4 w-4 mr-2" />
                    {record.createdAt ? new Date(record.createdAt).toLocaleDateString() : 'Not available'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Medication Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Pill className="h-5 w-5 mr-2 text-primary" />
                Medication Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Medication Name</label>
                  <p className="text-lg font-semibold text-foreground" data-testid="text-medication">
                    {record.medication}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Active Ingredient</label>
                  <p className="text-foreground" data-testid="text-active-ingredient">
                    {record.activeIngredient}
                  </p>
                </div>
                {record.dosage && (
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Dosage</label>
                    <p className="text-foreground" data-testid="text-dosage">
                      {record.dosage}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Diagnosis Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Stethoscope className="h-5 w-5 mr-2 text-primary" />
                Diagnosis Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Diagnosis</label>
                  <p className="text-lg font-semibold text-foreground" data-testid="text-diagnosis">
                    {record.diagnosis}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">ICD-10 Code</label>
                  <p className="text-foreground font-mono text-lg" data-testid="text-icd10-code">
                    {record.icd10Code}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Medical Specialty</label>
                  <p className="text-foreground" data-testid="text-specialty">
                    {record.specialty}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Compatibility Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2 text-primary" />
                Compatibility Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Compatibility Status</label>
                  <div className="flex items-center mt-1">
                    <Badge 
                      variant={record.isCompatible ? "default" : "destructive"}
                      data-testid="badge-compatibility-status"
                    >
                      {record.isCompatible ? "Compatible" : "Incompatible"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Risk Assessment</label>
                  <div className="flex items-center mt-1">
                    <Badge 
                      variant={getRiskBadgeVariant(record.riskLevel)}
                      data-testid="badge-risk-assessment"
                    >
                      {getRiskLabel(record.riskLevel)}
                    </Badge>
                  </div>
                </div>
              </div>
              
              <Separator />
              
              {record.analysisNotes && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Analysis Notes</label>
                  <div className="mt-2 p-4 bg-muted rounded-lg">
                    <p className="text-foreground whitespace-pre-wrap" data-testid="text-analysis-notes">
                      {record.analysisNotes}
                    </p>
                  </div>
                </div>
              )}
              
              {!record.analysisNotes && (
                <div className="text-center py-4">
                  <p className="text-muted-foreground">No additional analysis notes available for this record.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-between items-center">
            <Link href="/mismatches">
              <Button variant="outline" data-testid="button-return-mismatches">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Return to All Mismatches
              </Button>
            </Link>
            <Link href="/">
              <Button data-testid="button-go-dashboard">
                Go to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}