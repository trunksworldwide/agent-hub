import { useState } from 'react';
import { Wifi, WifiOff, CheckCircle2, XCircle, Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useClawdOffice } from '@/lib/store';
import {
  testControlApi,
  clearControlApiUrl,
  saveControlApiUrlToSupabase,
  type ExecutorCheckResult,
} from '@/lib/control-api';

export function HealthPanel() {
  const { controlApiUrl, setControlApiUrl, selectedProjectId } = useClawdOffice();
  const [urlInput, setUrlInput] = useState(controlApiUrl);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ExecutorCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const { setExecutorCheck } = useClawdOffice();

  const handleTest = async () => {
    const url = urlInput.trim();
    if (!url) {
      toast({ title: 'No URL', description: 'Enter a Control API URL first.', variant: 'destructive' });
      return;
    }
    setTesting(true);
    setResult(null);
    setError(null);
    try {
      const r = await testControlApi(url);
      setResult(r);
      setExecutorCheck(r);
      toast({ title: 'Connected', description: `${r.binary} v${r.version}` });
    } catch (e: any) {
      setError(e.message || 'Connection failed');
      setExecutorCheck(null);
      toast({ title: 'Connection failed', description: e.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const url = urlInput.trim();
    setControlApiUrl(url);
    // Also persist to Supabase for cross-session/device access
    await saveControlApiUrlToSupabase(selectedProjectId, url).catch(() => {});
    toast({ title: 'Saved', description: 'Control API URL updated and synced.' });
  };

  const handleClear = async () => {
    clearControlApiUrl();
    // Also clear from Supabase
    await saveControlApiUrlToSupabase(selectedProjectId, '').catch(() => {});
    const fallback = import.meta.env.VITE_API_BASE_URL || '';
    setUrlInput(fallback);
    setControlApiUrl(fallback);
    setResult(null);
    setError(null);
    toast({ title: 'Cleared', description: 'Reverted to default URL.' });
  };

  const isDirty = urlInput.trim() !== controlApiUrl;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
        {result ? (
            <Wifi className="h-5 w-5 text-primary" />
          ) : error ? (
            <WifiOff className="h-5 w-5 text-destructive" />
          ) : (
            <Wifi className="h-5 w-5 text-muted-foreground" />
          )}
          <CardTitle className="text-lg">Connectivity</CardTitle>
        </div>
        <CardDescription>
          Control API connection to your Mac mini executor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* URL Input */}
        <div className="space-y-2">
          <Label htmlFor="control-api-url">Control API URL</Label>
          <div className="flex gap-2">
            <Input
              id="control-api-url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://your-tunnel.trycloudflare.com"
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing || !urlInput.trim()}
              className="gap-2 shrink-0"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
              Test
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!isDirty}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClear}
              className="gap-1 text-muted-foreground"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </Button>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Executor</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{result.binary}</Badge>
                <Badge variant="secondary">v{result.version}</Badge>
              </div>
            </div>
            <div className="space-y-1.5">
              {(['version', 'sessions', 'cron'] as const).map((key) => {
                const check = result.checks[key];
                return (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-muted-foreground">{key}</span>
                    {check.ok ? (
                      <div className="flex items-center gap-1 text-primary">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Pass</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-destructive">
                        <XCircle className="h-4 w-4" />
                        <span>Fail</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Show errors from any failed check */}
            {Object.entries(result.checks).some(([, c]) => c.error) && (
              <div className="text-xs text-destructive bg-destructive/10 rounded p-2 mt-2">
                {Object.entries(result.checks)
                  .filter(([, c]) => c.error)
                  .map(([k, c]) => (
                    <div key={k}>
                      <strong className="capitalize">{k}:</strong> {(c.error || '').slice(0, 200)}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Error state */}
        {error && !result && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error.slice(0, 300)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
