import { Outlet } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClawdOffice } from '@/lib/store';

export function AppShell() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const { selectedProjectId, initControlApiUrl } = useClawdOffice();

  // On mount, hydrate control API URL from Supabase if localStorage is empty
  useEffect(() => {
    initControlApiUrl(selectedProjectId);
  }, [selectedProjectId, initControlApiUrl]);

  return (
    <SidebarProvider>
      <div className="h-screen flex w-full bg-background overflow-hidden">
        {/* Desktop sidebar */}
        {!isMobile && (
          <AppSidebar className="hidden md:flex shrink-0" />
        )}

        {/* Mobile sidebar (drawer) */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="p-0 w-64">
            <AppSidebar 
              className="w-full border-r-0" 
              onNavigate={() => setMobileMenuOpen(false)} 
            />
          </SheetContent>
        </Sheet>

        {/* Main content */}
        <main className="flex-1 overflow-auto flex flex-col">
          {/* Mobile header with menu trigger */}
          {isMobile && (
            <div className="h-14 border-b border-border flex items-center px-4 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </Button>
            </div>
          )}
          <div className="flex-1 overflow-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
