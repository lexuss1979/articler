'use client';

import { useActionState } from 'react';
import { registerUser, type RegisterResult } from './actions';

const ERROR_MESSAGES: Record<NonNullable<RegisterResult>['error'], string> = {
  validation: 'Please enter a valid email and a password of at least 8 characters.',
  email_taken: 'An account with this email already exists.',
  registration_closed: 'Registration is invite-only at the moment.',
};

export default function RegisterForm() {
  const [state, action, pending] = useActionState(registerUser, null);

  return (
    <form action={action} className="flex flex-col gap-4 w-80">
      <h1 className="text-xl font-semibold">Create account</h1>
      {state && <p className="text-red-600 text-sm">{ERROR_MESSAGES[state.error]}</p>}
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
        {pending ? 'Registering…' : 'Register'}
      </button>
    </form>
  );
}
