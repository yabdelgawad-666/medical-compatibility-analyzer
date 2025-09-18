import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Settings, 
  Info, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Save
} from "lucide-react";
import type { 
  CompatibilityConfig, 
  RiskLevel, 
  DashboardStats 
} from "@shared/schema";
import { 
  defaultCompatibilityConfig, 
  compatibilityPresets 
} from "@shared/schema";

interface CompatibilitySettingsProps {
  /** Current configuration state */
  config: CompatibilityConfig;
  /** Callback when configuration changes */
  onChange: (config: CompatibilityConfig) => void;
  /** Callback to save and apply configuration */
  onSave?: (config: CompatibilityConfig) => void;
  /** Preview stats based on draft configuration */
  stats?: DashboardStats;
  /** Whether preview stats are loading */
  isLoading?: boolean;
  /** Whether the settings panel starts open */
  defaultOpen?: boolean;
}

interface PreviewStats {
  compatible: number;
  needsReview: number;
  incompatible: number;
  successRate: string;
}

export default function CompatibilitySettings({
  config,
  onChange,
  onSave,
  stats,
  isLoading = false,
  defaultOpen = false
}: CompatibilitySettingsProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Handle risk level checkbox changes for each category
  const handleRiskLevelChange = (
    category: keyof CompatibilityConfig,
    riskLevel: RiskLevel,
    checked: boolean
  ) => {
    const currentRiskLevels = config[category].riskLevels;
    const newRiskLevels = checked 
      ? [...currentRiskLevels, riskLevel]
      : currentRiskLevels.filter(rl => rl !== riskLevel);
    
    onChange({
      ...config,
      [category]: {
        ...config[category],
        riskLevels: newRiskLevels
      }
    });
  };

  // Handle toggle changes for boolean flags
  const handleToggleChange = (
    category: 'compatible' | 'incompatible',
    field: 'requiresCompatibleFlag' | 'includeIncompatibleFlag',
    checked: boolean
  ) => {
    if (category === 'compatible' && field === 'requiresCompatibleFlag') {
      onChange({
        ...config,
        compatible: {
          ...config.compatible,
          requiresCompatibleFlag: checked
        }
      });
    } else if (category === 'incompatible' && field === 'includeIncompatibleFlag') {
      onChange({
        ...config,
        incompatible: {
          ...config.incompatible,
          includeIncompatibleFlag: checked
        }
      });
    }
  };

  // Apply preset configuration
  const applyPreset = (presetKey: keyof typeof compatibilityPresets) => {
    // Deep clone preset config to avoid shared references
    const presetConfig = compatibilityPresets[presetKey].config;
    onChange({
      compatible: {
        riskLevels: [...presetConfig.compatible.riskLevels],
        requiresCompatibleFlag: presetConfig.compatible.requiresCompatibleFlag
      },
      needsReview: {
        riskLevels: [...presetConfig.needsReview.riskLevels]
      },
      incompatible: {
        riskLevels: [...presetConfig.incompatible.riskLevels],
        includeIncompatibleFlag: presetConfig.incompatible.includeIncompatibleFlag
      }
    });
  };

  // Reset to default configuration
  const resetToDefaults = () => {
    // Deep clone default config to avoid shared references
    onChange({
      compatible: {
        riskLevels: [...defaultCompatibilityConfig.compatible.riskLevels],
        requiresCompatibleFlag: defaultCompatibilityConfig.compatible.requiresCompatibleFlag
      },
      needsReview: {
        riskLevels: [...defaultCompatibilityConfig.needsReview.riskLevels]
      },
      incompatible: {
        riskLevels: [...defaultCompatibilityConfig.incompatible.riskLevels],
        includeIncompatibleFlag: defaultCompatibilityConfig.incompatible.includeIncompatibleFlag
      }
    });
  };

  // Deep equality check for configurations
  const configsEqual = (config1: CompatibilityConfig, config2: CompatibilityConfig): boolean => {
    return JSON.stringify(config1) === JSON.stringify(config2);
  };

  // Find selected preset key based on current configuration
  const getSelectedPresetKey = (): keyof typeof compatibilityPresets | null => {
    for (const [key, preset] of Object.entries(compatibilityPresets)) {
      if (configsEqual(config, preset.config)) {
        return key as keyof typeof compatibilityPresets;
      }
    }
    return null;
  };

  const selectedPresetKey = getSelectedPresetKey();

  // Calculate preview stats from provided stats
  const calculatePreviewStats = (): PreviewStats | null => {
    if (!stats) return null;

    return {
      compatible: stats.compatibleCount,
      needsReview: stats.needsReviewCount,
      incompatible: stats.incompatibleCount,
      successRate: stats.successRate
    };
  };

  const previewStats = calculatePreviewStats();

  // Handle save configuration
  const handleSave = () => {
    if (onSave) {
      onSave(config);
      setIsOpen(false); // Close settings panel after save
    }
  };

  const RiskLevelCheckbox = ({
    category,
    riskLevel,
    label
  }: {
    category: keyof CompatibilityConfig;
    riskLevel: RiskLevel;
    label: string;
  }) => {
    const isChecked = config[category].riskLevels.includes(riskLevel);
    
    return (
      <div className="flex items-center space-x-2">
        <Checkbox
          id={`${category}-${riskLevel}`}
          checked={isChecked}
          onCheckedChange={(checked) => 
            handleRiskLevelChange(category, riskLevel, !!checked)
          }
          data-testid={`checkbox-${category}-${riskLevel}`}
        />
        <Label 
          htmlFor={`${category}-${riskLevel}`}
          className="text-sm font-medium cursor-pointer"
        >
          {label}
        </Label>
      </div>
    );
  };

  return (
    <TooltipProvider>
      <Card className="w-full">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-4 hover:bg-accent/50 transition-colors cursor-pointer">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Settings className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Compatibility Settings</h3>
                    <p className="text-sm text-muted-foreground font-normal">
                      Configure how records are categorized by risk level and compatibility
                    </p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  data-testid="button-toggle-settings"
                >
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="pt-0">
              {/* Preset Buttons */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <Label className="text-sm font-medium">Quick Presets</Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">Choose a preset configuration or customize individual settings below</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetToDefaults}
                    data-testid="button-reset-defaults"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset to Defaults
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {Object.entries(compatibilityPresets).map(([key, preset]) => {
                    const isSelected = selectedPresetKey === key;
                    return (
                      <Button
                        key={key}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => applyPreset(key as keyof typeof compatibilityPresets)}
                        className={`h-auto p-3 text-left ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                        data-testid={`button-preset-${key}`}
                      >
                        <div>
                          <div className="font-medium text-sm">{preset.name}</div>
                          <div className={`text-xs mt-1 ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                            {preset.description}
                          </div>
                        </div>
                      </Button>
                    );
                  })}
                </div>
              </div>

              <Separator className="mb-6" />

              {/* Configuration Categories */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Compatible Category */}
                <Card className="border-success/20 bg-success/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center space-x-2 text-success">
                      <CheckCircle className="h-5 w-5" />
                      <span>Compatible</span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Records considered safe medication-diagnosis combinations
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Risk Levels</Label>
                      <div className="space-y-2">
                        <RiskLevelCheckbox 
                          category="compatible" 
                          riskLevel="low" 
                          label="Low Risk" 
                        />
                        <RiskLevelCheckbox 
                          category="compatible" 
                          riskLevel="medium" 
                          label="Medium Risk" 
                        />
                        <RiskLevelCheckbox 
                          category="compatible" 
                          riskLevel="high" 
                          label="High Risk" 
                        />
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="compatible-flag"
                        checked={config.compatible.requiresCompatibleFlag}
                        onCheckedChange={(checked) => 
                          handleToggleChange('compatible', 'requiresCompatibleFlag', !!checked)
                        }
                        data-testid="checkbox-require-compatible-flag"
                      />
                      <Label htmlFor="compatible-flag" className="text-sm cursor-pointer">
                        Require Compatible Flag
                      </Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">Only include records explicitly marked as compatible</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </CardContent>
                </Card>

                {/* Needs Review Category */}
                <Card className="border-warning/20 bg-warning/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center space-x-2 text-warning">
                      <AlertTriangle className="h-5 w-5" />
                      <span>Needs Review</span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Records requiring clinical evaluation before use
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Risk Levels</Label>
                      <div className="space-y-2">
                        <RiskLevelCheckbox 
                          category="needsReview" 
                          riskLevel="low" 
                          label="Low Risk" 
                        />
                        <RiskLevelCheckbox 
                          category="needsReview" 
                          riskLevel="medium" 
                          label="Medium Risk" 
                        />
                        <RiskLevelCheckbox 
                          category="needsReview" 
                          riskLevel="high" 
                          label="High Risk" 
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Incompatible Category */}
                <Card className="border-destructive/20 bg-destructive/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center space-x-2 text-destructive">
                      <XCircle className="h-5 w-5" />
                      <span>Incompatible</span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Records with potentially dangerous combinations
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Risk Levels</Label>
                      <div className="space-y-2">
                        <RiskLevelCheckbox 
                          category="incompatible" 
                          riskLevel="low" 
                          label="Low Risk" 
                        />
                        <RiskLevelCheckbox 
                          category="incompatible" 
                          riskLevel="medium" 
                          label="Medium Risk" 
                        />
                        <RiskLevelCheckbox 
                          category="incompatible" 
                          riskLevel="high" 
                          label="High Risk" 
                        />
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="incompatible-flag"
                        checked={config.incompatible.includeIncompatibleFlag}
                        onCheckedChange={(checked) => 
                          handleToggleChange('incompatible', 'includeIncompatibleFlag', !!checked)
                        }
                        data-testid="checkbox-include-incompatible-flag"
                      />
                      <Label htmlFor="incompatible-flag" className="text-sm cursor-pointer">
                        Include Incompatible Flag
                      </Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">Include records explicitly flagged as incompatible</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Preview Section */}
              {(previewStats || isLoading) && (
                <>
                  <Separator className="my-6" />
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2">
                        <Label className="text-sm font-medium">Configuration Preview</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              Real-time preview of how your current settings will categorize the data
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      
                      {/* Save Button */}
                      {onSave && (
                        <Button
                          onClick={handleSave}
                          disabled={isLoading}
                          className="ml-4"
                          data-testid="button-save-settings"
                        >
                          <Save className="h-4 w-4 mr-2" />
                          {isLoading ? "Saving..." : "Save & Apply"}
                        </Button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <Card className="bg-success/5 border-success/20">
                        <CardContent className="p-3 text-center">
                          {isLoading ? (
                            <div className="animate-pulse">
                              <div className="h-8 bg-success/20 rounded mb-2"></div>
                              <div className="h-4 bg-success/10 rounded"></div>
                            </div>
                          ) : (
                            <>
                              <div className="text-xl lg:text-2xl font-bold text-success" data-testid="preview-compatible">
                                {previewStats?.compatible.toLocaleString()}
                              </div>
                              <div className="text-xs lg:text-sm text-muted-foreground">Compatible</div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                      
                      <Card className="bg-warning/5 border-warning/20">
                        <CardContent className="p-3 text-center">
                          {isLoading ? (
                            <div className="animate-pulse">
                              <div className="h-8 bg-warning/20 rounded mb-2"></div>
                              <div className="h-4 bg-warning/10 rounded"></div>
                            </div>
                          ) : (
                            <>
                              <div className="text-xl lg:text-2xl font-bold text-warning" data-testid="preview-needs-review">
                                {previewStats?.needsReview.toLocaleString()}
                              </div>
                              <div className="text-xs lg:text-sm text-muted-foreground">Needs Review</div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                      
                      <Card className="bg-destructive/5 border-destructive/20">
                        <CardContent className="p-3 text-center">
                          {isLoading ? (
                            <div className="animate-pulse">
                              <div className="h-8 bg-destructive/20 rounded mb-2"></div>
                              <div className="h-4 bg-destructive/10 rounded"></div>
                            </div>
                          ) : (
                            <>
                              <div className="text-xl lg:text-2xl font-bold text-destructive" data-testid="preview-incompatible">
                                {previewStats?.incompatible.toLocaleString()}
                              </div>
                              <div className="text-xs lg:text-sm text-muted-foreground">Incompatible</div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                      
                      <Card className="bg-primary/5 border-primary/20">
                        <CardContent className="p-3 text-center">
                          {isLoading ? (
                            <div className="animate-pulse">
                              <div className="h-8 bg-primary/20 rounded mb-2"></div>
                              <div className="h-4 bg-primary/10 rounded"></div>
                            </div>
                          ) : (
                            <>
                              <div className="text-xl lg:text-2xl font-bold text-primary" data-testid="preview-success-rate">
                                {previewStats?.successRate}
                              </div>
                              <div className="text-xs lg:text-sm text-muted-foreground">Success Rate</div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </TooltipProvider>
  );
}