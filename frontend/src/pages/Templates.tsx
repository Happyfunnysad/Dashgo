import React, { useEffect, useMemo, useState } from 'react';
import { templateApi, TemplateItem, TemplateSource } from '../utils/api';
import { IconLibrary, IconRefresh } from '../components/icons/Icons';

type Notice = { kind: 'success' | 'error' | 'warning'; text: string } | null;
type ValidationResult = { ok: boolean; count?: number; error?: string };

let templateCache: { items: TemplateItem[]; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

const errorMessage = (error: unknown, fallback: string) => {
  const responseError = error as { response?: { data?: { error?: string } }; message?: string };
  return responseError.response?.data?.error || responseError.message || fallback;
};

const slugify = (value: string) => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9-]/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

const plainDescription = (value: string) => value
  .replace(/<a\s+[^>]*>([^<]+)<\/a>/gi, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .trim();

const isSafeProjectURL = (value?: string) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const formatPulls = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
};

export const TemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<TemplateItem[]>(templateCache?.items || []);
  const [loading, setLoading] = useState(!templateCache);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'browse' | 'sources'>('browse');
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null);
  const [deployState, setDeployState] = useState<{ name: string; compose: string } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const fetchTemplates = async (force = false) => {
    if (!force && templateCache && Date.now() - templateCache.fetchedAt < CACHE_TTL) {
      setTemplates(templateCache.items);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await templateApi.getTemplates();
      const items = Array.isArray(response.data) ? response.data : [];
      templateCache = { items, fetchedAt: Date.now() };
      setTemplates(items);
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error, 'Failed to load library templates') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const allCategories = useMemo(() => (
    [...new Set(templates.flatMap((template) => template.categories || []))].sort()
  ), [templates]);

  const allSources = useMemo(() => (
    [...new Set(templates.map((template) => template.source))].sort()
  ), [templates]);

  const filteredTemplates = useMemo(() => {
    const query = debouncedQuery.toLowerCase();
    return templates.filter((template) => {
      const matchesSearch = !query
        || template.title.toLowerCase().includes(query)
        || template.description.toLowerCase().includes(query);
      const matchesCategory = selectedCategories.length === 0
        || template.categories.some((category) => selectedCategories.includes(category));
      const matchesSource = selectedSources.length === 0 || selectedSources.includes(template.source);
      return matchesSearch && matchesCategory && matchesSource;
    });
  }, [templates, debouncedQuery, selectedCategories, selectedSources]);

  const openTemplate = async (template: TemplateItem) => {
    setLoadingTemplateId(template.id);
    try {
      const response = await templateApi.getCompose(template);
      setDeployState({ name: slugify(template.title), compose: response.data.compose });
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error, 'Failed to load template') });
    } finally {
      setLoadingTemplateId(null);
    }
  };

  const clearFilters = () => {
    setSelectedCategories([]);
    setSelectedSources([]);
    setSearchQuery('');
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-4 md:p-6">
      {notice && <NoticeBanner notice={notice} onClose={() => setNotice(null)} />}

      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <IconLibrary className="h-5 w-5 text-green-400" />
          <h2 className="text-lg font-bold text-slate-100">Templates</h2>
          {!loading && <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">{filteredTemplates.length}</span>}
          <button type="button" onClick={() => fetchTemplates(true)} disabled={loading} title="Refresh templates" className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50">
            <IconRefresh className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-green-400' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-0.5 rounded-lg bg-slate-800 p-0.5">
          <TabButton active={activeTab === 'browse'} onClick={() => setActiveTab('browse')}><PackageIcon className="h-3.5 w-3.5" /> Browse</TabButton>
          <TabButton active={activeTab === 'sources'} onClick={() => setActiveTab('sources')}><SettingsIcon className="h-3.5 w-3.5" /> Sources</TabButton>
        </div>
      </div>

      {activeTab === 'browse' ? (
        <>
          <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => event.key === 'Escape' && setSearchQuery('')} placeholder="Search templates..." className="h-9 w-64 rounded-lg border border-slate-700 bg-slate-800 pl-9 pr-3 text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-500 focus:border-green-500/60" />
            </div>
            {allCategories.length > 0 && <FilterMenu label="All categories" values={allCategories} selected={selectedCategories} onChange={setSelectedCategories} />}
            {allSources.length > 1 && <FilterMenu label="All sources" values={allSources} selected={selectedSources} onChange={setSelectedSources} />}
            {(selectedCategories.length > 0 || selectedSources.length > 0 || searchQuery) && <button type="button" onClick={clearFilters} className="px-2 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-100">Clear filters</button>}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {loading ? <TemplateSkeletons /> : filteredTemplates.length === 0 ? (
              <EmptyTemplates hasTemplates={templates.length > 0} onOpenSources={() => setActiveTab('sources')} />
            ) : (
              <div className="grid grid-cols-1 gap-4 pb-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredTemplates.map((template) => <TemplateCard key={template.id} template={template} loading={loadingTemplateId === template.id} onClick={() => openTemplate(template)} />)}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <TemplateSources onSourcesChanged={() => fetchTemplates(true)} notify={setNotice} />
        </div>
      )}

      {deployState && <DeployModal initialName={deployState.name} initialCompose={deployState.compose} onClose={() => setDeployState(null)} onSuccess={(name) => {
        setDeployState(null);
        setNotice({ kind: 'success', text: `Stack “${name}” deployed from template` });
      }} />}
    </div>
  );
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button type="button" onClick={onClick} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${active ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-200'}`}>{children}</button>
);

const FilterMenu: React.FC<{
  label: string;
  values: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}> = ({ label, values, selected, onChange }) => (
  <details className="relative">
    <summary className="flex h-9 min-w-44 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm text-slate-300 hover:border-slate-600">
      <span className="max-w-36 truncate">{selected.length === 0 ? label : selected.length === 1 ? selected[0] : `${selected.length} selected`}</span>
      <ChevronIcon className="h-3.5 w-3.5 text-slate-500" />
    </summary>
    <div className="absolute left-0 z-30 mt-1 max-h-64 min-w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-1.5 shadow-2xl">
      {values.map((value) => (
        <label key={value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
          <input type="checkbox" checked={selected.includes(value)} onChange={() => onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value])} className="h-3.5 w-3.5 accent-green-500" />
          <span className="whitespace-nowrap">{value}</span>
        </label>
      ))}
    </div>
  </details>
);

const TemplateCard: React.FC<{ template: TemplateItem; loading: boolean; onClick: () => void }> = ({ template, loading, onClick }) => {
  const [logoError, setLogoError] = useState(false);
  const categories = (template.categories || []).slice(0, 3);
  const overflow = Math.max(0, (template.categories || []).length - categories.length);

  const activate = (event: React.KeyboardEvent) => {
    if ((event.target as HTMLElement).closest('a')) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <article
      role="button"
      tabIndex={0}
      aria-disabled={loading}
      onClick={() => !loading && onClick()}
      onKeyDown={activate}
      className={`group flex min-h-40 cursor-pointer flex-col rounded-xl border bg-slate-800/60 p-3 text-left outline-none transition-all hover:border-green-500/40 hover:shadow-lg hover:shadow-black/10 focus-visible:ring-2 focus-visible:ring-green-500/60 ${loading ? 'pointer-events-none border-slate-700/50 opacity-60' : 'border-slate-700/60'}`}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-900/80">
          {template.logo && !logoError ? <img src={template.logo} alt="" loading="lazy" onError={() => setLogoError(true)} className="h-9 w-9 object-contain" /> : <PackageIcon className="h-4 w-4 text-slate-500" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{template.title}</h3>
            {loading && <Spinner className="h-3.5 w-3.5 text-green-400" />}
          </div>
          <span className="mt-1 inline-flex max-w-full truncate rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">{template.source}</span>
        </div>
      </div>

      <p className="mt-2 line-clamp-2 min-h-8 text-xs leading-4 text-slate-400">{plainDescription(template.description) || 'No description available'}</p>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
        {categories.map((category) => <span key={category} className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] text-slate-300">{category}</span>)}
        {overflow > 0 && <span className="text-[10px] text-slate-500">+{overflow}</span>}
        <div className="ml-auto flex items-center gap-2 text-[10px] text-slate-500">
          {isSafeProjectURL(template.projectUrl) && (
            <a href={template.projectUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="flex items-center gap-1 hover:text-green-400 hover:underline">
              <ExternalIcon className="h-3 w-3" /> Project
            </a>
          )}
          {!!template.stars && <span>☆ {template.stars}</span>}
          {!!template.pulls && <span>↓ {formatPulls(template.pulls)}</span>}
        </div>
      </div>
    </article>
  );
};

const TemplateSources: React.FC<{
  onSourcesChanged: () => void;
  notify: (notice: Notice) => void;
}> = ({ onSourcesChanged, notify }) => {
  const [sources, setSources] = useState<TemplateSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newURL, setNewURL] = useState('');
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<Record<string, ValidationResult>>({});

  const loadSources = async () => {
    setLoading(true);
    try {
      const response = await templateApi.getSources();
      setSources(response.data);
    } catch (error) {
      notify({ kind: 'error', text: errorMessage(error, 'Failed to load template sources') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  const toggleSource = async (source: TemplateSource) => {
    const enabled = !source.enabled;
    setSources((current) => current.map((item) => item.id === source.id ? { ...item, enabled } : item));
    try {
      await templateApi.updateSource(source.id, { enabled });
      templateCache = null;
      onSourcesChanged();
    } catch (error) {
      setSources((current) => current.map((item) => item.id === source.id ? source : item));
      notify({ kind: 'error', text: errorMessage(error, 'Failed to update source') });
    }
  };

  const addSource = async () => {
    if (!newName.trim() || !newURL.trim()) return;
    try {
      const response = await templateApi.addSource(newName.trim(), newURL.trim());
      setSources((current) => [...current, response.data]);
      setNewName('');
      setNewURL('');
      setAddingNew(false);
      templateCache = null;
      onSourcesChanged();
      notify({ kind: 'success', text: 'Source added' });
    } catch (error) {
      notify({ kind: 'error', text: errorMessage(error, 'Failed to add source') });
    }
  };

  const removeSource = async (source: TemplateSource) => {
    try {
      await templateApi.deleteSource(source.id);
      setSources((current) => current.filter((item) => item.id !== source.id));
      templateCache = null;
      onSourcesChanged();
      notify({ kind: 'success', text: 'Source removed' });
    } catch (error) {
      notify({ kind: 'error', text: errorMessage(error, 'Failed to remove source') });
    }
  };

  const validateSources = async () => {
    setValidating(true);
    setValidation({});
    const entries = await Promise.all(sources.map(async (source): Promise<[string, ValidationResult]> => {
      try {
        const response = await fetch(source.url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) return [source.sourceId, { ok: false, error: `HTTP ${response.status}` }];
        const data = await response.json();
        const items = Array.isArray(data) ? data : (data.templates || data.images || []);
        return [source.sourceId, { ok: true, count: Array.isArray(items) ? items.length : 0 }];
      } catch (error) {
        return [source.sourceId, { ok: false, error: error instanceof Error ? error.message : 'Connection failed' }];
      }
    }));
    const results = Object.fromEntries(entries);
    setValidation(results);
    setValidating(false);
    const failures = Object.values(results).filter((result) => !result.ok).length;
    notify(failures > 0
      ? { kind: 'warning', text: `${failures} source(s) failed validation` }
      : { kind: 'success', text: 'All sources are reachable' });
  };

  const disableInactive = async () => {
    const inactive = sources.filter((source) => source.enabled && validation[source.sourceId] && !validation[source.sourceId].ok);
    try {
      await Promise.all(inactive.map((source) => templateApi.updateSource(source.id, { enabled: false })));
      setSources((current) => current.map((source) => inactive.some((item) => item.id === source.id) ? { ...source, enabled: false } : source));
      templateCache = null;
      onSourcesChanged();
      notify({ kind: 'success', text: `Disabled ${inactive.length} inactive source(s)` });
    } catch (error) {
      notify({ kind: 'error', text: errorMessage(error, 'Failed to disable inactive sources') });
      loadSources();
    }
  };

  const hasFailedValidation = Object.values(validation).some((result) => !result.ok);

  return (
    <div className="max-w-3xl space-y-4 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">Configure template catalog sources. Templates are fetched and cached for 1 hour.</p>
        <div className="flex flex-wrap items-center gap-2">
          <SmallButton onClick={validateSources} disabled={validating}>
            {validating ? <Spinner className="h-3.5 w-3.5" /> : <ShieldIcon className="h-3.5 w-3.5" />}
            {validating ? 'Validating...' : 'Validate'}
          </SmallButton>
          {hasFailedValidation && <SmallButton onClick={disableInactive}><CircleXIcon className="h-3.5 w-3.5" /> Disable inactive</SmallButton>}
          <SmallButton primary onClick={() => setAddingNew((value) => !value)}><PlusIcon className="h-3.5 w-3.5" /> Add source</SmallButton>
        </div>
      </div>

      {addingNew && (
        <div className="rounded-xl border border-dashed border-green-500/40 bg-slate-800/40 p-3">
          <div className="flex flex-col items-end gap-3 sm:flex-row">
            <label className="w-full flex-1 space-y-1 text-xs font-medium text-slate-400">
              Name
              <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="My templates" className="source-input" />
            </label>
            <label className="w-full flex-[2] space-y-1 text-xs font-medium text-slate-400">
              URL
              <input value={newURL} onChange={(event) => setNewURL(event.target.value)} placeholder="https://example.com/templates.json" className="source-input" />
            </label>
            <SmallButton primary onClick={addSource} disabled={!newName.trim() || !newURL.trim()}>Add</SmallButton>
            <SmallButton onClick={() => setAddingNew(false)}>Cancel</SmallButton>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-slate-500"><Spinner className="mr-2 h-5 w-5" /> Loading sources...</div>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => {
            const result = validation[source.sourceId];
            return (
              <div key={source.id} className="rounded-xl border border-slate-700/60 bg-slate-800/50 px-4 py-3">
                <div className="flex items-center gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900/70">
                    {result?.ok ? <CircleCheckIcon className="h-4 w-4 text-green-400" /> : result ? <CircleXIcon className="h-4 w-4 text-red-400" /> : <GlobeIcon className="h-4 w-4 text-slate-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">{source.name}</span>
                      {result?.ok && result.count !== undefined && <span className="text-xs text-slate-500">({result.count} templates)</span>}
                    </div>
                    <div className="truncate text-xs text-slate-500">{source.url}</div>
                    {result && !result.ok && <div className="mt-0.5 text-xs text-red-400">{result.error}</div>}
                  </div>
                  <button type="button" role="switch" aria-checked={source.enabled} onClick={() => toggleSource(source)} className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${source.enabled ? 'bg-green-500' : 'bg-slate-600'}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${source.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                  {!source.builtin && <button type="button" onClick={() => removeSource(source)} title="Remove source" className="rounded-md p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400"><TrashIcon className="h-4 w-4" /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const SmallButton: React.FC<{ primary?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }> = ({ primary, disabled, onClick, children }) => (
  <button type="button" onClick={onClick} disabled={disabled} className={`flex h-8 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${primary ? 'border-green-500/30 bg-green-500/15 text-green-400 hover:bg-green-500/25' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>{children}</button>
);

const DeployModal: React.FC<{
  initialName: string;
  initialCompose: string;
  onClose: () => void;
  onSuccess: (name: string) => void;
}> = ({ initialName, initialCompose, onClose, onSuccess }) => {
  const [name, setName] = useState(initialName || 'stack');
  const [compose, setCompose] = useState(initialCompose);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && !deploying && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deploying, onClose]);

  const deploy = async () => {
    setError('');
    setDeploying(true);
    try {
      await templateApi.deploy(name.trim(), compose);
      onSuccess(name.trim());
    } catch (requestError) {
      setError(errorMessage(requestError, 'Failed to deploy stack'));
    } finally {
      setDeploying(false);
    }
  };

  const copyCompose = async () => {
    try {
      await navigator.clipboard.writeText(compose);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const validName = /^[a-z0-9][a-z0-9_-]*$/.test(name);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => event.target === event.currentTarget && !deploying && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="deploy-template-title" className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-4">
          <div>
            <h3 id="deploy-template-title" className="text-base font-bold text-slate-100">Create compose stack</h3>
            <p className="mt-0.5 text-xs text-slate-500">Review the generated Compose file before deployment.</p>
          </div>
          <button type="button" onClick={onClose} disabled={deploying} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"><CloseIcon className="h-5 w-5" /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
          <label className="space-y-1.5 text-xs font-semibold text-slate-400">
            Stack name
            <input value={name} onChange={(event) => setName(slugify(event.target.value))} className={`block h-9 w-full rounded-lg border bg-slate-800 px-3 text-sm text-slate-200 outline-none ${validName ? 'border-slate-700 focus:border-green-500/60' : 'border-red-500/60'}`} />
          </label>

          <div className="min-h-80 flex-1 space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="template-compose" className="text-xs font-semibold text-slate-400">Compose file</label>
              <button type="button" onClick={copyCompose} className="text-xs text-slate-500 hover:text-green-400">{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <textarea id="template-compose" value={compose} onChange={(event) => setCompose(event.target.value)} spellCheck={false} className="h-[46vh] min-h-80 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-300 outline-none focus:border-green-500/50" />
          </div>
          {error && <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-700/60 px-5 py-4">
          <SmallButton onClick={onClose} disabled={deploying}>Cancel</SmallButton>
          <SmallButton primary onClick={deploy} disabled={deploying || !validName || !compose.trim()}>
            {deploying && <Spinner className="h-3.5 w-3.5" />}
            {deploying ? 'Deploying...' : 'Create & start'}
          </SmallButton>
        </div>
      </div>
    </div>
  );
};

const NoticeBanner: React.FC<{ notice: NonNullable<Notice>; onClose: () => void }> = ({ notice, onClose }) => {
  const colors = {
    success: 'border-green-500/30 bg-green-500/15 text-green-300',
    error: 'border-red-500/30 bg-red-500/15 text-red-300',
    warning: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
  };
  return (
    <div className={`fixed right-4 top-4 z-[60] flex max-w-md items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${colors[notice.kind]}`}>
      <span>{notice.text}</span>
      <button type="button" onClick={onClose} className="ml-auto opacity-60 hover:opacity-100"><CloseIcon className="h-4 w-4" /></button>
    </div>
  );
};

const TemplateSkeletons = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    {Array.from({ length: 12 }, (_, index) => (
      <div key={index} className="animate-pulse rounded-xl border border-slate-700/60 bg-slate-800/50 p-4">
        <div className="flex gap-3"><div className="h-9 w-9 rounded-lg bg-slate-700" /><div className="flex-1 space-y-2"><div className="h-3 w-3/4 rounded bg-slate-700" /><div className="h-3 w-1/3 rounded bg-slate-700" /></div></div>
        <div className="mt-4 space-y-2"><div className="h-2.5 rounded bg-slate-700" /><div className="h-2.5 w-2/3 rounded bg-slate-700" /></div>
        <div className="mt-4 flex gap-2"><div className="h-4 w-14 rounded-full bg-slate-700" /><div className="h-4 w-16 rounded-full bg-slate-700" /></div>
      </div>
    ))}
  </div>
);

const EmptyTemplates: React.FC<{ hasTemplates: boolean; onOpenSources: () => void }> = ({ hasTemplates, onOpenSources }) => (
  <div className="flex h-full min-h-72 items-center justify-center">
    <div className="max-w-sm text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800"><PackageIcon className="h-6 w-6 text-slate-500" /></div>
      <h3 className="text-sm font-semibold text-slate-200">{hasTemplates ? 'No templates match your filters' : 'No template sources configured'}</h3>
      <p className="mt-1 text-xs text-slate-500">{hasTemplates ? 'Try adjusting your search or filter criteria.' : 'Enable a catalog in the Sources tab.'}</p>
      {!hasTemplates && <button type="button" onClick={onOpenSources} className="mt-3 text-xs font-semibold text-green-400 hover:underline">Open sources</button>}
    </div>
  </div>
);

type IconProps = { className?: string };
const Svg: React.FC<IconProps & { children: React.ReactNode; spin?: boolean }> = ({ className = 'h-4 w-4', children, spin }) => (
  <svg className={`${className} ${spin ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>{children}</svg>
);
const PackageIcon = (props: IconProps) => <Svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25 12 3 3 8.25m18 0-9 5.25m9-5.25v7.5L12 21m0-7.5L3 8.25m9 5.25V21M3 8.25v7.5L12 21" /></Svg>;
const SettingsIcon = (props: IconProps) => <Svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9m-15 0h2.25m3.75 12h9m-15 0h2.25M15 12h4.5m-15 0h6.75M8.25 3.75v4.5m0 7.5v4.5M13.5 9.75v4.5" /></Svg>;
const SearchIcon = (props: IconProps) => <Svg {...props}><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m20 20-4-4" /></Svg>;
const ChevronIcon = (props: IconProps) => <Svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" /></Svg>;
const ExternalIcon = (props: IconProps) => <Svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5M10.5 13.5 21 3m0 0h-5.25M21 3v5.25" /></Svg>;
const ShieldIcon = (props: IconProps) => <Svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M12 3c2.3 1.8 4.8 2.2 7.5 2.25v5.5c0 4.5-3 8.25-7.5 10.25-4.5-2-7.5-5.75-7.5-10.25v-5.5C7.2 5.2 9.7 4.8 12 3Z" /></Svg>;
const PlusIcon = (props: IconProps) => <Svg {...props}><path strokeLinecap="round" d="M12 5v14M5 12h14" /></Svg>;
const TrashIcon = (props: IconProps) => <Svg {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 7.5h15m-9-3h3m-7.5 3 .75 12h10.5l.75-12M10 11v5m4-5v5" /></Svg>;
const GlobeIcon = (props: IconProps) => <Svg {...props}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M3 12h18M12 3c2.2 2.45 3.3 5.45 3.3 9S14.2 18.55 12 21c-2.2-2.45-3.3-5.45-3.3-9S9.8 5.45 12 3Z" /></Svg>;
const CircleCheckIcon = (props: IconProps) => <Svg {...props}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="m8 12 2.5 2.5L16 9" /></Svg>;
const CircleXIcon = (props: IconProps) => <Svg {...props}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="m9 9 6 6m0-6-6 6" /></Svg>;
const CloseIcon = (props: IconProps) => <Svg {...props}><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></Svg>;
const Spinner = (props: IconProps) => <Svg {...props} spin><path strokeLinecap="round" d="M20 12a8 8 0 1 1-3-6.25" /></Svg>;
