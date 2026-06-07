import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { containerApi, Container, Stats, HardwareStats, ImageUpdateStatus, ContainerMetrics, ContainerDetails } from '../utils/api';
import { formatDate, formatRelativeTime } from '../utils/formatters';
import { LogsModal } from '../components/LogsModal';
import { IconRefresh, IconNetwork } from '../components/icons/Icons';

interface DashboardPageProps {}

// --- Helpers ---
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const tempColor = (t: number) => t >= 70 ? '#ef4444' : t >= 55 ? '#f59e0b' : '#22c55e';

type ViewMode = 'services' | 'containers' | 'attention' | 'updates';

// =============================================================
// Sub-components
// =============================================================

// --- Status Chip (inline) ---
const StatusChip: React.FC<{ status: string }> = ({ status }) => {
  const running = status === 'running';
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${running ? 'text-green-400' : 'text-slate-500'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-green-400' : 'bg-slate-600'}`} />
      {running ? 'Running' : 'Stopped'}
    </span>
  );
};

const HealthChip: React.FC<{ health: string }> = ({ health }) => {
  if (!health || health === 'none') return null;
  const colors: Record<string, string> = {
    healthy: 'text-green-400',
    unhealthy: 'text-red-400',
    starting: 'text-yellow-400',
  };
  const icons: Record<string, string> = { healthy: '✓', unhealthy: '✗', starting: '⟳' };
  return (
    <span className={`text-xs font-medium ${colors[health] || 'text-slate-500'}`}>
      {icons[health] || '?'} {health.charAt(0).toUpperCase() + health.slice(1)}
    </span>
  );
};

// --- Host Status Bar ---
const HostBar: React.FC<{ hw: HardwareStats | null; stats: Stats | null; updates: ImageUpdateStatus[]; loading: boolean; onRefresh: () => void }> = ({ hw, stats, updates, loading, onRefresh }) => {
  const updatesAvail = updates.filter(u => u.updateAvailable).length;
  return (
    <div className="flex items-center gap-3 flex-wrap mb-6">
      {/* Host status */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 rounded-lg border border-green-500/20">
        <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.4)]" />
        <span className="text-xs font-semibold text-green-400">{hw?.hostname || 'Host'}</span>
      </div>

      {/* Metrics pills */}
      {hw && (
        <>
          <Pill label="CPU" value={`${hw.cpuUsagePercent.toFixed(0)}%`} warn={hw.cpuUsagePercent > 80} />
          <Pill label="RAM" value={`${formatBytes(hw.memoryUsedBytes)} / ${formatBytes(hw.memoryTotalBytes)}`} warn={hw.memoryUsagePercent > 85} />
          <Pill label="Disk" value={`${hw.diskUsagePercent.toFixed(0)}%`} warn={hw.diskUsagePercent > 90} />
          {hw.cpuTempCelsius > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700/50">
              <svg className="w-3.5 h-3.5" style={{ color: tempColor(hw.cpuTempCelsius) }} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" /></svg>
              <span className="text-xs font-mono" style={{ color: tempColor(hw.cpuTempCelsius) }}>{hw.cpuTempCelsius.toFixed(0)}°C</span>
            </div>
          )}
        </>
      )}

      {/* Tailnet */}
      <Pill label="Tailnet" value="Connected" color="text-blue-400" />

      {/* Updates */}
      {updatesAvail > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
          <span className="text-xs font-semibold text-cyan-400">{updatesAvail} update{updatesAvail > 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Spacer + refresh */}
      <div className="ml-auto">
        <button onClick={onRefresh} disabled={loading} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 text-slate-200 text-xs font-medium rounded-lg transition-colors">
          <IconRefresh className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
    </div>
  );
};

const Pill: React.FC<{ label: string; value: string; warn?: boolean; color?: string }> = ({ label, value, warn, color }) => (
  <div className={`flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 rounded-lg border ${warn ? 'border-red-500/30' : 'border-slate-700/50'}`}>
    <span className="text-[10px] text-slate-500 uppercase font-semibold">{label}</span>
    <span className={`text-xs font-mono font-medium ${warn ? 'text-red-400' : color || 'text-slate-300'}`}>{value}</span>
  </div>
);

