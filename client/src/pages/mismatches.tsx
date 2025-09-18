import { useQuery } from "@tanstack/react-query";
import MismatchesTable from "@/components/dashboard/mismatches-table";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import type { MedicalRecord } from "@shared/schema";

export default function Mismatches() {
  const { data: mismatches, isLoading } = useQuery<MedicalRecord[]>({
    queryKey: ["/api/mismatches"],
  });

  return (
    <div className="flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground flex items-center">
              <AlertTriangle className="mr-3 h-6 w-6 text-destructive" />
              Medication Mismatches
            </h2>
            <p className="text-muted-foreground">Review medication-diagnosis compatibility issues</p>
          </div>
          <Link href="/">
            <Button variant="outline" data-testid="button-back-dashboard">
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </header>

      {/* Mismatches Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <MismatchesTable 
          mismatches={mismatches} 
          isLoading={isLoading}
          showPagination={true}
          showHeader={false}
        />
      </main>
    </div>
  );
}
