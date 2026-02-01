import { useState } from 'react';
import { AgentSidebar } from '@/components/AgentSidebar';
import { AgentDetail } from '@/components/AgentDetail';
import { Sheet, SheetContent } from '@/components/ui/sheet';

export function AgentsPage() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <AgentSidebar className="hidden md:block" />

      {/* Mobile sidebar (drawer) */}
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="p-0 w-80">
          <AgentSidebar className="w-full border-r-0" onSelect={() => setMobileSidebarOpen(false)} />
        </SheetContent>
      </Sheet>

      <AgentDetail onOpenSidebar={() => setMobileSidebarOpen(true)} />
    </div>
  );
}
