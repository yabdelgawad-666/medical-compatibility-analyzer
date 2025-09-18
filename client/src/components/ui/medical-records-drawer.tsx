import { X, AlertCircle, Loader2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MedicalRecord } from "@shared/schema";

interface MedicalRecordsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  records?: MedicalRecord[];
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

interface MedicalRecordItemProps {
  record: MedicalRecord;
  index: number;
}

function MedicalRecordItem({ record, index }: MedicalRecordItemProps) {
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

  const getCompatibilityBadge = (isCompatible: boolean, riskLevel: string) => {
    if (isCompatible) {
      return <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">Compatible</Badge>;
    } else if (riskLevel === "medium") {
      return <Badge variant="secondary" className="bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800">Needs Review</Badge>;
    } else {
      return <Badge variant="destructive">Incompatible</Badge>;
    }
  };

  return (
    <div
      className="border border-border rounded-lg p-4 space-y-3 bg-card hover:bg-accent/5 transition-colors"
      data-testid={`medical-record-item-${record.patientId}`}
    >
      {/* Header with Patient ID and Compatibility Status */}
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-sm font-semibold text-foreground" data-testid={`text-patient-id-${record.patientId}`}>
            Patient ID: {record.patientId}
          </h4>
          <p className="text-xs text-muted-foreground">
            {record.createdAt ? new Date(record.createdAt).toLocaleDateString() : 'No date'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {getCompatibilityBadge(record.isCompatible, record.riskLevel)}
          <Badge
            variant={getRiskBadgeVariant(record.riskLevel)}
            data-testid={`badge-risk-${record.riskLevel}-${record.patientId}`}
          >
            {getRiskLabel(record.riskLevel)}
          </Badge>
        </div>
      </div>

      {/* Medication Information */}
      <div className="space-y-2">
        <div>
          <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Medication</h5>
          <p className="text-sm text-foreground font-medium" data-testid={`text-medication-${record.patientId}`}>
            {record.medication}
          </p>
          {record.dosage && (
            <p className="text-xs text-muted-foreground" data-testid={`text-dosage-${record.patientId}`}>
              Dosage: {record.dosage}
            </p>
          )}
          <p className="text-xs text-muted-foreground" data-testid={`text-active-ingredient-${record.patientId}`}>
            Active Ingredient: {record.activeIngredient}
          </p>
        </div>

        {/* Diagnosis Information */}
        <div>
          <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Diagnosis</h5>
          <p className="text-sm text-foreground" data-testid={`text-diagnosis-${record.patientId}`}>
            {record.diagnosis}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs font-mono text-muted-foreground" data-testid={`text-icd10-${record.patientId}`}>
              ICD-10: {record.icd10Code}
            </p>
            <span className="text-muted-foreground">•</span>
            <p className="text-xs text-muted-foreground" data-testid={`text-specialty-${record.patientId}`}>
              {record.specialty}
            </p>
          </div>
        </div>

        {/* Analysis Notes */}
        {record.analysisNotes && (
          <div>
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Analysis Notes</h5>
            <p className="text-xs text-muted-foreground" data-testid={`text-analysis-notes-${record.patientId}`}>
              {record.analysisNotes}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" data-testid="drawer-loading-state">
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading medical records...</span>
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="drawer-empty-state">
      <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
      <h3 className="text-lg font-medium text-foreground mb-2">No Records Found</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        No medical records found for "{title}". Try adjusting your filters or check back later.
      </p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="drawer-error-state">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h3 className="text-lg font-medium text-foreground mb-2">Error Loading Records</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">{error}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} data-testid="button-retry-loading">
          Try Again
        </Button>
      )}
    </div>
  );
}

export default function MedicalRecordsDrawer({
  isOpen,
  onClose,
  title,
  records,
  isLoading = false,
  error = null,
  className
}: MedicalRecordsDrawerProps) {
  // Handle ESC key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  // Handle overlay click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-end"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
      data-testid="medical-records-drawer"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={handleOverlayClick}
        data-testid="drawer-overlay"
      />

      {/* Drawer Content */}
      <div
        className={cn(
          "relative w-full max-w-lg h-full bg-background border-l border-border shadow-2xl",
          "transform transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full",
          "sm:max-w-xl md:max-w-2xl lg:max-w-3xl",
          className
        )}
        data-testid="drawer-content"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-card/50">
          <div>
            <h2
              id="drawer-title"
              className="text-lg font-semibold text-foreground"
              data-testid="drawer-title"
            >
              {title}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isLoading ? 'Loading...' : records ? `${records.length} records found` : 'Medical records details'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            data-testid="button-close-drawer"
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content Area */}
        <ScrollArea className="h-[calc(100vh-80px)] p-6" data-testid="drawer-scroll-area">
          {error ? (
            <ErrorState error={error} />
          ) : isLoading ? (
            <LoadingState />
          ) : !records || records.length === 0 ? (
            <EmptyState title={title} />
          ) : (
            <div className="space-y-4" data-testid="drawer-records-list">
              {records.map((record, index) => (
                <MedicalRecordItem
                  key={record.id || `${record.patientId}-${index}`}
                  record={record}
                  index={index}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

export type { MedicalRecordsDrawerProps };