import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposePage } from '../Compose';
import { composeApi } from '../../utils/api';

vi.mock('../../utils/api', () => ({
  composeApi: {
    getProjects: vi.fn(),
    getFile: vi.fn(),
    saveFile: vi.fn(),
    applyProject: vi.fn(),
  },
}));

const project = {
  name: 'sample',
  workingDir: '/srv/sample',
  files: [{ index: 0, name: 'compose.yaml', path: '/srv/sample/compose.yaml', readable: true, editable: true }],
  containers: [{ name: 'sample-app-1', state: 'running' }],
  runningCount: 1,
};

const originalContent = 'services:\n  app:\n    image: nginx:latest\n';

describe('ComposePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (composeApi.getProjects as any).mockResolvedValue({ data: [project] });
    (composeApi.getFile as any).mockResolvedValue({
      data: { project, file: project.files[0], content: originalContent },
    });
    (composeApi.saveFile as any).mockImplementation((_name: string, _index: number, content: string) => Promise.resolve({
      data: { project, file: project.files[0], content },
    }));
    (composeApi.applyProject as any).mockResolvedValue({ data: { success: true, output: '' } });
  });

  it('loads and saves the Compose file used by a current container', async () => {
    render(<ComposePage />);

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Compose YAML' })).toHaveValue(originalContent));
    const editor = screen.getByRole('textbox', { name: 'Compose YAML' });
    expect(screen.getByText('sample-app-1')).toBeInTheDocument();

    const updatedContent = originalContent.replace('nginx:latest', 'nginx:alpine');
    fireEvent.change(editor, { target: { value: updatedContent } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(composeApi.saveFile).toHaveBeenCalledWith('sample', 0, updatedContent));
    expect(await screen.findByText('compose.yaml saved')).toBeInTheDocument();
  });

  it('saves and applies changes to the current Compose project', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ComposePage />);

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Compose YAML' })).toHaveValue(originalContent));
    const updatedContent = originalContent.replace('nginx:latest', 'nginx:alpine');
    fireEvent.change(screen.getByRole('textbox', { name: 'Compose YAML' }), { target: { value: updatedContent } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & Apply' }));

    await waitFor(() => expect(composeApi.saveFile).toHaveBeenCalledWith('sample', 0, updatedContent));
    expect(composeApi.applyProject).toHaveBeenCalledWith('sample');
    expect(await screen.findByText('sample saved and applied')).toBeInTheDocument();
  });

  it('explains when a current project has no accessible Compose file', async () => {
    (composeApi.getProjects as any).mockResolvedValue({ data: [{ ...project, files: [] }] });
    render(<ComposePage />);

    expect(await screen.findByText(/do not contain an accessible Compose file/i)).toBeInTheDocument();
    expect(composeApi.getFile).not.toHaveBeenCalled();
  });
});
