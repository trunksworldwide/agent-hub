import { useEffect, useState } from 'react';
import { MessageSquare, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSessions, type Session } from '@/lib/api';
import { useClawdOffice } from '@/lib/store';
import { cn } from '@/lib/utils';

export function SessionsView() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const { selectedAgentId } = useClawdOffice();

  useEffect(() => {
    if (selectedAgentId) {
      getSessions(selectedAgentId).then(setSessions);
    }
  }, [selectedAgentId]);

  const getStatusBadge = (status: Session['status']) => {
    const styles = {
      active: 'badge-running',
      completed: 'badge-online',
      error: 'badge-offline',
    };
    return styles[status];
  };

  return (
    <div className="p-4 overflow-auto scrollbar-thin h-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Sessions</h2>
        <p className="text-sm text-muted-foreground">
          Active and recent agent sessions.
        </p>
      </div>

      <div className="space-y-3">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="p-4 rounded-lg border border-border bg-card hover:bg-card/80 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <MessageSquare className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{session.label}</h4>
                    <span className={cn("badge-status", getStatusBadge(session.status))}>
                      {session.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {session.lastMessage}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Started {session.startedAt}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="gap-2">
                <ExternalLink className="w-4 h-4" />
                View
              </Button>
            </div>
          </div>
        ))}

        {sessions.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No sessions found
          </div>
        )}
      </div>
    </div>
  );
}
