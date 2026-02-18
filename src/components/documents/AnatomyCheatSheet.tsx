import { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

const anatomyItems = [
  {
    name: 'SOUL.md',
    icon: '✨',
    short: 'Personality & boundaries',
    tooltip: "Defines the agent's personality, behavior rules, and boundaries. Think of it as the agent's character sheet.",
    mapsTo: 'Agent → Soul tab',
  },
  {
    name: 'IDENTITY.md',
    icon: '🪪',
    short: 'Name, role, avatar',
    tooltip: "Short identity facts that should not drift — the agent's name, role label, and avatar.",
    mapsTo: 'Agent → Overview tab',
  },
  {
    name: 'USER.md',
    icon: '👤',
    short: 'Operator preferences',
    tooltip: 'Who the agent is helping: timezone, formatting preferences, communication style, and permissions.',
    mapsTo: 'Agent → User tab',
  },
  {
    name: 'AGENTS.md',
    icon: '📖',
    short: 'Operating rules handbook',
    tooltip: "The company handbook — universal operating instructions like 'check TOOLS before saying you can't', where to store outcomes, and what 'done' looks like.",
    mapsTo: 'Agent → Handbook tab',
  },
  {
    name: 'TOOLS.md',
    icon: '🔧',
    short: 'Environment & API notes',
    tooltip: 'Environment-specific setup details: which apps/APIs are available, device names, where logins live, preferred voices.',
    mapsTo: 'Agent → Tools tab',
  },
  {
    name: 'MEMORY.md',
    icon: '🧠',
    short: 'Decisions & lessons learned',
    tooltip: 'Durable long-term memory: past decisions, lessons learned, where things were saved, and repeatable runbooks.',
    mapsTo: 'Agent → Memory tab',
  },
  {
    name: 'SKILLS.md',
    icon: '🎯',
    short: 'How-to playbooks',
    tooltip: 'A human-friendly guide for each capability — browser ops, file uploads, clip pipelines, etc.',
    mapsTo: 'Agent → Skills tab',
  },
  {
    name: 'HEARTBEAT.md',
    icon: '💓',
    short: 'Periodic wake instructions',
    tooltip: 'What the agent should do when nudged: lightweight recurring checks like inbox scanning, blocker reviews, and daily digests.',
    mapsTo: 'Schedule page',
  },
  {
    name: 'Cron jobs',
    icon: '⏰',
    short: 'Scheduled wake-ups',
    tooltip: "Scheduled 'wake up and do X at time Y' — recurring reminders and automated audits or digests.",
    mapsTo: 'Schedule page',
  },
];

export function AnatomyCheatSheet() {
  const [open, setOpen] = useState(false);

  return (
    <Card className="mb-6">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              OpenClaw Anatomy (Cheat Sheet)
            </CardTitle>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
          </div>
          {!open && (
            <p className="text-xs text-muted-foreground mt-1">
              Quick reference for what each agent file does and where to find it.
            </p>
          )}
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="space-y-1">
              {anatomyItems.map((item) => (
                <div
                  key={item.name}
                  className="flex items-start gap-3 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <span className="text-base shrink-0 mt-0.5">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">{item.name}</span>
                      <InfoTooltip text={item.tooltip} />
                    </div>
                    <p className="text-xs text-muted-foreground">{item.short}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 mt-1 bg-muted/60 px-1.5 py-0.5 rounded">
                    {item.mapsTo}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3 px-3">
              <strong>Rules of thumb:</strong> SOUL/USER = how to behave · AGENTS/TOOLS/SKILLS = how to operate · MEMORY = what we learned · Heartbeat/Cron = when to wake up
            </p>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
