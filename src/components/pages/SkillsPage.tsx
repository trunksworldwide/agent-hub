import { useEffect, useState, useMemo } from 'react';
import { Search, Plus, WifiOff, CheckCircle, AlertTriangle, XCircle, MinusCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getSkills, getSkillRequests, type Skill } from '@/lib/api';
import { useClawdOffice } from '@/lib/store';
import { formatDistanceToNow } from 'date-fns';
import { SkillDetailDrawer } from '@/components/settings/SkillDetailDrawer';
import { AddSkillDialog } from '@/components/settings/AddSkillDialog';

type SkillStatusKey = 'ready' | 'needs_setup' | 'blocked' | 'disabled';

function getSkillStatus(skill: Skill): { key: SkillStatusKey; label: string; variant: 'default' | 'outline' | 'destructive' | 'secondary'; icon: typeof CheckCircle } {
  if (skill.blockedByAllowlist) return { key: 'blocked', label: 'Blocked', variant: 'destructive', icon: XCircle };
  if (skill.disabled) return { key: 'disabled', label: 'Disabled', variant: 'secondary', icon: MinusCircle };
  if (skill.eligible === false) return { key: 'needs_setup', label: 'Needs setup', variant: 'outline', icon: AlertTriangle };
  return { key: 'ready', label: 'Ready', variant: 'default', icon: CheckCircle };
}

const STATUS_ORDER: Record<SkillStatusKey, number> = { ready: 0, needs_setup: 1, blocked: 2, disabled: 3 };

function relativeTime(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

export function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<Array<{ id: string; identifier: string; status: string; createdAt: string }>>([]);
  const { controlApiUrl } = useClawdOffice();

  const loadSkills = () => {
    setLoading(true);
    Promise.all([getSkills(), getSkillRequests()])
      .then(([s, r]) => { setSkills(s); setPendingRequests(r.filter(req => req.status === 'pending' || req.status === 'running')); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadSkills(); }, [controlApiUrl]);

  const sortedSkills = useMemo(() => {
    const filtered = skills.filter(skill =>
      skill.name.toLowerCase().includes(search.toLowerCase()) ||
      skill.description.toLowerCase().includes(search.toLowerCase())
    );
    return filtered.sort((a, b) => {
      const sa = STATUS_ORDER[getSkillStatus(a).key];
      const sb = STATUS_ORDER[getSkillStatus(b).key];
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name);
    });
  }, [skills, search]);

  const handleView = (skill: Skill) => {
    setSelectedSkill(skill);
    setDrawerOpen(true);
  };

  if (!loading && skills.length === 0 && pendingRequests.length === 0) {
    return (
      <div className="flex-1 p-6 overflow-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto w-full">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Skills</h1>
              <p className="text-muted-foreground">Manage capabilities and discover new ones.</p>
            </div>
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Add Skill
            </Button>
          </div>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <WifiOff className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No skills data available</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Connect to your Mac mini via the Control API to view installed skills.
              Go to <strong>System → Connectivity</strong> to configure the connection.
            </p>
          </div>
          <AddSkillDialog open={addOpen} onOpenChange={setAddOpen} onInstalled={loadSkills} />
        </div>
      </div>
    );
  }

    return (
      <div className="flex-1 p-6 overflow-auto scrollbar-thin">
        <div className="max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Skills</h1>
            <p className="text-muted-foreground">Manage capabilities and discover new ones.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search skills..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
            <Button onClick={() => setAddOpen(true)} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" /> Add Skill
            </Button>
          </div>
        </div>

        {/* Pending requests */}
        {pendingRequests.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Pending ({pendingRequests.length})
            </h2>
            <div className="grid gap-3">
              {pendingRequests.map(req => (
                <div key={req.id} className="p-4 rounded-lg border border-dashed border-border bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">⏳</span>
                      <div>
                        <h3 className="font-medium font-mono text-sm">{req.identifier}</h3>
                        <p className="text-xs text-muted-foreground">Requested {relativeTime(req.createdAt)}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="capitalize">{req.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills list */}
        {loading ? (
          <div className="grid gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="p-4 rounded-lg border border-border bg-card animate-pulse h-20" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3">
            {sortedSkills.map((skill) => {
              const status = getSkillStatus(skill);
              const StatusIcon = status.icon;
              return (
                <div
                  key={skill.id}
                  className="p-4 rounded-lg border border-border bg-card hover:bg-card/80 transition-colors cursor-pointer group"
                  onClick={() => handleView(skill)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-lg shrink-0">
                        {skill.emoji || '🧩'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium truncate">{skill.name}</h3>
                          {skill.source && (
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {skill.source}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {skill.description || 'No description'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant={status.variant} className="gap-1 hidden sm:inline-flex">
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                      <div className="text-right text-xs text-muted-foreground hidden md:block">
                        <div className="font-mono">v{skill.version}</div>
                        {skill.lastUpdated && <div>{relativeTime(skill.lastUpdated)}</div>}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleView(skill); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        View
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <SkillDetailDrawer skill={selectedSkill} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <AddSkillDialog open={addOpen} onOpenChange={setAddOpen} onInstalled={loadSkills} />
    </div>
  );
}
