export function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}

export function formatRelativeTime(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp * 1000);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function getStatusColor(status: string): string {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('running')) return 'bg-green-500/10 text-green-400 border-green-500/20';
  if (statusLower.includes('exited')) return 'bg-red-500/10 text-red-400 border-red-500/20';
  if (statusLower.includes('created')) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  if (statusLower.includes('restarting')) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
}

export function getHealthColor(health: string): string {
  switch (health) {
    case 'healthy':
      return 'bg-green-500/10 text-green-400 border-green-500/20';
    case 'unhealthy':
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'starting':
      return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    case 'none':
    default:
      return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  }
}

export function getHealthLabel(health: string): string {
  switch (health) {
    case 'healthy':
      return 'Healthy ✓';
    case 'unhealthy':
      return 'Unhealthy ✗';
    case 'starting':
      return 'Starting';
    case 'none':
    default:
      return 'Not configured';
  }
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  } else {
    // Fallback for HTTP environments
    return new Promise((resolve, reject) => {
      try {
        const textArea = document.createElement("textarea");
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
          resolve();
        } else {
          reject(new Error('Fallback copy failed'));
        }
      } catch (err) {
        reject(err);
      }
    });
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}
