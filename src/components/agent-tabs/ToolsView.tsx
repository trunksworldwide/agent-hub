import { useEffect, useState } from 'react';
import { getTools, type Tool } from '@/lib/api';
import { cn } from '@/lib/utils';

export function ToolsView() {
  const [tools, setTools] = useState<Tool[]>([]);

  useEffect(() => {
    getTools().then(setTools);
  }, []);

  return (
    <div className="p-4 overflow-auto scrollbar-thin h-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Available Tools</h2>
        <p className="text-sm text-muted-foreground">
          Tools the agent can use to interact with the world.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((tool) => (
          <div
            key={tool.id}
            className={cn(
              "p-4 rounded-lg border border-border bg-card transition-colors",
              tool.configured ? "opacity-100" : "opacity-60"
            )}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{tool.icon}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{tool.name}</h3>
                  <span className={cn(
                    "badge-status",
                    tool.configured ? "badge-online" : "badge-offline"
                  )}>
                    {tool.configured ? 'Configured' : 'Not configured'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {tool.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
