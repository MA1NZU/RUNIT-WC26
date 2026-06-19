import { redirect } from 'next/navigation';
import { signIn, signUp } from '@/app/actions';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const success = first(params.success);
  const error = first(params.error);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect('/predict');

  return (
    <main>
      <section className="auth-shell">
        <div className="auth-card">
          <span className="kicker">Welcome back</span>
          <h2 style={{ marginTop: 14 }}>Login</h2>
          <p>Use the email and password you created in Supabase Auth.</p>

          {success ? <p className="notice success">{success}</p> : null}
          {error ? <p className="notice error">{error}</p> : null}

          <form action={signIn} className="form-grid">
            <label>
              Email
              <input name="email" type="email" placeholder="you@example.com" required />
            </label>
            <label>
              Password
              <input name="password" type="password" placeholder="••••••••" required minLength={6} />
            </label>
            <button className="button" type="submit">Login</button>
          </form>
        </div>

        <div className="auth-card">
          <span className="kicker">New player</span>
          <h2 style={{ marginTop: 14 }}>Create account</h2>
          <p>After signup, your profile is created automatically by the database trigger.</p>

          <form action={signUp} className="form-grid">
            <label>
              Username
              <input name="username" type="text" placeholder="FootballKing" required minLength={2} maxLength={24} />
            </label>
            <label>
              Email
              <input name="email" type="email" placeholder="you@example.com" required />
            </label>
            <label>
              Password
              <input name="password" type="password" placeholder="At least 6 characters" required minLength={6} />
            </label>
            <button className="button" type="submit">Create account</button>
          </form>
        </div>
      </section>
    </main>
  );
}
