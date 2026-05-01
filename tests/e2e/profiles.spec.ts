import { expect, test } from '@playwright/test';

test('profile CRUD happy path', async ({ page }) => {
  const rand = Math.random().toString(36).slice(2, 8);
  const email = `e2e-${Date.now()}-${rand}@example.com`;
  const password = 'password123';

  // (a) Register
  await page.goto('/register');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page).toHaveURL('/login');

  // (b) Login
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/dashboard');

  // (c) Navigate to profiles (list may be empty or contain pre-existing rows)
  await page.goto('/profiles');
  await expect(page).toHaveURL('/profiles');

  // (d) Create a profile
  await page.getByRole('link', { name: 'New profile' }).click();
  await expect(page).toHaveURL('/profiles/new');

  const profileName = `E2E Profile ${Date.now()}`;
  await page.locator('input[name="name"]').fill(profileName);
  await page.locator('select[name="format"]').selectOption('long_read');
  await page.locator('input[name="style"]').fill('Informative');
  await page.locator('input[name="audience"]').fill('Developers');
  await page.locator('input[name="targetVolumeMin"]').fill('800');
  await page.locator('input[name="targetVolumeMax"]').fill('1200');
  await page.locator('textarea[name="markupRules"]').fill('{}');
  await page.locator('textarea[name="extraPrompt"]').fill('');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page).toHaveURL('/profiles');
  await expect(page.getByText(profileName)).toBeVisible();

  // (e) Edit the profile — change the name
  const profileRow = page.locator('tr', { has: page.getByText(profileName) });
  await profileRow.getByRole('link', { name: 'Edit' }).click();
  await expect(page).toHaveURL(/\/profiles\/\d+\/edit/);

  const updatedName = `Updated ${profileName}`;
  await page.locator('input[name="name"]').fill(updatedName);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL('/profiles');
  await expect(page.getByText(updatedName)).toBeVisible();

  // (f) Delete the profile
  const updatedRow = page.locator('tr', { has: page.getByText(updatedName) });
  await updatedRow.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(updatedName)).not.toBeVisible();
});
