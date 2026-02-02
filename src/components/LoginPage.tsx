import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, Loader2, CheckCircle } from 'lucide-react';

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError(null);

    const { error } = await signIn(email);

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-6xl mb-4 block">🦞</span>
          <h1 className="text-3xl font-bold mb-2">ClawdOS</h1>
          <p className="text-muted-foreground">Mission Control for AI Agents</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 shadow-lg">
          {sent ? (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Check your email</h2>
              <p className="text-muted-foreground">
                We sent a magic link to <strong>{email}</strong>
              </p>
              <p className="text-sm text-muted-foreground mt-4">
                Click the link in the email to sign in.
              </p>
              <Button
                variant="ghost"
                className="mt-6"
                onClick={() => {
                  setSent(false);
                  setEmail('');
                }}
              >
                Use a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading || !email}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send magic link'
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                We'll send you a magic link to sign in without a password.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
