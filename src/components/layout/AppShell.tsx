import { Outlet } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { AppTopBar } from './AppTopBar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

export function AppShell() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex flex-col w-full bg-background">
        <AppTopBar onMenuClick={() => setMobileMenuOpen(true)} />
        
        <div className="flex flex-1 overflow-hidden">
          {/* Desktop sidebar */}
          {!isMobile && (
            <AppSidebar className="hidden md:flex" />
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
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
