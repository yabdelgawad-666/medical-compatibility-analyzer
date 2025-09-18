import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Eye, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import type { MedicalRecord } from "@shared/schema";

interface MismatchesTableProps {
  mismatches?: MedicalRecord[];
  isLoading: boolean;
  showPagination?: boolean;
  showHeader?: boolean;
}

export default function MismatchesTable({ 
  mismatches, 
  isLoading, 
  showPagination = false,
  showHeader = true 
}: MismatchesTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          {showHeader && (
            <div className="border-b border-border pb-6 mb-6">
              <div>
                <h4 className="text-lg font-semibold text-foreground flex items-center">
                  <AlertTriangle className="text-destructive mr-2 h-5 w-5" />
                  Critical Medication Mismatches
                </h4>
                <p className="text-xs text-muted-foreground/80 mt-1">High-risk incompatible medication-diagnosis combinations</p>
              </div>
            </div>
          )}
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!mismatches || mismatches.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          {showHeader && (
            <div className="border-b border-border pb-6 mb-6">
              <div>
                <h4 className="text-lg font-semibold text-foreground flex items-center">
                  <AlertTriangle className="text-destructive mr-2 h-5 w-5" />
                  Critical Medication Mismatches
                </h4>
                <p className="text-xs text-muted-foreground/80 mt-1">High-risk incompatible medication-diagnosis combinations</p>
              </div>
            </div>
          )}
          <div className="text-center text-muted-foreground py-8">
            No mismatches found. All medications appear to be compatible.
          </div>
        </CardContent>
      </Card>
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
    <Card>
      {showHeader && (
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <div>
                <h4 className="text-lg font-semibold text-foreground flex items-center">
                  <AlertTriangle className="text-destructive mr-2 h-5 w-5" />
                  Critical Medication Mismatches
                </h4>
                <p className="text-xs text-muted-foreground/80 mt-1">High-risk incompatible medication-diagnosis combinations</p>
              </div>
              <p className="text-xs text-muted-foreground/80 mt-1">High-risk incompatible medication-diagnosis combinations</p>
            </div>
            <Link href="/mismatches">
              <Button variant="ghost" size="sm" data-testid="button-view-all-mismatches">
                View All <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}
      
      <div className="overflow-x-auto">
        <table className="w-full" data-testid="table-mismatches">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Patient ID
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Medication
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Diagnosis
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                ICD-10
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Specialty
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Risk Level
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {mismatches.map((record) => (
              <tr 
                key={record.id} 
                className="hover:bg-accent transition-colors"
                data-testid={`row-mismatch-${record.patientId}`}
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                  {record.patientId}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-foreground">{record.medication}</div>
                  {record.dosage && (
                    <div className="text-xs text-muted-foreground">{record.dosage}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                  {record.diagnosis}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-foreground">
                  {record.icd10Code}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                  {record.specialty}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge 
                    variant={getRiskBadgeVariant(record.riskLevel)}
                    data-testid={`badge-risk-${record.riskLevel}`}
                  >
                    {getRiskLabel(record.riskLevel)}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                  <Link href={`/mismatch/${record.id}`}>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      data-testid={`button-view-details-${record.patientId}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPagination && (
        <div className="px-6 py-4 border-t border-border bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {mismatches.length} of {mismatches.length} critical mismatches
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" disabled data-testid="button-previous-page">
                Previous
              </Button>
              <Button size="sm" data-testid="button-page-1">
                1
              </Button>
              <Button variant="outline" size="sm" disabled data-testid="button-next-page">
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
