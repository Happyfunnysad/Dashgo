import React, { useEffect, useMemo, useState } from 'react';
import { ComposeProject, composeApi } from '../utils/api';
import { IconCompose, IconRefresh } from '../components/icons/Icons';

type Notice = { kind: 'success' | 'error'; text: string } | null;

const errorMessage = (error: unknown, fallback: string) => {
  const responseError = error as { response?: { data?: { error?: string } }; message?: string };
  return responseError.response?.data?.error || responseError.message || fallback;
};

export const ComposePage: React.FC = () => {
  const [projects, setProjects] = useState<ComposeProject[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [fileIndex, setFileIndex] = useState(0);
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<Notice>(null);

  const selectedProject = projects.find((project) => project.name === selectedName);
  const selectedFile = selectedProject?.files.find((file) => file.index === fileIndex);
  const dirty = content !== savedContent;

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => (
      project.name.toLowerCase().includes(query)
      || project.containers.some((container) => container.name.toLowerCase().includes(query))
    ));
  }, [projects, search]);

  const loadProjects = async () => {
    setLoadingProjects(true);
    try {
      const response = await composeApi.getProjects();
      const items = Array.isArray(response.data) ? response.data : [];
      setProjects(items);
      setSelectedName((current) => items.some((project) => project.name === current) ? current : (items[0]?.name || ''));
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error, 'Failed to load Compose projects') });
    } finally {
      setLoadingProjects(false);
    }
  };

  const loadFile = async (projectName: string, index: number) => {
    if (!projectName) {
      setContent('');
      setSavedContent('');
      return;
    }
    const project = projects.find((item) => item.name === projectName);
    if (!project || project.files.length === 0) {
      setContent('');
      setSavedContent('');
      return;
    }

    setLoadingFile(true);
    try {
      const response = await composeApi.getFile(projectName, index);
      setContent(response.data.content);
      setSavedContent(response.data.content);
    } catch (error) {
      setContent('');
      setSavedContent('');
      setNotice({ kind: 'error', text: errorMessage(error, 'Failed to read Compose file') });
    } finally {
      setLoadingFile(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (!selectedName) return;
    const project = projects.find((item) => item.name === selectedName);
    if (!project) return;
    const nextIndex = project.files.some((file) => file.index === fileIndex) ? fileIndex : (project.files[0]?.index || 0);
    if (nextIndex !== fileIndex) {
      setFileIndex(nextIndex);
      return;
    }
    loadFile(selectedName, nextIndex);
  }, [selectedName, fileIndex, projects]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [dirty]);

  const confirmDiscard = () => !dirty || window.confirm('Discard unsaved Compose changes?');

  const refreshProjects = () => {
    if (!confirmDiscard()) return;
    loadProjects();
  };

  const selectProject = (projectName: string) => {
    if (projectName === selectedName || !confirmDiscard()) return;
    setFileIndex(0);
    setSelectedName(projectName);
  };

  const selectFile = (index: number) => {
    if (index === fileIndex || !confirmDiscard()) return;
    setFileIndex(index);
  };

  const reloadFile = () => {
    if (!selectedName || !confirmDiscard()) return;
    loadFile(selectedName, fileIndex);
  };

  const saveFile = async (apply = false) => {
    if (!selectedProject || !selectedFile?.editable || saving || applying || (!dirty && !apply)) return;
    if (apply && !window.confirm(`Save and recreate the “${selectedProject.name}” project?`)) return;
    setSaving(true);
    if (apply) setApplying(true);
    try {
      if (dirty) {
        const response = await composeApi.saveFile(selectedProject.name, selectedFile.index, content);
        setContent(response.data.content);
        setSavedContent(response.data.content);
      }
      if (apply) {
        await composeApi.applyProject(selectedProject.name);
        setNotice({ kind: 'success', text: `${selectedProject.name} saved and applied` });
      } else {
        setNotice({ kind: 'success', text: `${selectedFile.name} saved` });
      }
      await loadProjects();
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error, apply ? 'Failed to apply Compose project' : 'Failed to save Compose file') });
    } finally {
      setSaving(false);
      setApplying(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveFile(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [content, savedContent, selectedName, fileIndex, saving, projects]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-4 md:p-6">
      {notice && <NoticeBanner notice={notice} onClose={() => setNotice(null)} />}

      <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <IconCompose className="h-5 w-5 text-green-400" />
          <h2 className="text-lg font-bold text-slate-100">Compose</h2>
          {!loadingProjects && <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">{projects.length}</span>}
        </div>
        <button type="button" onClick={refreshProjects} disabled={loadingProjects} className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-700 disabled:opacity-50">
          <IconRefresh className={`h-3.5 w-3.5 ${loadingProjects ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex min-h-48 flex-col overflow-hidden rounded-xl border border-slate-700/60 bg-slate-800/40 md:min-h-0">
          <div className="border-b border-slate-700/60 p-3">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects or containers..." className="h-9 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-green-500/60" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loadingProjects ? (
              <div className="flex items-center justify-center py-10 text-xs text-slate-500"><Spinner className="mr-2 h-4 w-4" /> Loading...</div>
            ) : filteredProjects.length === 0 ? (
              <div className="px-3 py-10 text-center text-xs text-slate-500">No current Compose projects found.</div>
            ) : filteredProjects.map((project) => (
              <button key={project.name} type="button" onClick={() => selectProject(project.name)} className={`mb-1 w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${selectedName === project.name ? 'border-green-500/30 bg-green-500/10' : 'border-transparent hover:bg-slate-800'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-slate-200">{project.name}</span>
                  <span className="shrink-0 text-[10px] text-slate-500">{project.runningCount}/{project.containers.length}</span>
                </div>
                <div className="mt-1 truncate text-[11px] text-slate-500">{project.containers.map((container) => container.name).join(', ')}</div>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-700/60 bg-slate-800/40 md:min-h-0">
          {!selectedProject ? (
            <EmptyEditor text="Select a current Compose project." />
          ) : selectedProject.files.length === 0 ? (
            <EmptyEditor text="Docker labels do not contain an accessible Compose file for this project." />
          ) : (
            <>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-slate-100">{selectedProject.name}</h3>
                    {dirty && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">Unsaved</span>}
                    {selectedFile?.readable && !selectedFile.editable && <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-400">Read only</span>}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500" title={selectedFile?.path}>{selectedFile?.path}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedProject.files.length > 1 && (
                    <select aria-label="Compose file" value={fileIndex} onChange={(event) => selectFile(Number(event.target.value))} className="h-8 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-300 outline-none">
                      {selectedProject.files.map((file) => <option key={file.index} value={file.index}>{file.name}</option>)}
                    </select>
                  )}
                  <button type="button" onClick={reloadFile} disabled={loadingFile} className="h-8 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50">Reload</button>
                  <button type="button" onClick={() => saveFile(false)} disabled={!dirty || !selectedFile?.editable || saving || loadingFile} className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">
                    {saving && !applying && <Spinner className="h-3.5 w-3.5" />}
                    {saving && !applying ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" onClick={() => saveFile(true)} disabled={!selectedFile?.editable || saving || loadingFile} className="flex h-8 items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/15 px-3 text-xs font-semibold text-green-400 hover:bg-green-500/25 disabled:cursor-not-allowed disabled:opacity-40">
                    {applying && <Spinner className="h-3.5 w-3.5" />}
                    {applying ? 'Applying...' : 'Save & Apply'}
                  </button>
                </div>
              </div>

              {!selectedFile?.readable ? (
                <EmptyEditor text={selectedFile?.error || 'Compose file is not available inside Dashgo.'} />
              ) : loadingFile ? (
                <div className="flex flex-1 items-center justify-center text-sm text-slate-500"><Spinner className="mr-2 h-5 w-5" /> Loading Compose file...</div>
              ) : (
                <>
                  <textarea aria-label="Compose YAML" value={content} onChange={(event) => setContent(event.target.value)} readOnly={!selectedFile?.editable} spellCheck={false} className="min-h-0 flex-1 resize-none bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-300 outline-none read-only:cursor-not-allowed read-only:opacity-70" />
                  <div className="shrink-0 border-t border-slate-700/60 px-4 py-2 text-[10px] text-slate-500">{selectedFile.editable ? 'Save keeps containers unchanged. Save & Apply recreates changed services.' : 'This source Compose file is mounted read-only.'}</div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
};

const EmptyEditor: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-500">{text}</div>
);

const NoticeBanner: React.FC<{ notice: NonNullable<Notice>; onClose: () => void }> = ({ notice, onClose }) => (
  <div className={`fixed right-4 top-4 z-[60] flex max-w-md items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl ${notice.kind === 'success' ? 'border-green-500/30 bg-green-950 text-green-300' : 'border-red-500/30 bg-red-950 text-red-300'}`}>
    <span>{notice.text}</span>
    <button type="button" onClick={onClose} className="ml-auto opacity-60 hover:opacity-100" aria-label="Close notice">×</button>
  </div>
);

const Spinner: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" d="M20 12a8 8 0 1 1-3-6.25" />
  </svg>
);
