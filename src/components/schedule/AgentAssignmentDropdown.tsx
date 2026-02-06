import { useState } from 'react';
import { Check, ChevronsUpDown, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Agent } from '@/lib/api';

interface AgentAssignmentDropdownProps {
  agents: Agent[];
  value: string | null | undefined;
  onChange: (agentKey: string | null) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

export function AgentAssignmentDropdown({
  agents,
  value,
  onChange,
  disabled,
  compact = false,
  className,
}: AgentAssignmentDropdownProps) {
  const [open, setOpen] = useState(false);

  // Find the selected agent
  const selectedAgent = agents.find((a) => a.id === value);

  const handleSelect = (agentId: string) => {
    onChange(agentId === '' ? null : agentId);
    setOpen(false);
  };

  if (compact) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'h-auto py-0.5 px-1.5 text-xs gap-1.5 font-normal',
              selectedAgent ? 'text-foreground' : 'text-muted-foreground',
              className
            )}
          >
            {selectedAgent ? (
              <>
                <span className="text-sm">{selectedAgent.avatar || '🤖'}</span>
                <span className="max-w-[100px] truncate">{selectedAgent.name}</span>
              </>
            ) : (
              <>
                <User className="w-3 h-3" />
                <span className="text-amber-600 dark:text-amber-400">Needs assignment</span>
              </>
            )}
            <ChevronsUpDown className="w-2.5 h-2.5 opacity-40" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0 z-50" align="start">
          <Command>
            <CommandInput placeholder="Search agents..." className="h-9" />
            <CommandList>
              <CommandEmpty>No agents found.</CommandEmpty>
              <CommandGroup>
                <CommandItem value="" onSelect={() => handleSelect('')}>
                  <User className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Unassigned</span>
                  {!value && <Check className="ml-auto h-4 w-4" />}
                </CommandItem>
                {agents.map((agent) => (
                  <CommandItem
                    key={agent.id}
                    value={agent.id}
                    onSelect={() => handleSelect(agent.id)}
                  >
                    <span className="mr-2">{agent.avatar || '🤖'}</span>
                    {agent.name}
                    {value === agent.id && <Check className="ml-auto h-4 w-4" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between', className)}
        >
          {selectedAgent ? (
            <span className="flex items-center gap-2">
              <span>{selectedAgent.avatar || '🤖'}</span>
              <span>{selectedAgent.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Select an agent...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0">
        <Command>
          <CommandInput placeholder="Search agents..." className="h-9" />
          <CommandList>
            <CommandEmpty>No agents found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="" onSelect={() => handleSelect('')}>
                <User className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">No specific agent</span>
                {!value && <Check className="ml-auto h-4 w-4" />}
              </CommandItem>
              {agents.map((agent) => (
                <CommandItem
                  key={agent.id}
                  value={agent.id}
                  onSelect={() => handleSelect(agent.id)}
                >
                  <span className="mr-2">{agent.avatar || '🤖'}</span>
                  <span>{agent.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{agent.role}</span>
                  {value === agent.id && <Check className="ml-auto h-4 w-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
