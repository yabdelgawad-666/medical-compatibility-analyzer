import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { InfoHint } from "@/components/ui/info-hint";
import { Database, AlertTriangle, CheckCircle, Stethoscope, Info } from "lucide-react";
import type { DashboardStats } from "@shared/schema";

interface StatsOverviewProps {
  stats?: DashboardStats;
  isLoading: boolean;
}

export default function StatsOverview({ stats, isLoading }: StatsOverviewProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">
              No data available. Upload a file to see statistics.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <p className="text-sm text-muted-foreground">Total Records</p>
                  <InfoHint
                    content="Patient medication records analyzed"
                    ariaLabel="Show Total Records description"
                    testId="info-total-records"
                  />
                </div>
                <p className="text-2xl font-bold text-foreground" data-testid="text-total-records">
                  {stats.totalRecords.toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Database className="text-primary h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <p className="text-sm text-muted-foreground">Compatibility Issues</p>
                  <InfoHint
                    content="Incompatible + needs review records"
                    ariaLabel="Show Compatibility Issues description"
                    testId="info-compatibility-issues"
                  />
                </div>
                <p className="text-2xl font-bold text-destructive" data-testid="text-compatibility-issues">
                  {stats.compatibilityIssues.toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 bg-destructive/10 rounded-lg flex items-center justify-center">
                <AlertTriangle className="text-destructive h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <p className="text-sm text-muted-foreground">Success Rate</p>
                  <InfoHint
                    content="Percentage of compatible combinations"
                    ariaLabel="Show Success Rate description"
                    testId="info-success-rate"
                  />
                </div>
                <p className="text-2xl font-bold text-success" data-testid="text-success-rate">
                  {stats.successRate}
                </p>
              </div>
              <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                <CheckCircle className="text-success h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <p className="text-sm text-muted-foreground">Specialties Affected</p>
                  <InfoHint
                    content="Medical specialties with issues found"
                    ariaLabel="Show Specialties Affected description"
                    testId="info-specialties-affected"
                  />
                </div>
                <p className="text-2xl font-bold text-foreground" data-testid="text-specialties-affected">
                  {stats.specialtiesAffected}
                </p>
              </div>
              <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center">
                <Stethoscope className="text-secondary h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
