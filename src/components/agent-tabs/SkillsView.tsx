import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { getSkills, type Skill } from '@/lib/api';
import { cn } from '@/lib/utils';

export function SkillsView() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getSkills().then(setSkills);
  }, []);

  const filteredSkills = skills.filter(skill =>
    skill.name.toLowerCase().includes(search.toLowerCase()) ||
    skill.description.toLowerCase().includes(search.toLowerCase())
  );

  const installedSkills = filteredSkills.filter(s => s.installed);
  const availableSkills = filteredSkills.filter(s => !s.installed);

  return (
    <div className="p-4 overflow-auto scrollbar-thin h-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Skills</h2>
          <p className="text-sm text-muted-foreground">
            Installed skills and their capabilities.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-64"
          />
        </div>
      </div>

      {installedSkills.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Installed ({installedSkills.length})
          </h3>
          <div className="space-y-2">
            {installedSkills.map((skill) => (
              <div
                key={skill.id}
                className="p-4 rounded-lg border border-border bg-card hover:bg-card/80 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{skill.name}</h4>
                    <p className="text-sm text-muted-foreground">{skill.description}</p>
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-muted-foreground">v{skill.version}</div>
                    <div className="text-xs text-muted-foreground">{skill.lastUpdated}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {availableSkills.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Available ({availableSkills.length})
          </h3>
          <div className="space-y-2">
            {availableSkills.map((skill) => (
              <div
                key={skill.id}
                className="p-4 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors cursor-pointer opacity-70"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{skill.name}</h4>
                    <p className="text-sm text-muted-foreground">{skill.description}</p>
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-muted-foreground">v{skill.version}</div>
                    <span className="badge-status badge-idle">Not installed</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
