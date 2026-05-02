import { expect, test } from '@playwright/test';

test('session hello flow', async ({ page }) => {
  const rand = Math.random().toString(36).slice(2, 8);
  const email = `e2e-session-${Date.now()}-${rand}@example.com`;
  const password = 'password123';

  // Register + login
  await page.goto('/register');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page).toHaveURL('/login');

  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/dashboard');

  // Create a profile
  await page.goto('/profiles/new');
  await page.locator('input[name="name"]').fill(`Session Test Profile ${rand}`);
  await page.locator('select[name="format"]').selectOption('long_read');
  await page.locator('input[name="style"]').fill('Informative');
  await page.locator('input[name="audience"]').fill('Developers');
  await page.locator('input[name="targetVolumeMin"]').fill('800');
  await page.locator('input[name="targetVolumeMax"]').fill('1200');
  await page.locator('textarea[name="markupRules"]').fill('{}');
  await page.locator('textarea[name="extraPrompt"]').fill('');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page).toHaveURL('/profiles');

  // Create a session
  await page.goto('/sessions/new');
  await page.locator('select[name="mode"]').selectOption('new');
  await page.getByRole('button', { name: 'Create session' }).click();
  await expect(page).toHaveURL(/\/sessions\/\d+/);

  // The session page should be visible
  const sessionUrl = page.url();
  const sessionId = sessionUrl.match(/\/sessions\/(\d+)/)?.[1];
  expect(sessionId).toBeTruthy();

  // Click Start
  await page.getByRole('button', { name: 'Start' }).click();

  // Wait for agent_message containing "Hi!"
  await expect(page.getByText(/Hi!/)).toBeVisible({ timeout: 10000 });

  // Type a reply and send
  await page.locator('input[placeholder="Type a reply…"]').fill('world');
  await page.getByRole('button', { name: 'Send' }).click();

  // Wait for state_changed event mentioning "done"
  await expect(page.getByText(/state_changed/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/done/)).toBeVisible({ timeout: 5000 });
});
