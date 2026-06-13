import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Password').fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/dashboard/i)).toBeVisible({ timeout: 10000 });
  });

  test('should display containers section', async ({ page }) => {
    await expect(page.getByText(/containers/i)).toBeVisible();
  });

  test('should display hardware gauges', async ({ page }) => {
    await expect(page.getByText(/cpu/i)).toBeVisible();
    await expect(page.getByText(/memory/i)).toBeVisible();
  });

  test('should navigate to settings', async ({ page }) => {
    await page.getByRole('button', { name: /settings/i }).click();
    await expect(page.getByText(/general/i)).toBeVisible({ timeout: 5000 });
  });
});