// --- Attention Block ---
const AttentionBlock: React.FC<{ containers: Container[]; updates: ImageUpdateStatus[] }> = ({ containers, updates }) => {
  const problems: { icon: string; text: string; severity: 'error' | 'warn' }[] = [];

  containers.forEach(c => {
    if (c.health === 'unhealthy') problems.push({ icon: '🔴', text: `${c.displayName}: unhealthy`, severity: 'error' });
    if (c.status !== 'running' && c.status !== 'created') problems.push({ icon: '⚪', text: `${c.displayName}: ${c.status}`, severity: 'warn' });
  });
  updates.filter(u => u.updateAvailable).forEach(u => {
    problems.push({ icon: '🔵', text: `${u.containerName}: new image available`, severity: 'warn' });
  });

  if (problems.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-green-500/5 rounded-xl border border-green-500/15 mb-6">
        <span className="w-2 h-2 rounded-full bg-green-400" />
        <span className="text-sm font-medium text-green-400">All systems operational</span>
      </div>
    );
  }

  return (
    <div className="bg-amber-500/5 rounded-xl border border-amber-500/15 p-4 mb-6">
      <p className="text-sm font-semibold text-amber-400 mb-2">{problems.length} item{problems.length > 1 ? 's' : ''} need attention</p>
      <div className="space-y-1">
        {problems.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
            <span>{p.icon}</span>
            <span>{p.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- KPI Cards ---
const KPICards: React.FC<{ stats: Stats | null; updates: ImageUpdateStatus[] }> = ({ stats, updates }) => {
  if (!stats) return null;
  const updatesAvail = updates.filter(u => u.updateAvailable).length;
  const healthText = [
    stats.healthy > 0 && `${stats.healthy} healthy`,
    stats.unhealthy > 0 && `${stats.unhealthy} unhealthy`,
    stats.starting > 0 && `${stats.starting} starting`,
  ].filter(Boolean).join(' · ') || 'No health checks';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <KPICard label="Containers" value={`${stats.running}`} sub="running" color="text-blue-400" />
      <KPICard label="Health" value={healthText} color={stats.unhealthy > 0 ? 'text-red-400' : 'text-green-400'} />
      <KPICard label="Published" value={`${stats.publishedServices}`} sub="services" color="text-purple-400" />
      <KPICard label="Updates" value={updatesAvail > 0 ? `${updatesAvail} available` : 'Up to date'} color={updatesAvail > 0 ? 'text-cyan-400' : 'text-slate-400'} />
    </div>
  );
};

const KPICard: React.FC<{ label: string; value: string; sub?: string; color: string }> = ({ label, value, sub, color }) => (
  <div className="bg-slate-800/60 rounded-xl border border-slate-700/40 px-5 py-4">
    <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-1">{label}</p>
    <p className={`text-sm font-bold ${color}`}>
      {value}
      {sub && <span className="text-slate-500 font-normal ml-1">{sub}</span>}
    </p>
  </div>
);

// --- Details Drawer ---
const DetailsDrawer: React.FC<{
  container: Container;
  updates: ImageUpdateStatus[];
  onClose: () => void;
  onAction: (id: string, action: 'start' | 'stop' | 'restart') => void;
  onLogs: (id: string, name: string) => void;
}> = ({ container, updates, onClose, onAction, onLogs }) => {
  const [metrics, setMetrics] = useState<ContainerMetrics | null>(null);
  const [details, setDetails] = useState<ContainerDetails | null>(null);
  const [tab, setTab] = useState<'overview' | 'inspect'>('overview');

  useEffect(() => {
    containerApi.getContainerStats(container.id).then(r => setMetrics(r.data)).catch(() => {});
    containerApi.getContainerInspect(container.id).then(r => setDetails(r.data)).catch(() => {});
  }, [container.id]);

  const updateInfo = updates.find(u => container.id.startsWith(u.containerId));

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-[420px] bg-slate-900 border-l border-slate-700/50 z-50 overflow-y-auto shadow-2xl animate-slide-in">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h3 className="text-lg font-bold text-slate-100">{container.displayName}</h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{container.shortId}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700/50 px-6">
          {(['overview', 'inspect'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${tab === t ? 'text-blue-400 border-blue-400' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              {t}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 space-y-5">
          {tab === 'overview' && (
            <>
              {/* Status */}
              <DrawerSection title="Status">
                <div className="flex items-center gap-4">
                  <StatusChip status={container.status} />
                  <HealthChip health={container.health} />
                </div>
              </DrawerSection>

              {/* Image */}
              <DrawerSection title="Image">
                <p className="text-xs font-mono text-slate-400 break-all">{container.image}</p>
                {updateInfo?.updateAvailable && (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                    <span className="text-xs font-semibold text-cyan-400">⬆ Update available</span>
                  </div>
                )}
              </DrawerSection>

              {/* Uptime */}
              <DrawerSection title="Created">
                <p className="text-xs text-slate-400">{formatDate(container.created)} ({formatRelativeTime(container.created)})</p>
              </DrawerSection>

              {/* Resource Usage */}
              {metrics && (
                <DrawerSection title="Resource Usage">
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500">CPU</span>
                        <span className="text-slate-300 font-mono">{metrics.cpuPercentage.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(100, metrics.cpuPercentage)}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500">Memory</span>
                        <span className="text-slate-300 font-mono">{formatBytes(metrics.memoryUsageBytes)} / {formatBytes(metrics.memoryLimitBytes)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${Math.min(100, metrics.memoryPercentage)}%` }} />
                      </div>
                    </div>
                  </div>
                </DrawerSection>
              )}

              {/* Ports */}
              {container.ports.length > 0 && (
                <DrawerSection title="Ports">
                  <div className="space-y-1.5">
                    {container.ports.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700/50">
                        <span className="font-mono text-[11px] text-slate-300">{p.publicPort || '—'}</span>
                        <span className="text-slate-600">→</span>
                        <span className="font-mono text-[11px] text-slate-400">{p.privatePort}/{p.type}</span>
                      </div>
                    ))}
                  </div>
                </DrawerSection>
              )}

              {/* Access Links */}
              {container.accessLinks.length > 0 && (
                <DrawerSection title="Access Links">
                  <div className="space-y-1.5">
                    {container.accessLinks.map((link, i) => (
                      <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/15 rounded-lg border border-blue-500/20 text-blue-400 text-xs font-medium transition-colors">
                        <IconNetwork className="w-3.5 h-3.5" />
                        <span className="flex-1">{link.label}</span>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                      </a>
                    ))}
                  </div>
                </DrawerSection>
              )}

              {/* Actions */}
              <DrawerSection title="Actions">
                <div className="flex flex-wrap gap-2">
                  {container.status === 'running' ? (
                    <>
                      <DrawerAction label="Restart" color="yellow" onClick={() => onAction(container.id, 'restart')} />
                      <DrawerAction label="Stop" color="red" onClick={() => onAction(container.id, 'stop')} />
                    </>
                  ) : (
                    <DrawerAction label="Start" color="green" onClick={() => onAction(container.id, 'start')} />
                  )}
                  <DrawerAction label="Logs" color="slate" onClick={() => onLogs(container.id, container.displayName)} />
                </div>
              </DrawerSection>
            </>
          )}

          {tab === 'inspect' && details && (
            <>
              <DrawerSection title="Environment">
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {details.env.map((e, i) => (
                    <p key={i} className="text-[11px] font-mono text-slate-400 break-all bg-slate-800 px-2 py-1 rounded">{e}</p>
                  ))}
                </div>
              </DrawerSection>

              <DrawerSection title="Mounts">
                {details.mounts.map((m, i) => (
                  <div key={i} className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-1.5 rounded mb-1">
                    <span className="text-slate-500">{m.source}</span> → <span>{m.destination}</span>
                    <span className="ml-2 text-slate-600">{m.rw ? 'rw' : 'ro'}</span>
                  </div>
                ))}
              </DrawerSection>

              <DrawerSection title="Networks">
                <div className="flex flex-wrap gap-1.5">
                  {details.networks.map((n, i) => (
                    <span key={i} className="px-2 py-1 bg-slate-800 text-[11px] text-slate-400 rounded border border-slate-700/50">{n}</span>
                  ))}
                </div>
              </DrawerSection>
            </>
          )}
        </div>
      </div>
    </>
  );
};

const DrawerSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-2">{title}</p>
    {children}
  </div>
);

const DrawerAction: React.FC<{ label: string; color: string; onClick: () => void }> = ({ label, color, onClick }) => {
  const colors: Record<string, string> = {
    green: 'bg-green-500/10 hover:bg-green-500/20 text-green-400 border-green-500/20',
    red: 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20',
    yellow: 'bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border-yellow-500/20',
    slate: 'bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600',
  };
  return (
    <button onClick={onClick} className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${colors[color] || colors.slate}`}>
      {label}
    </button>
  );
};

// =============================================================
// Main Dashboard
// =============================================================
export const DashboardPage: React.FC<DashboardPageProps> = () => {
  const [containers, setContainers] = useState<Container[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [hardware, setHardware] = useState<HardwareStats | null>(null);
  const [updates, setUpdates] = useState<ImageUpdateStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('services');
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
  const [logsContainer, setLogsContainer] = useState<{ id: string; name: string } | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, sRes, hwRes, uRes] = await Promise.all([
        containerApi.getContainers(),
        containerApi.getStats(),
        containerApi.getHardwareStats().catch(() => null),
        containerApi.getUpdateStatuses().catch(() => ({ data: [] })),
      ]);
      setContainers(cRes.data);
      setStats(sRes.data);
      if (hwRes?.data) setHardware(hwRes.data);
      if (uRes?.data) setUpdates(Array.isArray(uRes.data) ? uRes.data : []);
    } catch (e) {
      console.error('Error fetching data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
    const iv = setInterval(refreshData, 10000);
    return () => clearInterval(iv);
  }, [refreshData]);

  const handleAction = async (id: string, action: 'start' | 'stop' | 'restart') => {
    try {
      if (action === 'start') await containerApi.startContainer(id);
      if (action === 'stop') await containerApi.stopContainer(id);
      if (action === 'restart') await containerApi.restartContainer(id);
      await refreshData();
    } catch (e) {
      console.error(`Failed to ${action}:`, e);
    }
  };

  const handleProjectAction = async (name: string, action: 'start' | 'stop' | 'restart') => {
    try {
      if (action === 'start') await containerApi.startProject(name);
      if (action === 'stop') await containerApi.stopProject(name);
      if (action === 'restart') await containerApi.restartProject(name);
      await refreshData();
    } catch (e) {
      console.error(`Failed to ${action} project:`, e);
    }
  };

  const getUpdate = (id: string) => updates.find(u => id.startsWith(u.containerId));

  // Filtered containers based on view mode + search
  const filtered = useMemo(() => {
    let list = containers;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q) || c.displayName.toLowerCase().includes(q));
    }

    if (viewMode === 'attention') {
      list = list.filter(c => c.health === 'unhealthy' || c.status !== 'running');
    }
    if (viewMode === 'updates') {
      const updateIds = new Set(updates.filter(u => u.updateAvailable).map(u => u.containerId));
      list = list.filter(c => Array.from(updateIds).some(uid => c.id.startsWith(uid)));
    }

    return list;
  }, [containers, searchQuery, viewMode, updates]);

  // Group by project
  const grouped = useMemo(() => {
    return filtered.reduce((acc, c) => {
      const p = c.project || 'Other';
      if (!acc[p]) acc[p] = [];
      acc[p].push(c);
      return acc;
    }, {} as Record<string, Container[]>);
  }, [filtered]);

  return (
    <div className="flex-1 overflow-auto bg-slate-900">
      <div className="p-8">
        {/* 1. Host Status Bar */}
        <HostBar hw={hardware} stats={stats} updates={updates} loading={loading} onRefresh={refreshData} />

        {/* 2. Attention Block */}
        <AttentionBlock containers={containers} updates={updates} />

        {/* 3. KPI Cards */}
        <KPICards stats={stats} updates={updates} />

        {/* View Mode Tabs + Search */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex bg-slate-800 rounded-lg border border-slate-700/50 p-0.5">
            {([
              { id: 'services' as ViewMode, label: 'Services' },
              { id: 'containers' as ViewMode, label: 'Containers' },
              { id: 'attention' as ViewMode, label: 'Needs Attention' },
              { id: 'updates' as ViewMode, label: 'Updates' },
            ]).map(m => (
              <button
                key={m.id}
                onClick={() => setViewMode(m.id)}
                className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${
                  viewMode === m.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="ml-auto px-4 py-2 bg-slate-800 text-slate-100 text-sm rounded-lg border border-slate-700/50 focus:border-slate-500 outline-none transition-colors w-64"
          />
        </div>

        {/* 4. Container Table */}
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/40 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-900/30">
              <tr>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Service</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">State</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Endpoints</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Updates</th>
                <th className="px-5 py-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {Object.entries(grouped).map(([project, items]) => {
                const isCollapsed = collapsedProjects[project];
                const runningCount = items.filter(c => c.status === 'running').length;
                const isReal = project !== 'Other';

                return (
                  <React.Fragment key={project}>
                    {/* Project header */}
                    {(viewMode === 'services' || Object.keys(grouped).length > 1) && (
                      <tr className="bg-slate-900/20">
                        <td colSpan={5} className="px-5 py-2.5">
                          <div className="flex items-center gap-3">
                            <button onClick={() => setCollapsedProjects(p => ({ ...p, [project]: !p[project] }))} className="text-slate-500 hover:text-slate-300 transition-colors">
                              <svg className={`w-3.5 h-3.5 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                            </button>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{project}</span>
                            <span className="text-[10px] text-slate-600 font-mono">{runningCount}/{items.length}</span>
                            {isReal && (
                              <div className="ml-auto flex gap-1">
                                <button onClick={() => handleProjectAction(project, 'restart')} className="px-2 py-1 text-[10px] font-semibold text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 rounded transition-colors">Restart</button>
                                <button onClick={() => handleProjectAction(project, 'stop')} className="px-2 py-1 text-[10px] font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded transition-colors">Stop</button>
                                <button onClick={() => handleProjectAction(project, 'start')} className="px-2 py-1 text-[10px] font-semibold text-green-400 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded transition-colors">Start</button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Rows */}
                    {!isCollapsed && items.map(c => {
                      const upd = getUpdate(c.id);
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedContainer(c)}
                          className="hover:bg-slate-700/20 transition-colors cursor-pointer"
                        >
                          {/* Service */}
                          <td className="px-5 py-3">
                            <p className="text-sm font-medium text-slate-100">{c.displayName}</p>
                            <p className="text-[11px] text-slate-500 font-mono truncate max-w-[250px]">{c.image.split('/').pop()}</p>
                          </td>
                          {/* State */}
                          <td className="px-5 py-3">
                            <div className="flex flex-col gap-0.5">
                              <StatusChip status={c.status} />
                              <HealthChip health={c.health} />
                            </div>
                          </td>
                          {/* Endpoints */}
                          <td className="px-5 py-3">
                            {c.accessLinks.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {c.accessLinks.slice(0, 2).map((l, i) => (
                                  <a
                                    key={i}
                                    href={l.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-medium rounded hover:bg-blue-500/20 transition-colors"
                                  >
                                    {l.label}
                                  </a>
                                ))}
                                {c.accessLinks.length > 2 && <span className="text-[10px] text-slate-500">+{c.accessLinks.length - 2}</span>}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-600">—</span>
                            )}
                          </td>
                          {/* Updates */}
                          <td className="px-5 py-3">
                            {upd?.updateAvailable ? (
                              <span className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px] font-bold uppercase rounded-md">
                                Update
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-600">—</span>
                            )}
                          </td>
                          {/* Actions */}
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                              {c.status === 'running' ? (
                                <button onClick={() => handleAction(c.id, 'restart')} className="px-2.5 py-1.5 text-[11px] font-medium text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 rounded-lg transition-colors">Restart</button>
                              ) : (
                                <button onClick={() => handleAction(c.id, 'start')} className="px-2.5 py-1.5 text-[11px] font-medium text-green-400 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded-lg transition-colors">Start</button>
                              )}
                              <button onClick={() => setLogsContainer({ id: c.id, name: c.displayName })} className="px-2.5 py-1.5 text-[11px] font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">Logs</button>
                              <button onClick={() => setSelectedContainer(c)} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded-lg transition-colors" title="Details">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-slate-500 text-sm">
              {viewMode === 'attention' ? 'No issues found — all systems operational' : viewMode === 'updates' ? 'All images are up to date' : containers.length === 0 ? 'No containers found' : 'No containers match the search'}
            </div>
          )}
        </div>
      </div>

      {/* 5. Details Drawer */}
      {selectedContainer && (
        <DetailsDrawer
          container={selectedContainer}
          updates={updates}
          onClose={() => setSelectedContainer(null)}
          onAction={handleAction}
          onLogs={(id, name) => { setLogsContainer({ id, name }); setSelectedContainer(null); }}
        />
      )}

      {/* Logs Modal */}
      {logsContainer && (
        <LogsModal
          containerId={logsContainer.id}
          containerName={logsContainer.name}
          onClose={() => setLogsContainer(null)}
        />
      )}
    </div>
  );
};
