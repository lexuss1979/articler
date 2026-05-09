'use client';

import { useActionState } from 'react';
import { loginUser } from './actions';

export default function LoginForm({ registrationOpen }: { registrationOpen: boolean }) {
  const [state, action, pending] = useActionState(loginUser, null);

  return (
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
      {!registrationOpen && (
        <p className="text-xs text-gray-500 text-center">
          Registration is invite-only. Contact the operator for access.
        </p>
      )}
    </form>
  );
}
