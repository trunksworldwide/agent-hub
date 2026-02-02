import { X, AlertTriangle, Clock, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import type { Agent } from '@/lib/api';

interface AgentProfilePanelProps {
  agent: Agent;
  onClose: () => void;
}

// Mock data for the profile - these will be connected to real data later
const mockStatusReason = "Onboarded. Health monitoring framework ready. Coordinating with Fury on churn analysis.";
const mockAbout = "I am the Primary Agent. Guardian of the workspace. I handle task coordination, communication routing, and system orchestration. My tools: Slack monitoring, email handling, calendar management. My mission: Keep everything running smoothly.";
const mockSkills = ['coordination', 'communication', 'scheduling', 'monitoring', 'automation', 'reporting'];

export function AgentProfilePanel({ agent, onClose }: AgentProfilePanelProps) {
  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'online':
      case 'running':
        return 'bg-green-500';
      case 'idle':
        return 'bg-amber-500';
      case 'offline':
        return 'bg-muted-foreground';
    }
  };

  const getStatusLabel = (status: Agent['status']) => {
    switch (status) {
      case 'running':
        return 'WORKING';
      case 'online':
        return 'ONLINE';
      case 'idle':
        return 'IDLE';
      case 'offline':
        return 'OFFLINE';
    }
  };

  return (
    <div className="w-80 lg:w-96 border-l border-border bg-card flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary" />
          AGENT PROFILE
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Agent Identity */}
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center text-3xl shrink-0">
              {agent.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-semibold">{agent.name}</h3>
              <Badge variant="outline" className="mt-1 text-xs font-medium">
                {agent.role}
              </Badge>
            </div>
          </div>

          {/* Status Badge */}
          <div>
            <Badge 
              variant="outline" 
              className={cn(
                "gap-2 px-3 py-1.5 text-sm font-medium border-0",
                agent.status === 'running' || agent.status === 'online' 
                  ? "bg-green-500/10 text-green-500" 
                  : agent.status === 'idle'
                  ? "bg-amber-500/10 text-amber-500"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <span className={cn("w-2 h-2 rounded-full", getStatusColor(agent.status))} />
              {getStatusLabel(agent.status)}
            </Badge>
          </div>

          {/* Status Reason */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              STATUS REASON:
            </h4>
            <p className="text-sm text-foreground leading-relaxed">
              {mockStatusReason}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Since about 1 hour ago
            </p>
          </div>

          {/* About */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              ABOUT
            </h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {mockAbout}
            </p>
          </div>

          {/* Skills */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              SKILLS
            </h4>
            <div className="flex flex-wrap gap-2">
              {mockSkills.map((skill) => (
                <Badge 
                  key={skill} 
                  variant="secondary" 
                  className="text-xs font-normal bg-muted hover:bg-muted"
                >
                  {skill}
                </Badge>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="attention" className="w-full">
            <TabsList className="w-full bg-muted/50">
              <TabsTrigger value="attention" className="flex-1 gap-1.5 text-xs">
                <AlertTriangle className="w-3 h-3" />
                Attention
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">2</Badge>
              </TabsTrigger>
              <TabsTrigger value="timeline" className="flex-1 gap-1.5 text-xs">
                <Clock className="w-3 h-3" />
                Timeline
              </TabsTrigger>
              <TabsTrigger value="messages" className="flex-1 gap-1.5 text-xs">
                <MessageSquare className="w-3 h-3" />
                Messages
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="attention" className="mt-4">
              <div className="text-sm text-muted-foreground text-center py-6">
                Tasks & mentions needing {agent.name}'s attention
              </div>
            </TabsContent>
            
            <TabsContent value="timeline" className="mt-4">
              <div className="text-sm text-muted-foreground text-center py-6">
                Recent activity timeline
              </div>
            </TabsContent>
            
            <TabsContent value="messages" className="mt-4">
              <div className="text-sm text-muted-foreground text-center py-6">
                Direct messages with {agent.name}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      {/* Send Message */}
      <div className="p-4 border-t border-border shrink-0 space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          SEND MESSAGE TO {agent.name.toUpperCase()}
        </h4>
        <Input 
          placeholder={`Message ${agent.name}... (@ to mention)`}
          className="bg-muted/50"
        />
      </div>
    </div>
  );
}
