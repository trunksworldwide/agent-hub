import { type Skill } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { CheckCircle, AlertTriangle, XCircle, MinusCircle, Copy, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { useRef } from 'react';

interface SkillDetailDrawerProps {
  skill: Skill | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getSkillStatus(skill: Skill) {
  if (skill.blockedByAllowlist) return { label: 'Blocked', variant: 'destructive' as const, icon: XCircle };
  if (skill.disabled) return { label: 'Disabled', variant: 'secondary' as const, icon: MinusCircle };
  if (skill.eligible === false) return { label: 'Needs setup', variant: 'outline' as const, icon: AlertTriangle };
  return { label: 'Ready', variant: 'default' as const, icon: CheckCircle };
}

function CopyBlock({ value, label }: { value: string; label?: string }) {
  const copy = () => {
    navigator.clipboard.writeText(value);
    toast({ description: 'Copied to clipboard' });
  };
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-sm">
      <code className="flex-1 break-all">{value}</code>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copy} title="Copy">
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function SkillDetailDrawer({ skill, open, onOpenChange }: SkillDetailDrawerProps) {
  const readinessRef = useRef<HTMLDivElement>(null);

  if (!skill) return null;

  const status = getSkillStatus(skill);
  const StatusIcon = status.icon;
  const hasMissing = skill.missing &&
    ((skill.missing.bins?.length ?? 0) > 0 ||
     (skill.missing.env?.length ?? 0) > 0 ||
     (skill.missing.config?.length ?? 0) > 0 ||
     (skill.missing.os?.length ?? 0) > 0);

  const relativeTime = skill.lastUpdated
    ? (() => { try { return formatDistanceToNow(new Date(skill.lastUpdated), { addSuffix: true }); } catch { return skill.lastUpdated; } })()
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{skill.emoji || '🧩'}</span>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg">{skill.name}</SheetTitle>
              <SheetDescription className="sr-only">Skill details for {skill.name}</SheetDescription>
            </div>
            <Badge variant={status.variant} className="gap-1 shrink-0">
              <StatusIcon className="h-3 w-3" />
              {status.label}
            </Badge>
          </div>
        </SheetHeader>

        <div className="space-y-6">
          {/* Description */}
          <section>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Description</h3>
            <p className="text-sm leading-relaxed">
              {skill.description || 'No description available.'}
            </p>
          </section>

          {/* Readiness */}
          {hasMissing && (
            <section ref={readinessRef}>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Missing Requirements</h3>
              <div className="space-y-4">
                {(skill.missing?.bins?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Binaries
                    </h4>
                    <div className="space-y-2">
                      {skill.missing!.bins!.map(bin => (
                        <CopyBlock key={bin} value={`brew install ${bin}`} />
                      ))}
                    </div>
                  </div>
                )}

                {(skill.missing?.env?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Environment Variables
                    </h4>
                    <div className="space-y-2">
                      {skill.missing!.env!.map(envVar => (
                        <CopyBlock key={envVar} value={`export ${envVar}=your_value_here`} />
                      ))}
                    </div>
                  </div>
                )}

                {(skill.missing?.config?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Configuration
                    </h4>
                    <ul className="space-y-1">
                      {skill.missing!.config!.map(cfg => (
                        <li key={cfg} className="text-sm text-muted-foreground flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/70 shrink-0" />
                          {cfg}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(skill.missing?.os?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      OS Compatibility
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Requires: {skill.missing!.os!.join(', ')}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Blocked notice */}
          {skill.blockedByAllowlist && (
            <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">
                This skill is blocked by the allowlist configuration. Update your OpenClaw config to enable it.
              </p>
            </section>
          )}

          {/* Info */}
          <section>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Info</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Source</span>
                <p className="font-medium capitalize">{skill.source || 'unknown'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Version</span>
                <p className="font-mono font-medium">{skill.version || '—'}</p>
              </div>
              {relativeTime && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Last updated</span>
                  <p className="font-medium">{relativeTime}</p>
                </div>
              )}
            </div>
          </section>

          {/* Homepage link */}
          {skill.homepage && (
            <a
              href={skill.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View documentation
            </a>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {hasMissing && (
            <Button
              variant="secondary"
              onClick={() => readinessRef.current?.scrollIntoView({ behavior: 'smooth' })}
            >
              Setup help
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
