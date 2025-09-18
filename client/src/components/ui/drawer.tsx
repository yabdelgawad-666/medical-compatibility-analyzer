import { X, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
  width?: string;
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12" data-testid="drawer-loading">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="ml-3 text-sm text-muted-foreground">Loading...</span>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="drawer-error">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h3 className="text-lg font-medium text-foreground mb-2">Something went wrong</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">{error}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} size="sm" data-testid="button-retry">
          Try Again
        </Button>
      )}
    </div>
  );
}

export default function Drawer({
  isOpen,
  onClose,
  title,
  children,
  isLoading = false,
  error = null,
  className,
  width = "40%"
}: DrawerProps) {
  // Handle ESC key to close drawer
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when drawer is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Handle overlay click to close drawer
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Focus trap management
  useEffect(() => {
    if (isOpen) {
      const focusableElements = document.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstFocusable = focusableElements[0] as HTMLElement;
      const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;

      const handleTabKey = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;

        if (e.shiftKey) {
          if (document.activeElement === firstFocusable) {
            lastFocusable?.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastFocusable) {
            firstFocusable?.focus();
            e.preventDefault();
          }
        }
      };

      document.addEventListener('keydown', handleTabKey);
      // Focus the close button when drawer opens
      setTimeout(() => {
        const closeButton = document.querySelector('[data-testid="button-close-drawer"]') as HTMLElement;
        closeButton?.focus();
      }, 100);

      return () => {
        document.removeEventListener('keydown', handleTabKey);
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
      data-testid="drawer-overlay-container"
    >
      {/* Overlay Background */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ease-in-out"
        onClick={handleOverlayClick}
        data-testid="drawer-overlay"
        aria-hidden="true"
      />

      {/* Drawer Container */}
      <div className="ml-auto relative">
        <div
          className={cn(
            "h-full bg-background border-l border-border shadow-2xl",
            "transform transition-transform duration-300 ease-in-out",
            "flex flex-col",
            // Responsive width
            "w-full sm:w-auto",
            className
          )}
          style={{
            width: window.innerWidth < 640 ? '100%' : width,
            minWidth: window.innerWidth < 640 ? '100%' : '400px',
            maxWidth: '90vw'
          }}
          data-testid="drawer-content"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border bg-card/50 flex-shrink-0">
            <div className="min-w-0 flex-1">
              <h2
                id="drawer-title"
                className="text-lg font-semibold text-foreground truncate pr-4"
                data-testid="drawer-title"
              >
                {title}
              </h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-muted-foreground hover:text-foreground flex-shrink-0"
              data-testid="button-close-drawer"
              aria-label="Close drawer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden">
            {error ? (
              <div className="p-6">
                <ErrorState error={error} />
              </div>
            ) : isLoading ? (
              <div className="p-6">
                <LoadingState />
              </div>
            ) : (
              <ScrollArea className="h-full" data-testid="drawer-scroll-area">
                <div className="p-6">
                  {children}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type { DrawerProps };