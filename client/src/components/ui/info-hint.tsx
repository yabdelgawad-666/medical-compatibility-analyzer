import { useState } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";

interface InfoHintProps {
  content: string;
  ariaLabel: string;
  testId: string;
  className?: string;
}

export function InfoHint({ content, ariaLabel, testId, className = "" }: InfoHintProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const isMobile = useIsMobile();

  const buttonClasses = `w-4 h-4 bg-muted/50 rounded-full flex items-center justify-center cursor-help hover:bg-muted/70 focus:bg-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1 transition-colors ${className}`;

  // On mobile/touch devices, use Popover for click interactions
  if (isMobile) {
    return (
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button 
            type="button"
            className={buttonClasses}
            aria-label={ariaLabel}
            data-testid={testId}
            onClick={() => setPopoverOpen(!popoverOpen)}
          >
            <Info className="h-3 w-3 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3 text-sm">
          <p>{content}</p>
        </PopoverContent>
      </Popover>
    );
  }

  // On desktop, use Tooltip for hover/focus interactions
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button 
          type="button"
          className={buttonClasses}
          aria-label={ariaLabel}
          data-testid={testId}
        >
          <Info className="h-3 w-3 text-muted-foreground" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}