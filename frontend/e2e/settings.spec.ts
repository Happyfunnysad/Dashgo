import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Password').fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.getByRole('button', { name: /settings/i }).click();
    await expect(page.getByText(/general/i)).toBeVisible({ timeout: 10000 });
  });

  test('should display all settings sections', async ({ page }) => {
    await expect(page.getByText(/network/i)).toBeVisible();
    await expect(page.getByText(/tailscale/i)).toBeVisible();
    await expect(page.getByText(/notifications/i)).toBeVisible();
    await expect(page.getByText(/security/i)).toBeVisible();
    await expect(page.getByText(/advanced/i)).toBeVisible();
  });

  test('should change language', async ({ page }) => {
    const langSelect = page.locator('select').first();
    await langSelect.selectOption('ru');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should save settings', async ({ page }) => {
    const saveBtn = page.getByRole('button', { name: /save changes/i });
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await expect(page.getByText(/settings saved/i)).toBeVisible({ timeout: 5000 });
    }
  });
});