import { useState, useEffect } from 'react';
import { ChevronDown, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
  type ScheduleConfig,
  type FrequencyType,
  SCHEDULE_PRESETS,
  DAY_OPTIONS,
  COMMON_TIMEZONES,
  parseScheduleToConfig,
  configToScheduleExpression,
  formatScheduleDisplay,
} from '@/lib/schedule-utils';

interface ScheduleEditorProps {
  scheduleKind?: string | null;
  scheduleExpr?: string | null;
  tz?: string | null;
  onSave: (result: { kind: 'cron' | 'every'; expr: string; tz?: string }) => void;
  onCancel?: () => void;
  disabled?: boolean;
}

export function ScheduleEditor({
  scheduleKind,
  scheduleExpr,
  tz,
  onSave,
  onCancel,
  disabled,
}: ScheduleEditorProps) {
  const initialConfig = parseScheduleToConfig(scheduleKind, scheduleExpr, tz);
  
  const [frequency, setFrequency] = useState<FrequencyType>(initialConfig.frequency);
  const [time, setTime] = useState(initialConfig.time || '09:00');
  const [days, setDays] = useState<string[]>(initialConfig.days || ['mon']);
  const [customCron, setCustomCron] = useState(initialConfig.cronExpr || '');
  const [timezone, setTimezone] = useState(initialConfig.tz || 'America/New_York');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const preset = SCHEDULE_PRESETS.find(p => p.id === frequency);
  const showTimePicker = preset?.requiresTime || false;
  const showDayPicker = preset?.requiresDays || false;
  const showCustomInput = preset?.isCustom || false;

  // Build current expression for preview
  const currentConfig: ScheduleConfig = {
    frequency,
    time: showTimePicker ? time : undefined,
    days: showDayPicker ? days : undefined,
    cronExpr: showCustomInput ? customCron : undefined,
    tz: timezone,
  };
  const currentExpr = configToScheduleExpression(currentConfig);

  const handleSave = () => {
    onSave(currentExpr);
  };

  const handleDayToggle = (dayId: string) => {
    setDays(prev => {
      if (prev.includes(dayId)) {
        // Don't allow removing all days
        if (prev.length === 1) return prev;
        return prev.filter(d => d !== dayId);
      }
      return [...prev, dayId];
    });
  };

  return (
    <div className="space-y-4">
      {/* Frequency selector */}
      <div className="space-y-2">
        <Label>Runs...</Label>
        <Select value={frequency} onValueChange={(v) => setFrequency(v as FrequencyType)} disabled={disabled}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCHEDULE_PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Time picker */}
      {showTimePicker && (
        <div className="space-y-2">
          <Label>At time</Label>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-32"
              disabled={disabled}
            />
          </div>
        </div>
      )}

      {/* Day picker */}
      {showDayPicker && (
        <div className="space-y-2">
          <Label>On days</Label>
          <div className="flex flex-wrap gap-2">
            {DAY_OPTIONS.map((day) => (
              <label
                key={day.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer transition-colors",
                  days.includes(day.id) 
                    ? "bg-primary text-primary-foreground border-primary" 
                    : "bg-muted/50 border-border hover:bg-muted"
                )}
              >
                <Checkbox
                  checked={days.includes(day.id)}
                  onCheckedChange={() => handleDayToggle(day.id)}
                  className="sr-only"
                  disabled={disabled}
                />
                <span className="text-sm">{day.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Custom cron input */}
      {showCustomInput && (
        <div className="space-y-2">
          <Label>Cron expression</Label>
          <Input
            value={customCron}
            onChange={(e) => setCustomCron(e.target.value)}
            placeholder="0 9 * * *"
            className="font-mono"
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            Format: minute hour day-of-month month day-of-week
          </p>
        </div>
      )}

      {/* Timezone */}
      <div className="space-y-2">
        <Label>Timezone</Label>
        <Select value={timezone} onValueChange={setTimezone} disabled={disabled}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMMON_TIMEZONES.map((tz) => (
              <SelectItem key={tz.id} value={tz.id}>
                {tz.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Advanced section */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
            <ChevronDown className={cn("w-4 h-4 transition-transform", showAdvanced && "rotate-180")} />
            Advanced
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="p-3 rounded-md bg-muted/50 font-mono text-sm">
            <div className="text-xs text-muted-foreground mb-1">Generated expression:</div>
            <code>{currentExpr.kind}: {currentExpr.expr}</code>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Preview */}
      <div className="p-3 rounded-md bg-muted/30 border border-border">
        <div className="text-xs text-muted-foreground mb-1">Preview:</div>
        <div className="text-sm font-medium">
          {formatScheduleDisplay(currentExpr.kind, currentExpr.expr, timezone, false)}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button variant="outline" size="sm" onClick={onCancel} disabled={disabled}>
            Cancel
          </Button>
        )}
        <Button size="sm" onClick={handleSave} disabled={disabled}>
          Apply
        </Button>
      </div>
    </div>
  );
}

// Inline popover variant for quick editing in job rows
interface InlineScheduleEditorProps {
  scheduleKind?: string | null;
  scheduleExpr?: string | null;
  tz?: string | null;
  onSave: (result: { kind: 'cron' | 'every'; expr: string; tz?: string }) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

export function InlineScheduleEditor({
  scheduleKind,
  scheduleExpr,
  tz,
  onSave,
  disabled,
  children,
}: InlineScheduleEditorProps) {
  const [open, setOpen] = useState(false);

  const handleSave = (result: { kind: 'cron' | 'every'; expr: string; tz?: string }) => {
    onSave(result);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <ScheduleEditor
          scheduleKind={scheduleKind}
          scheduleExpr={scheduleExpr}
          tz={tz}
          onSave={handleSave}
          onCancel={() => setOpen(false)}
          disabled={disabled}
        />
      </PopoverContent>
    </Popover>
  );
}
