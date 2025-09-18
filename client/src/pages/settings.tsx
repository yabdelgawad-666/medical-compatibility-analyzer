import FdaApiStatus from "@/components/dashboard/fda-api-status";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Settings as SettingsIcon } from "lucide-react";

export default function Settings() {
  return (
    <div className="flex-1 h-screen overflow-auto">
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground flex items-center" data-testid="text-settings-title">
              <SettingsIcon className="mr-3 h-8 w-8 text-primary" />
              Settings
            </h1>
            <p className="text-muted-foreground mt-2">
              Configure your medical data analysis preferences and monitor system status
            </p>
          </div>

          {/* Settings Sections */}
          <div className="space-y-8">
            {/* API Status Section */}
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-4">
                API Status & Monitoring
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <FdaApiStatus />
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">API Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>Monitor your FDA API connectivity and usage limits to ensure uninterrupted medical data analysis.</p>
                    <p>• <strong>Daily Limits:</strong> 1,000 calls (without API key) or 120,000 calls (with API key)</p>
                    <p>• <strong>Rate Limits:</strong> 240 calls per minute maximum</p>
                    <p>• <strong>Usage Tracking:</strong> Real-time monitoring with 7-day history</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Future Settings Sections */}
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-4">
                User Preferences
              </h2>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Coming Soon</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Additional configuration options will be available in future updates.
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}