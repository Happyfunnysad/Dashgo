import { describe, it, expect } from 'vitest';
import { formatBytes } from '../utils/formatters';

describe('formatBytes', () => {
  it('should format bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(1073741824)).toBe('1.0 GB');
  });

  it('should handle decimal values', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1572864)).toBe('1.5 MB');
  });
});

describe('i18n', () => {
  it('should have en locale loaded', async () => {
    const en = await import('../locales/en.json');
    expect(en.default.app.name).toBe('Dashgo');
    expect(en.default.nav.dashboard).toBe('Dashboard');
  });

  it('should have ru locale loaded', async () => {
    const ru = await import('../locales/ru.json');
    expect(ru.default.app.name).toBe('Dashgo');
    expect(ru.default.nav.dashboard).toBe('Панель');
  });
});