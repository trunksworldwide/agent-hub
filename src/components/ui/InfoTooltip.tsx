import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface InfoTooltipProps {
  text: string;
  className?: string;
}

export function InfoTooltip({ text, className }: InfoTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center justify-center cursor-help focus:outline-none',
            className
          )}
          aria-label="More information"
        >
          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground transition-colors" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
