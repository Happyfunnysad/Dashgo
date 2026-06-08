import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { containerApi, Container, ContainerDetails, HardwareStats, ImageUpdateStatus, Stats } from '../utils/api';
import { LogsModal } from '../components/LogsModal';
import { IconRefresh } from '../components/icons/Icons';
import { formatDate } from '../utils/formatters';

type ViewMode = 'services' | 'containers' | 'attention' | 'updates';

const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${parseFloat((bytes / Math.pow(1024, index)).toFixed(1))} ${units[index]}`;
};

const StatusDot: React.FC<{ running: boolean }> = ({ running }) => (
  <span className={`h-2 w-2 shrink-0 rounded-full ${running ? 'bg-green-400' : 'bg-slate-600'}`} />
);

const MobileDetailsSheet: React.FC<{
  container: Container;
  update?: ImageUpdateStatus;
  onClose: () => void;
  onAction: (id: string, action: 'start' | 'stop' | 'restart') => Promise<void>;
  onLogs: (id: string, name: string) => void;
}> = ({ container, update, onClose, onAction, onLogs }) => {
  const [details, setDetails] = useState<ContainerDetails | null>(null);

  useEffect(() => {
    setDetails(null);
    containerApi.getContainerInspect(container.id).then(response => setDetails(response.data)).catch(() => {});
  }, [container.id]);

  return (
    <>
      <button type="button" aria-label="Close details" className="fixed inset-0 bottom-16 z-30 bg-black/50 md:hidden" onClick={onClose} />
      <section className="fixed inset-x-0 bottom-16 z-40 max-h-[82vh] overflow-y-auto rounded-t-2xl border-t border-slate-700 bg-slate-900 shadow-2xl md:hidden">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-700/60 bg-slate-900 px-4 py-4">
          <div className="min-w-0">
            <div className="mb-2 h-1 w-12 rounded-full bg-slate-700" />
            <h3 className="truncate text-lg font-bold text-slate-100">{container.displayName}</h3>
            <p className="mt-0.5 font-mono text-xs text-slate-500">{container.shortId}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-slate-200" aria-label="Close">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 px-4 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${container.status === 'running' ? 'border-green-500/20 bg-green-500/10 text-green-400' : 'border-slate-600/40 bg-slate-800 text-slate-400'}`}>
              <StatusDot running={container.status === 'running'} />
              {container.status}
            </span>
            {container.health !== 'none' && (
              <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300">{container.health}</span>
            )}
            {update?.updateAvailable && (
              <span className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-xs font-semibold text-cyan-400">Update available</span>
            )}
          </div>

          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Image</p>
            <p className="break-all font-mono text-xs text-slate-300">{container.image}</p>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Endpoints</p>
            {container.accessLinks.length ? (
              <div className="flex flex-wrap gap-2">
                {container.accessLinks.map(link => (
                  <a key={`${link.type}-${link.url}`} href={link.url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-400">
                    {link.label}
                  </a>
                ))}
              </div>
            ) : <p className="text-xs text-slate-600">No published endpoints</p>}
          </div>

          {details && (
            <div className="space-y-4 border-t border-slate-800 pt-4">
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Networks</p>
                <div className="flex flex-wrap gap-1.5">
                  {details.networks.length ? details.networks.map(network => <span key={network} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-400">{network}</span>) : <span className="text-xs text-slate-600">—</span>}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Mounts</p>
                <div className="space-y-1.5">
                  {details.mounts.length ? details.mounts.map((mount, index) => (
                    <p key={`${mount.destination}-${index}`} className="break-all font-mono text-[11px] text-slate-400">{mount.destination} <span className="text-slate-600">({mount.rw ? 'rw' : 'ro'})</span></p>
                  )) : <span className="text-xs text-slate-600">—</span>}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-4">
            {container.status === 'running' ? (
              <button type="button" onClick={() => onAction(container.id, 'restart')} className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2.5 text-sm font-semibold text-yellow-400">Restart</button>
            ) : (
              <button type="button" onClick={() => onAction(container.id, 'start')} className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2.5 text-sm font-semibold text-green-400">Start</button>
            )}
            <button type="button" onClick={() => onLogs(container.id, container.displayName)} className="rounded-lg bg-slate-800 px-3 py-2.5 text-sm font-semibold text-slate-200">Logs</button>
            {container.status === 'running' && (
              <button type="button" onClick={() => onAction(container.id, 'stop')} className="col-span-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-400">Stop</button>
            )}
          </div>
        </div>
      </section>
    </>
  );
};

export const MobileDashboardPage: React.FC = () => {
  const [containers, setContainers] = useState<Container[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [hardware, setHardware] = useState<HardwareStats | null>(null);
  const [updates, setUpdates] = useState<ImageUpdateStatus[]>([]);
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
  const [logsContainer, setLogsContainer] = useState<{ id: string; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('services');
  const [loading, setLoading] = useState(false);

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const [containerResponse, statsResponse, hardwareResponse, updateResponse] = await Promise.all([
        containerApi.getContainers(),
        containerApi.getStats(),
        containerApi.getHardwareStats().catch(() => null),
        containerApi.getUpdateStatuses().catch(() => ({ data: [] as ImageUpdateStatus[] })),
      ]);
      setContainers(containerResponse.data);
      setStats(statsResponse.data);
      if (hardwareResponse?.data) setHardware(hardwareResponse.data);
      setUpdates(Array.isArray(updateResponse.data) ? updateResponse.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
    const interval = window.setInterval(refreshData, 10000);
    return () => window.clearInterval(interval);
  }, [refreshData]);

  const handleAction = async (id: string, action: 'start' | 'stop' | 'restart') => {
    if (action === 'start') await containerApi.startContainer(id);
    if (action === 'stop') await containerApi.stopContainer(id);
    if (action === 'restart') await containerApi.restartContainer(id);
    await refreshData();
  };

  const updateFor = (id: string) => updates.find(update => id.startsWith(update.containerId));

  const filtered = useMemo(() => {
    let list = containers;
    const query = searchQuery.trim().toLowerCase();
    if (query) list = list.filter(container => `${container.displayName} ${container.name} ${container.image}`.toLowerCase().includes(query));
    if (viewMode === 'services') list = list.filter(container => container.isPublished);
    if (viewMode === 'attention') list = list.filter(container => container.status !== 'running' || container.health === 'unhealthy');
    if (viewMode === 'updates') list = list.filter(container => updateFor(container.id)?.updateAvailable);
    return list;
  }, [containers, searchQuery, updates, viewMode]);

  const tabs: Array<{ id: ViewMode; label: string }> = [
    { id: 'services', label: 'Services' },
    { id: 'containers', label: 'Containers' },
    { id: 'attention', label: 'Attention' },
    { id: 'updates', label: 'Updates' },
  ];

  return (
    <div className="flex-1 overflow-auto bg-slate-900">
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Host</p>
            <h2 className="text-lg font-bold text-slate-100">{hardware?.hostname || 'Dashgo'}</h2>
            <p className="mt-1 text-xs text-slate-500">{stats?.running ?? 0} running · {stats?.publishedServices ?? 0} published</p>
          </div>
          <button type="button" onClick={refreshData} disabled={loading} className="rounded-lg border border-slate-700 bg-slate-800 p-2.5 text-slate-300" aria-label="Refresh">
            <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {hardware && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-slate-700/60 bg-slate-800/70 p-2.5"><p className="text-[10px] uppercase text-slate-500">CPU</p><p className="mt-1 text-sm font-semibold text-slate-200">{hardware.cpuUsagePercent.toFixed(0)}%</p></div>
            <div className="rounded-lg border border-slate-700/60 bg-slate-800/70 p-2.5"><p className="text-[10px] uppercase text-slate-500">RAM</p><p className="mt-1 text-sm font-semibold text-slate-200">{formatBytes(hardware.memoryUsedBytes)}</p></div>
            <div className="rounded-lg border border-slate-700/60 bg-slate-800/70 p-2.5"><p className="text-[10px] uppercase text-slate-500">Disk</p><p className="mt-1 text-sm font-semibold text-slate-200">{hardware.diskUsagePercent.toFixed(0)}%</p></div>
          </div>
        )}

        <div className="-mx-4 overflow-x-auto px-4">
          <div className="flex w-max gap-2">
            {tabs.map(tab => (
              <button type="button" key={tab.id} onClick={() => setViewMode(tab.id)} className={`whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold ${viewMode === tab.id ? 'border-slate-600 bg-slate-700 text-slate-100' : 'border-slate-700/60 bg-slate-800 text-slate-400'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <input type="search" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search containers..." className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-slate-500" />

        <div className="space-y-3">
          {filtered.map(container => {
            const update = updateFor(container.id);
            return (
              <button type="button" key={container.id} onClick={() => setSelectedContainer(container)} className="w-full rounded-xl border border-slate-700/60 bg-slate-800/70 p-4 text-left transition-colors hover:border-slate-600">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusDot running={container.status === 'running'} />
                      <h3 className="truncate text-sm font-semibold text-slate-100">{container.displayName}</h3>
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-slate-500">{container.image.split('/').pop()}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold uppercase text-slate-500">{container.status}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {container.project && <span className="rounded border border-slate-700 bg-slate-900/50 px-2 py-1 text-[10px] text-slate-500">{container.project}</span>}
                  {container.health !== 'none' && <span className="rounded border border-slate-700 bg-slate-900/50 px-2 py-1 text-[10px] text-slate-400">{container.health}</span>}
                  {container.accessLinks.length > 0 && <span className="rounded border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[10px] text-blue-400">{container.accessLinks.length} endpoint{container.accessLinks.length > 1 ? 's' : ''}</span>}
                  {update?.updateAvailable && <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-400">Update</span>}
                </div>
                <p className="mt-3 text-[11px] text-slate-600">Created {formatDate(container.created)}</p>
              </button>
            );
          })}
          {!filtered.length && <div className="py-10 text-center text-sm text-slate-500">No containers match this view</div>}
        </div>
      </div>

      {selectedContainer && (
        <MobileDetailsSheet
          container={selectedContainer}
          update={updateFor(selectedContainer.id)}
          onClose={() => setSelectedContainer(null)}
          onAction={handleAction}
          onLogs={(id, name) => { setLogsContainer({ id, name }); setSelectedContainer(null); }}
        />
      )}

      {logsContainer && <LogsModal containerId={logsContainer.id} containerName={logsContainer.name} onClose={() => setLogsContainer(null)} />}
    </div>
  );
};
