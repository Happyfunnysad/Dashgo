import axios, { AxiosInstance } from 'axios';
import { authStorage } from './authStorage';

const API_BASE_URL = '/api';

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// Attach auth token to every request
api.interceptors.request.use((config) => {
  const token = authStorage.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      authStorage.clearToken();
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export interface Container {
  id: string;
  shortId: string;
  name: string;
  image: string;
  status: string;
  health: 'healthy' | 'unhealthy' | 'starting' | 'none';
  ports: any[];
  created: number;
  isPublished: boolean;
  alias: string | null;
  displayName: string;
  primaryPort: number | null;
  protocol: string | null;
  accessLinks: Array<{ label: string; url: string; type: string }>;
  project?: string;
}

export interface Settings {
  localNetworkIp: string;
  tailscaleIp: string;
  tailscaleHostname: string;
  domain: string;
  defaultProtocol: 'http' | 'https';
  autoRefreshInterval: number;
  webhookUrl?: string;
}

export interface Stats {
  totalContainers: number;
  running: number;
  healthy: number;
  starting: number;
  unhealthy: number;
  publishedServices: number;
}

export interface ContainerMetrics {
  cpuPercentage: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number;
  memoryPercentage: number;
}

export interface ContainerDetails {
  env: string[];
  mounts: Array<{ type: string; source: string; destination: string; mode: string; rw: boolean }>;
  networks: string[];
}

export interface TailscalePeer {
  ID: string;
  HostName: string;
  DNSName?: string;
  OS: string;
  TailscaleIPs: string[];
  Online: boolean;
}

export interface TailscaleStatus {
  BackendState?: string;
  AuthURL?: string;
  Self: {
    HostName: string;
    DNSName?: string;
    OS: string;
    TailscaleIPs: string[];
    Online: boolean;
  };
  Peer: Record<string, TailscalePeer>;
}

export interface ThermalZone {
  zone: string;
  label: string;
  temperature: number;
}

export interface HardwareStats {
  cpuCores: number;
  cpuUsagePercent: number;
  loadAvg1: number;
  loadAvg5: number;
  loadAvg15: number;
  memoryTotalBytes: number;
  memoryUsedBytes: number;
  memoryAvailableBytes: number;
  memoryUsagePercent: number;
  diskTotalBytes: number;
  diskUsedBytes: number;
  diskFreeBytes: number;
  diskUsagePercent: number;
  cpuTempCelsius: number;
  temperatures: ThermalZone[];
  hostname: string;
  platform: string;
  kernelVersion: string;
  uptimeSeconds: number;
  uptimeFormatted: string;
}

export interface ImageUpdateStatus {
  containerId: string;
  containerName: string;
  image: string;
  currentDigest: string;
  latestDigest: string;
  updateAvailable: boolean;
  checkedAt: number;
}

export const containerApi = {
  getContainers: () => api.get<Container[]>('/containers'),
  getStats: () => api.get<Stats>('/stats'),
  getSettings: () => api.get<Settings>('/settings'),
  updateSettings: (settings: Partial<Settings>) => api.put<Settings>('/settings', settings),
  updateAlias: (containerId: string, alias: any) =>
    api.put(`/aliases/${containerId}`, alias),
  deleteAlias: (containerId: string) => api.delete(`/aliases/${containerId}`),
  getContainerStats: (id: string) => api.get<ContainerMetrics>(`/containers/${id}/stats`),
  getContainerLogs: (id: string) => api.get<{logs: string}>(`/containers/${id}/logs`),
  getContainerInspect: (id: string) => api.get<ContainerDetails>(`/containers/${id}/inspect`),
  getTailscaleStatus: () => api.get<TailscaleStatus>('/tailscale/status'),
  authTailscale: (authKey: string) => api.post('/tailscale/auth', { authKey }),
  deleteTailscaleDevice: (deviceId: string, apiKey: string) => 
    api.delete(`/tailscale/devices/${deviceId}`, { headers: { 'X-Tailscale-Api-Key': apiKey } }),
  startContainer: (id: string) => api.post(`/containers/${id}/start`),
  stopContainer: (id: string) => api.post(`/containers/${id}/stop`),
  restartContainer: (id: string) => api.post(`/containers/${id}/restart`),

  // Hardware monitoring
  getHardwareStats: () => api.get<HardwareStats>('/hardware'),

  // Project (Stack) actions
  startProject: (name: string) => api.post(`/projects/${name}/start`),
  stopProject: (name: string) => api.post(`/projects/${name}/stop`),
  restartProject: (name: string) => api.post(`/projects/${name}/restart`),

  // Update manager
  getUpdateStatuses: () => api.get<ImageUpdateStatus[]>('/updates'),
  triggerUpdateCheck: () => api.post<ImageUpdateStatus[]>('/updates/check'),
};

export const authApi = {
  getStatus: () => api.get<{ configured: boolean }>('/auth/status'),
  login: (password: string) => api.post<{ token: string }>('/auth/login', { password }),
  setup: (password: string) => api.post<{ token: string; message: string }>('/auth/setup', { password }),
  logout: () => api.post('/auth/logout'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
  resetPassword: () => api.post('/auth/reset'),
};

export default api;
