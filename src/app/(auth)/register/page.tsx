import { redirect } from 'next/navigation';
import { registrationOpen } from '../../../server/auth/registration-open';
import RegisterForm from './register-form';

export default function RegisterPage() {
  if (!registrationOpen()) {
    redirect('/login');
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <RegisterForm />
    </main>
  );
}
