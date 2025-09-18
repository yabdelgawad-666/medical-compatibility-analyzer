import { Card, CardContent } from "@/components/ui/card";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { InfoHint } from "@/components/ui/info-hint";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { TrendingUp, Info } from "lucide-react";
import type { DashboardStats } from "@shared/schema";

interface CompatibilityChartProps {
  stats?: DashboardStats;
  isLoading: boolean;
}

export default function CompatibilityChart({ stats, isLoading }: CompatibilityChartProps) {
  if (isLoading || !stats) {
    return (
      <TooltipProvider>
        <Card>
          <CardContent className="p-6">
            <div className="mb-4">
              <div className="flex items-center space-x-2">
                <TrendingUp className="text-primary h-5 w-5" />
                <h4 className="text-lg font-semibold text-foreground">
                  Medication Compatibility Overview
                </h4>
                <InfoHint
                  content="Visual breakdown of compatibility analysis results"
                  ariaLabel="Show Compatibility Overview description"
                  testId="info-compatibility-overview"
                />
              </div>
            </div>
            <div className="h-[300px] flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                {isLoading ? "Loading chart..." : "No data available"}
              </div>
            </div>
          </CardContent>
        </Card>
      </TooltipProvider>
    );
  }

  // Define explicit colors that work with Recharts
  const CHART_COLORS = {
    compatible: "#22c55e", // Green for compatible
    needsReview: "#f59e0b", // Orange for needs review  
    incompatible: "#ef4444" // Red for incompatible
  };

  const chartData = [
    {
      name: "Compatible",
      value: stats.compatibleCount,
      color: CHART_COLORS.compatible
    },
    {
      name: "Needs Review",
      value: stats.needsReviewCount,
      color: CHART_COLORS.needsReview
    },
    {
      name: "Incompatible",
      value: stats.incompatibleCount,
      color: CHART_COLORS.incompatible
    }
  ];

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({
    cx, cy, midAngle, innerRadius, outerRadius, percent
  }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <TooltipProvider>
      <Card>
        <CardContent className="p-6">
          <div className="mb-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="text-primary h-5 w-5" />
              <h4 className="text-lg font-semibold text-foreground">
                Medication Compatibility Overview
              </h4>
              <InfoHint
                content="Visual breakdown of compatibility analysis results"
                ariaLabel="Show Compatibility Overview description"
                testId="info-compatibility-overview"
              />
            </div>
          </div>
        
        <div className="h-[300px]" data-testid="chart-compatibility">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: number) => [value.toLocaleString(), "Records"]}
              />
              <Legend 
                verticalAlign="bottom"
                height={36}
                formatter={(value, entry) => (
                  <span style={{ color: entry.color }}>
                    {value}: {chartData.find(d => d.name === value)?.value.toLocaleString()}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}
