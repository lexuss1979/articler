import { requireUser } from '../../../../server/auth/require-user';
import { getUserSettings } from '../../../../server/settings/budget';
import { BudgetForm } from './budget-form';

export default async function BudgetSettingsPage() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Budget caps</h1>
      <p className="text-sm text-gray-600">
        Limit cumulative spend per session and across your account. Calls that would push
        a counter past its cap short-circuit before reaching the model.
      </p>
      <BudgetForm initial={settings} />
    </div>
  );
}
