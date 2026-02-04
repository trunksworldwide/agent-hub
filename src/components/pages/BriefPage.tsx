import { useEffect, useState } from 'react';
import { RefreshCw, Package, AlertTriangle, Inbox, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getActivity, getAgents, getTasks, type ActivityItem, type Agent, type Task } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useClawdOffice } from '@/lib/store';

export function BriefPage() {
  const { selectedProjectId } = useClawdOffice();
  const [isLoading, setIsLoading] = useState(true);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const refresh = async () => {
    setIsLoading(true);
    try {
      const [act, ag, t] = await Promise.all([
        getActivity(100),
        getAgents(),
        getTasks(),
      ]);
      setActivities(act);
      setAgents(ag);
      setTasks(t);
    } catch (e) {
      console.error('Failed to load brief data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [selectedProjectId]);

  // What shipped since yesterday (build_update activities in last 24h)
  const yesterday = Date.now() - 24 * 60 * 60 * 1000;
  const shipped = activities.filter((a) => {
    if (a.type !== 'build_update') return false;
    const ts = Date.parse(a.date);
    return !Number.isNaN(ts) && ts > yesterday;
  });

  // What's blocked (agents with blocked state OR tasks in blocked column)
  const blockedAgents = agents.filter((a) => a.statusState === 'blocked');
  const blockedTasks = tasks.filter((t) => t.status === 'blocked');

  // What needs attention (tasks in inbox or assigned)
  const needsAttention = tasks.filter(
    (t) => t.status === 'inbox' || t.status === 'assigned'
  );

  // Who's working now
  const workingAgents = agents.filter((a) => a.statusState === 'working');

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-US', {
      hour12: true,
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Daily Brief</h1>
            <p className="text-muted-foreground">
              Auto-generated summary of today's operations
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {/* Grid of summary cards */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Shipped */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="w-4 h-4 text-green-500" />
                What Shipped (24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {shipped.length === 0 ? (
                <p className="text-sm text-muted-foreground">No updates shipped recently.</p>
              ) : (
                <ul className="space-y-2">
                  {shipped.slice(0, 5).map((a) => (
                    <li key={a.hash} className="text-sm">
                      <div className="font-medium truncate">{a.message}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.authorLabel || a.author} · {formatTime(a.date)}
                      </div>
                    </li>
                  ))}
                  {shipped.length > 5 && (
                    <li className="text-xs text-muted-foreground">
                      +{shipped.length - 5} more
                    </li>
                  )}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Blocked */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                What's Blocked
              </CardTitle>
            </CardHeader>
            <CardContent>
              {blockedAgents.length === 0 && blockedTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing blocked right now. 🎉</p>
              ) : (
                <div className="space-y-3">
                  {blockedAgents.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Agents</div>
                      <ul className="space-y-1">
                        {blockedAgents.map((a) => (
                          <li key={a.id} className="text-sm flex items-center gap-2">
                            <span>{a.avatar}</span>
                            <span>{a.name}</span>
                            {a.statusNote && (
                              <span className="text-xs text-muted-foreground truncate">
                                – {a.statusNote}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {blockedTasks.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">Tasks</div>
                      <ul className="space-y-1">
                        {blockedTasks.slice(0, 3).map((t) => (
                          <li key={t.id} className="text-sm truncate">{t.title}</li>
                        ))}
                        {blockedTasks.length > 3 && (
                          <li className="text-xs text-muted-foreground">
                            +{blockedTasks.length - 3} more
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Needs Attention */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Inbox className="w-4 h-4 text-yellow-500" />
                Needs Attention
              </CardTitle>
            </CardHeader>
            <CardContent>
              {needsAttention.length === 0 ? (
                <p className="text-sm text-muted-foreground">All tasks are in progress or done.</p>
              ) : (
                <ul className="space-y-2">
                  {needsAttention.slice(0, 5).map((t) => (
                    <li key={t.id} className="text-sm">
                      <div className="font-medium truncate">{t.title}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {t.status.replace('_', ' ')}
                      </div>
                    </li>
                  ))}
                  {needsAttention.length > 5 && (
                    <li className="text-xs text-muted-foreground">
                      +{needsAttention.length - 5} more in queue
                    </li>
                  )}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Team Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="w-4 h-4 text-blue-500" />
                Team Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {agents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No agents configured.</p>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="font-medium">{workingAgents.length}</span>
                    <span className="text-muted-foreground"> currently working</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {agents.slice(0, 8).map((a) => (
                      <div
                        key={a.id}
                        className={cn(
                          'flex items-center gap-1 px-2 py-1 rounded-full text-xs',
                          a.statusState === 'working' && 'bg-green-500/20 text-green-700',
                          a.statusState === 'idle' && 'bg-muted text-muted-foreground',
                          a.statusState === 'blocked' && 'bg-red-500/20 text-red-700',
                          !a.statusState && 'bg-muted text-muted-foreground'
                        )}
                      >
                        <span>{a.avatar}</span>
                        <span>{a.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
