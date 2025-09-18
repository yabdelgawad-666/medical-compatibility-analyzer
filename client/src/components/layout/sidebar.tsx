import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  ChartLine, 
  Upload, 
  Database, 
  AlertTriangle, 
  BarChart3, 
  Settings,
  Stethoscope
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: ChartLine },
  { name: "Upload Data", href: "/upload", icon: Upload },
  { name: "ICD-10 Database", href: "/icd10", icon: Database },
  { name: "Mismatches", href: "/mismatches", icon: AlertTriangle },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="w-64 bg-card border-r border-border shadow-sm">
      {/* Logo/Header */}
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-bold text-foreground flex items-center" data-testid="text-app-title">
          <ChartLine className="text-primary mr-3 h-6 w-6" />
          MedAnalyzer
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Medical Data Analysis Portal</p>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-2">
        {navigation.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          
          return (
            <Link 
              key={item.name} 
              href={item.href}
              data-testid={`link-${item.name.toLowerCase().replace(' ', '-')}`}
            >
              <div
                className={cn(
                  "sidebar-item flex items-center px-4 py-3 rounded-md transition-colors",
                  isActive
                    ? "text-primary bg-accent"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="mr-3 h-4 w-4" />
                {item.name}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="absolute bottom-4 left-4 right-4">
        <div className="flex items-center text-xs text-muted-foreground">
          <Stethoscope className="mr-2 h-3 w-3" />
          Healthcare Compliance Ready
        </div>
      </div>
    </div>
  );
}
