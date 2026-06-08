import React from 'react';

interface OSIconProps {
  os?: string;
  className?: string;
}

const iconClass = (className?: string) => `${className || 'w-4 h-4'} shrink-0`;

export const OSIcon: React.FC<OSIconProps> = ({ os = '', className }) => {
  const normalizedOS = os.toLowerCase();
  const classes = iconClass(className);

  if (normalizedOS.includes('windows')) {
    return (
      <svg className={classes} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#00A4EF" d="M2.5 4.8 10.9 3.6v7.8H2.5V4.8Zm9.4-1.4L21.5 2v9.4h-9.6v-8Zm-9.4 9h8.4v7.9l-8.4-1.2v-6.7Zm9.4 0h9.6V22l-9.6-1.4v-8.2Z" />
      </svg>
    );
  }

  if (normalizedOS.includes('macos') || normalizedOS.includes('darwin') || normalizedOS.includes('ios')) {
    return (
      <svg className={`${classes} text-slate-200`} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.33-.07 2.29.74 3.08.78 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.1ZM12.03 7.25C11.88 5.02 13.69 3.18 15.77 3c.29 2.58-2.34 4.5-3.74 4.25Z" />
      </svg>
    );
  }

  if (normalizedOS.includes('android')) {
    return (
      <svg className={classes} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#3DDC84" d="M8.05 6.45 6.7 4.27a.5.5 0 0 1 .85-.53l1.4 2.24a8.27 8.27 0 0 1 6.1 0l1.4-2.24a.5.5 0 1 1 .85.53l-1.35 2.18A4.96 4.96 0 0 1 18 10H6a4.96 4.96 0 0 1 2.05-3.55ZM5 10.6c.55 0 1 .45 1 1v4.9a1 1 0 1 1-2 0v-4.9c0-.55.45-1 1-1Zm14 0c.55 0 1 .45 1 1v4.9a1 1 0 1 1-2 0v-4.9c0-.55.45-1 1-1ZM6 10.6h12v6.25c0 .64-.51 1.15-1.15 1.15H16v2a1 1 0 1 1-2 0v-2h-4v2a1 1 0 1 1-2 0v-2h-.85A1.15 1.15 0 0 1 6 16.85V10.6Z" />
        <circle cx="9" cy="8.1" r=".6" fill="#0F172A" />
        <circle cx="15" cy="8.1" r=".6" fill="#0F172A" />
      </svg>
    );
  }

  if (normalizedOS.includes('linux')) {
    return (
      <svg className={classes} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#0F172A" stroke="#CBD5E1" strokeWidth=".8" d="M12 2.4c-2.95 0-4.43 2.55-4.43 6.04 0 1.08-.39 2.13-1.11 3.2C5.17 13.52 4 15.72 4 17.76c0 1.39.79 2.27 2.02 2.27.91 0 1.79-.45 2.5-1.18.9.99 2.04 1.51 3.48 1.51s2.58-.52 3.48-1.51c.71.73 1.59 1.18 2.5 1.18 1.23 0 2.02-.88 2.02-2.27 0-2.04-1.17-4.24-2.46-6.12-.72-1.07-1.11-2.12-1.11-3.2C16.43 4.95 14.95 2.4 12 2.4Z" />
        <ellipse cx="12" cy="14.2" rx="3.55" ry="4.45" fill="#F8FAFC" />
        <ellipse cx="10.45" cy="7.58" rx="1.22" ry="1.52" fill="#F8FAFC" />
        <ellipse cx="13.55" cy="7.58" rx="1.22" ry="1.52" fill="#F8FAFC" />
        <circle cx="10.75" cy="7.75" r=".45" fill="#0F172A" />
        <circle cx="13.25" cy="7.75" r=".45" fill="#0F172A" />
        <path fill="#FACC15" d="m12 8.45 1.72 1.02L12 10.6l-1.72-1.13L12 8.45Zm-4.16 9.94c-.63.96-1.46 1.48-2.27 1.33-.61-.11-.76-.58-.24-.94.71-.49 1.49-.83 2.51-1.05v.66Zm8.32 0c.63.96 1.46 1.48 2.27 1.33.61-.11.76-.58.24-.94-.71-.49-1.49-.83-2.51-1.05v.66Z" />
      </svg>
    );
  }

  return (
    <svg className={`${classes} text-slate-400`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path strokeLinecap="round" d="M8 21h8m-4-4v4" />
    </svg>
  );
};
