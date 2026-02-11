import { useState, useEffect } from 'react';
import { Edit2, Check, X, Loader2, Info, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getProjectOverview, saveProjectOverview, getProjectMission, saveProjectMission } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export function ProjectOverviewCard() {
  const { toast } = useToast();
  const [content, setContent] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Mission state
  const [mission, setMission] = useState('');
  const [editMission, setEditMission] = useState('');
  const [isEditingMission, setIsEditingMission] = useState(false);
  const [savingMission, setSavingMission] = useState(false);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const [overview, missionDoc] = await Promise.all([
        getProjectOverview(),
        getProjectMission(),
      ]);
      setContent(overview?.content || '');
      setMission(missionDoc?.content || '');
    } catch (err) {
      console.error('Failed to load project overview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const handleStartEdit = () => {
    setEditContent(content);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditContent('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await saveProjectOverview(editContent);
      if (!res.ok) {
        throw new Error(res.error);
      }
      setContent(editContent);
      setIsEditing(false);
      toast({ title: 'Project overview saved' });
    } catch (err: any) {
      toast({
        title: 'Failed to save',
        description: String(err?.message || err),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const isEmpty = !content.trim();
  const missionEmpty = !mission.trim();

  const handleStartEditMission = () => {
    setEditMission(mission);
    setIsEditingMission(true);
  };

  const handleSaveMission = async () => {
    setSavingMission(true);
    try {
      const res = await saveProjectMission(editMission);
      if (!res.ok) throw new Error(res.error);
      setMission(editMission);
      setIsEditingMission(false);
      toast({ title: 'Mission saved' });
    } catch (err: any) {
      toast({ title: 'Failed to save mission', description: String(err?.message || err), variant: 'destructive' });
    } finally {
      setSavingMission(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mission Card */}
      <Card className="border-accent/20 bg-accent/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4" />
              Mission
            </CardTitle>
            {!isEditingMission && (
              <Button variant="ghost" size="sm" onClick={handleStartEditMission}>
                <Edit2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : isEditingMission ? (
            <div className="space-y-3">
              <Input
                value={editMission}
                onChange={(e) => setEditMission(e.target.value)}
                placeholder="A short mission statement for this project…"
                className="text-sm"
                disabled={savingMission}
                maxLength={200}
              />
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditingMission(false)} disabled={savingMission}>
                  <X className="w-4 h-4 mr-1" /> Cancel
                </Button>
                <Button size="sm" onClick={handleSaveMission} disabled={savingMission}>
                  {savingMission ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                  Save
                </Button>
              </div>
            </div>
          ) : missionEmpty ? (
            <button
              onClick={handleStartEditMission}
              className="w-full p-3 rounded-lg border-2 border-dashed border-muted-foreground/20 hover:border-muted-foreground/40 transition-colors text-left"
            >
              <p className="text-sm text-muted-foreground">
                Click to set a mission statement. This is included in every agent's Context Pack.
              </p>
            </button>
          ) : (
            <div className="text-sm font-medium">{mission}</div>
          )}
        </CardContent>
      </Card>

      {/* Overview Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              📋 Project Overview
            </CardTitle>
            {!isEditing && (
              <Button variant="ghost" size="sm" onClick={handleStartEdit}>
                <Edit2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : isEditing ? (
            <div className="space-y-3">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="Describe what this project is about. This overview is included in every agent's Context Pack."
                className="min-h-[100px] text-sm"
                disabled={saving}
              />
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
                  <X className="w-4 h-4 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 mr-1" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          ) : isEmpty ? (
            <button
              onClick={handleStartEdit}
              className="w-full p-4 rounded-lg border-2 border-dashed border-muted-foreground/20 hover:border-muted-foreground/40 transition-colors text-left"
            >
              <p className="text-sm text-muted-foreground">
                Click to add a project overview. This description is included in every agent's Context Pack.
              </p>
            </button>
          ) : (
            <div className="space-y-2">
              <div className="text-sm whitespace-pre-wrap">{content}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="w-3 h-3" />
                Included in every agent's Context Pack
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
