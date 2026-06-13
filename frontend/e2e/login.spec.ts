import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should show login page when not authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder('Password')).toBeVisible();
  });

  test('should authenticate with valid password', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Password').fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/dashboard/i)).toBeVisible({ timeout: 10000 });
  });

  test('should show error with invalid password', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Password').fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/authentication failed/i)).toBeVisible();
  });
});