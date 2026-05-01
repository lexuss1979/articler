'use client';

import { useActionState } from 'react';
import { loginUser } from './actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginUser, null);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form action={action} className="flex flex-col gap-4 w-80">
        <h1 className="text-xl font-semibold">Sign in</h1>
        {state && (
          <p className="text-red-600 text-sm">Invalid email or password.</p>
        )}
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="border rounded px-3 py-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          className="border rounded px-3 py-2"
        />
        <button type="submit" disabled={pending} className="bg-blue-600 text-white rounded px-3 py-2">
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
