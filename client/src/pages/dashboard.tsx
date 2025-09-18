import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import StatsOverview from "@/components/dashboard/stats-overview";
import CompatibilityChart from "@/components/dashboard/compatibility-chart";
import SpecialtyBreakdown from "@/components/dashboard/specialty-breakdown";
import MismatchesTable from "@/components/dashboard/mismatches-table";
import CompatibilitySettings from "@/components/dashboard/compatibility-settings";
import { Button } from "@/components/ui/button";
import { Plus, User, RotateCcw } from "lucide-react";
import { Link } from "wouter";
import type { 
  DashboardStats, 
  MedicalRecord, 
  CompatibilityConfig 
} from "@shared/schema";
import { defaultCompatibilityConfig } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  loadCompatibilityConfig, 
  saveCompatibilityConfig,
  isLocalStorageAvailable 
} from "@/lib/storage";

export default function Dashboard() {
  const { toast } = useToast();
  const [appliedConfig, setAppliedConfig] = useState<CompatibilityConfig>(defaultCompatibilityConfig);
  const [draftConfig, setDraftConfig] = useState<CompatibilityConfig>(defaultCompatibilityConfig);

  // Load saved compatibility configuration from localStorage on mount
  useEffect(() => {
    const savedConfig = loadCompatibilityConfig();
    setAppliedConfig(savedConfig);
    setDraftConfig(savedConfig);
    
    // Show notification if localStorage is not available
    if (!isLocalStorageAvailable()) {
      toast({
        title: "Local Storage Unavailable",
        description: "Your configuration preferences cannot be saved for future sessions.",
        variant: "default",
      });
    }
  }, [toast]);

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats", appliedConfig],
    queryFn: async () => {
      const response = await apiRequest("POST", "/api/dashboard/stats", appliedConfig);
      return await response.json();
    },
  });

  // Preview stats query for draft configuration
  const { data: previewStats, isLoading: previewStatsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats", "preview", draftConfig],
    queryFn: async () => {
      const response = await apiRequest("POST", "/api/dashboard/stats", draftConfig);
      return await response.json();
    },
  });

  const { data: mismatches, isLoading: mismatchesLoading } = useQuery<MedicalRecord[]>({
    queryKey: ["/api/mismatches"],
  });

  const resetDataMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/data/reset"),
    onSuccess: () => {
      // Invalidate all relevant queries to refresh the dashboard
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mismatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/specialties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/records"] });
      
      toast({
        title: "Data Reset Complete",
        description: "All uploaded medical data has been cleared successfully.",
      });
    },
    onError: (error) => {
      console.error("Reset error:", error);
      toast({
        title: "Reset Failed",
        description: "Failed to clear medical data. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleReset = () => {
    if (window.confirm("Are you sure you want to clear all uploaded medical data? This action cannot be undone.")) {
      resetDataMutation.mutate();
    }
  };

  const handleDraftConfigChange = (newConfig: CompatibilityConfig) => {
    setDraftConfig(newConfig);
  };

  const handleSaveConfiguration = (configToSave: CompatibilityConfig) => {
    // Apply the draft configuration
    setAppliedConfig(configToSave);
    setDraftConfig(configToSave);
    
    // Save configuration to localStorage for persistence
    const saved = saveCompatibilityConfig(configToSave);
    
    if (!saved && isLocalStorageAvailable()) {
      // Only show error if localStorage is available but saving failed
      toast({
        title: "Settings Not Saved",
        description: "Failed to save your configuration preferences. Your settings will reset when you refresh the page.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Settings Saved",
        description: "Your compatibility configuration has been applied successfully.",
      });
    }
    
    // Invalidate main stats query to refresh with new applied config
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats", configToSave] });
  };

  return (
    <div className="flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Medical Data Analysis Dashboard</h2>
            <p className="text-muted-foreground">Analyze medication compatibility with ICD-10 diagnoses</p>
          </div>
          <div className="flex items-center space-x-4">
            <Button 
              variant="outline"
              onClick={handleReset}
              disabled={resetDataMutation.isPending || !stats?.totalRecords}
              data-testid="button-reset-data"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {resetDataMutation.isPending ? "Clearing..." : "Reset Data"}
            </Button>
            <Link href="/upload">
              <Button data-testid="button-new-analysis">
                <Plus className="mr-2 h-4 w-4" />
                New Analysis
              </Button>
            </Link>
            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center" data-testid="avatar-user">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {/* Compatibility Configuration */}
        <div className="mb-8">
          <CompatibilitySettings
            config={draftConfig}
            onChange={handleDraftConfigChange}
            onSave={handleSaveConfiguration}
            stats={previewStats}
            isLoading={previewStatsLoading}
            defaultOpen={false}
          />
        </div>


        {/* Error State */}
        {statsError && (
          <div className="mb-8 p-4 bg-destructive/10 border border-destructive/20 rounded-lg" data-testid="error-stats">
            <p className="text-destructive text-sm">
              Error loading statistics: {statsError.message}
            </p>
          </div>
        )}

        {/* Stats Overview */}
        <StatsOverview stats={stats} isLoading={statsLoading} />

        {/* Analysis Results */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <CompatibilityChart stats={stats} isLoading={statsLoading} />
          <SpecialtyBreakdown />
        </div>

        {/* Recent Mismatches */}
        <MismatchesTable 
          mismatches={mismatches} 
          isLoading={mismatchesLoading}
          showPagination={true}
        />
      </main>
    </div>
  );
}
