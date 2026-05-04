import { registrationOpen } from '../../../server/auth/registration-open';
import LoginForm from './login-form';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <LoginForm registrationOpen={registrationOpen()} />
    </main>
  );
}
