import { useEffect, useState } from 'react';
import { Search, Download, WifiOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getSkills, type Skill } from '@/lib/api';
import { useClawdOffice } from '@/lib/store';

export function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { controlApiUrl } = useClawdOffice();

  useEffect(() => {
    setLoading(true);
    getSkills().then(setSkills).finally(() => setLoading(false));
  }, [controlApiUrl]);

  const filteredSkills = skills.filter(skill =>
    skill.name.toLowerCase().includes(search.toLowerCase()) ||
    skill.description.toLowerCase().includes(search.toLowerCase())
  );

  const installedSkills = filteredSkills.filter(s => s.installed);
  const availableSkills = filteredSkills.filter(s => !s.installed);

  if (!loading && skills.length === 0) {
    return (
      <div className="flex-1 p-6 overflow-auto scrollbar-thin">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Skills</h1>
            <p className="text-muted-foreground">
              Manage installed skills and discover new ones.
            </p>
          </div>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <WifiOff className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No skills data available</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Connect to your Mac mini via the Control API to view installed skills.
              Go to <strong>System → Connectivity</strong> to configure the connection.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-auto scrollbar-thin">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Skills</h1>
            <p className="text-muted-foreground">
              Manage installed skills and discover new ones.
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search skills..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-72"
            />
          </div>
        </div>

        {installedSkills.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Installed ({installedSkills.length})
            </h2>
            <div className="grid gap-4">
              {installedSkills.map((skill) => (
                <div
                  key={skill.id}
                  className="p-4 rounded-lg border border-border bg-card hover:bg-card/80 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-lg">
                        🛠️
                      </div>
                      <div>
                        <h3 className="font-medium">{skill.name}</h3>
                        <p className="text-sm text-muted-foreground">{skill.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-sm">
                        <div className="font-mono text-muted-foreground">v{skill.version}</div>
                        <div className="text-xs text-muted-foreground">Updated {skill.lastUpdated}</div>
                      </div>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {availableSkills.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Available ({availableSkills.length})
            </h2>
            <div className="grid gap-4">
              {availableSkills.map((skill) => (
                <div
                  key={skill.id}
                  className="p-4 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-lg">
                        📦
                      </div>
                      <div>
                        <h3 className="font-medium">{skill.name}</h3>
                        <p className="text-sm text-muted-foreground">{skill.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-sm">
                        <div className="font-mono text-muted-foreground">v{skill.version}</div>
                      </div>
                      <Button size="sm" className="gap-2">
                        <Download className="w-4 h-4" />
                        Install
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
