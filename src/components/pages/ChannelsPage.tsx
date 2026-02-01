import { useEffect, useState } from 'react';
import { getChannels, type Channel } from '@/lib/api';
import { cn } from '@/lib/utils';

export function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    getChannels().then(setChannels);
  }, []);

  const getChannelIcon = (type: string) => {
    const icons: Record<string, string> = {
      messaging: '💬',
      email: '📧',
    };
    return icons[type] || '📡';
  };

  return (
    <div className="flex-1 p-6 overflow-auto scrollbar-thin">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Channels</h1>
          <p className="text-muted-foreground">
            Configured messaging and communication channels.
          </p>
        </div>

        <div className="grid gap-4">
          {channels.map((channel) => (
            <div
              key={channel.id}
              className="p-4 rounded-lg border border-border bg-card"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center text-2xl">
                    {getChannelIcon(channel.type)}
                  </div>
                  <div>
                    <h3 className="font-medium text-lg">{channel.name}</h3>
                    <p className="text-sm text-muted-foreground capitalize">{channel.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right text-sm">
                    <span className={cn(
                      "badge-status",
                      channel.status === 'connected' ? 'badge-online' : 'badge-offline'
                    )}>
                      {channel.status}
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">
                      Last activity: {channel.lastActivity}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 p-4 rounded-lg border border-dashed border-border bg-muted/20 text-center">
          <p className="text-muted-foreground">
            Channel management coming soon. For now, channels are configured via the control API.
          </p>
        </div>
      </div>
    </div>
  );
}
