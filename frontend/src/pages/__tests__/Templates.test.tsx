import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplatesPage } from '../Templates';
import { templateApi } from '../../utils/api';

vi.mock('../../utils/api', () => ({
  templateApi: {
    getTemplates: vi.fn(),
    getCompose: vi.fn(),
    deploy: vi.fn(),
    getSources: vi.fn(),
    updateSource: vi.fn(),
    addSource: vi.fn(),
    deleteSource: vi.fn(),
  },
}));

const template = {
  id: 'example',
  type: 'container' as const,
  title: 'Example App',
  description: 'A small example service',
  logo: '',
  categories: ['Tools'],
  source: 'Example catalog',
  image: 'example/app:latest',
};

describe('TemplatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (templateApi.getTemplates as any).mockResolvedValue({ data: [template] });
    (templateApi.getCompose as any).mockResolvedValue({ data: { compose: 'services:\n  example-app:\n    image: example/app:latest\n' } });
    (templateApi.getSources as any).mockResolvedValue({ data: [{
      id: 1,
      sourceId: 'example',
      name: 'Example catalog',
      url: 'https://example.com/templates.json',
      enabled: true,
      builtin: true,
      sortOrder: 0,
    }] });
  });

  it('browses a template and opens editable compose', async () => {
    render(<TemplatesPage />);

    await waitFor(() => expect(screen.getByText('Example App')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Example App/i }));

    await waitFor(() => expect(screen.getByRole('dialog', { name: /Create compose stack/i })).toBeInTheDocument());
    expect(screen.getByDisplayValue(/example\/app:latest/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('example-app')).toBeInTheDocument();
  });

  it('shows configured catalog sources', async () => {
    render(<TemplatesPage />);
    fireEvent.click(screen.getByRole('button', { name: /Sources/i }));

    await waitFor(() => expect(screen.getByText('Example catalog')).toBeInTheDocument());
    expect(screen.getByText('https://example.com/templates.json')).toBeInTheDocument();
  });
});
