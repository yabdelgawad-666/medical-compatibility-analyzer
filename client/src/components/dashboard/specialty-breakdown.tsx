import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { InfoHint } from "@/components/ui/info-hint";
import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { BarChart3, Info } from "lucide-react";
import type { SpecialtyData } from "@shared/schema";

export default function SpecialtyBreakdown() {
  const { data: specialties, isLoading } = useQuery<SpecialtyData[]>({
    queryKey: ["/api/dashboard/specialties"],
  });

  if (isLoading) {
    return (
      <TooltipProvider>
        <Card>
          <CardContent className="p-6">
            <div className="mb-4">
              <div className="flex items-center space-x-2">
                <BarChart3 className="text-secondary h-5 w-5" />
                <h4 className="text-lg font-semibold text-foreground">
                  Affected Medical Specialties
                </h4>
                <InfoHint
                  content="Distribution of compatibility issues by medical specialty"
                  ariaLabel="Show Medical Specialties description"
                  testId="info-medical-specialties"
                />
              </div>
            </div>
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 bg-muted rounded animate-pulse" />
                  <div className="h-2 bg-muted rounded animate-pulse" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TooltipProvider>
    );
  }

  if (!specialties || specialties.length === 0) {
    return (
      <TooltipProvider>
        <Card>
          <CardContent className="p-6">
            <div className="mb-4">
              <div className="flex items-center space-x-2">
                <BarChart3 className="text-secondary h-5 w-5" />
                <h4 className="text-lg font-semibold text-foreground">
                  Affected Medical Specialties
                </h4>
                <InfoHint
                  content="Distribution of compatibility issues by medical specialty"
                  ariaLabel="Show Medical Specialties description"
                  testId="info-medical-specialties"
                />
              </div>
            </div>
            <div className="text-center text-muted-foreground py-8">
              No specialty data available
            </div>
          </CardContent>
        </Card>
      </TooltipProvider>
    );
  }

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case "high":
        return "bg-destructive";
      case "medium":
        return "bg-warning";
      default:
        return "bg-success";
    }
  };

  const getRiskTextColor = (riskLevel: string) => {
    switch (riskLevel) {
      case "high":
        return "text-destructive";
      case "medium":
        return "text-warning";
      default:
        return "text-success";
    }
  };

  return (
    <TooltipProvider>
      <Card>
        <CardContent className="p-6">
          <div className="mb-4">
            <div className="flex items-center space-x-2">
              <BarChart3 className="text-secondary h-5 w-5" />
              <h4 className="text-lg font-semibold text-foreground">
                Affected Medical Specialties
              </h4>
              <InfoHint
                content="Distribution of compatibility issues by medical specialty"
                ariaLabel="Show Medical Specialties description"
                testId="info-medical-specialties"
              />
            </div>
          </div>
        <div className="space-y-4" data-testid="specialty-breakdown">
          {specialties.slice(0, 6).map((specialty, index) => (
            <div key={specialty.name} className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-foreground">
                  {specialty.name}
                </span>
                <span className={`text-sm font-medium ${getRiskTextColor(specialty.riskLevel)}`}>
                  {specialty.issueCount} issues
                </span>
              </div>
              <Progress 
                value={specialty.percentage} 
                className="h-2"
                data-testid={`progress-${specialty.name.toLowerCase().replace(/\s+/g, '-')}`}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}
