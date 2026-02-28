export const BRAND = {
  blue: '#009ADE',
  red: '#E12F2C',
  darkText: '#272727',
  secondaryText: '#5A5D62',
  lightBg: '#F5F5F5',
  white: '#FFFFFF',
  darkNav: '#1B2133',
  alfDark: '#1C1C1C',
  alfOrange: '#C84B0A',
};

export const DEPT_COLORS = {
  hr: '#009ADE',
  finance: '#0D9488',
  purchasing: '#7C3AED',
  ops: '#4B5563',
  sales: '#C84B0A',
  admin: '#E12F2C',
  tools: '#0284C7',
  platform: '#C84B0A',
};

export const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-5-20250514', label: 'Claude Sonnet 4.5' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { value: 'claude-opus-4-5-20250514', label: 'Claude Opus 4.5' },
];

export const STATUS = {
  active: { label: 'Active', color: '#16A34A', bg: '#DCFCE7', text: '#166534' },
  inactive: { label: 'Inactive', color: '#9CA3AF', bg: '#F3F4F6', text: '#4B5563' },
  setup: { label: 'Setup', color: '#EAB308', bg: '#FEF9C3', text: '#854D0E' },
};

export const NAV_ITEMS = [
  {
    group: 'COMMAND CENTER',
    items: [
      { label: 'Dashboard', path: '/', icon: 'LayoutDashboard' },
    ],
  },
  {
    group: 'MANAGE',
    items: [
      { label: 'Tenants', path: '/platform/tenants', icon: 'Building2' },
      { label: 'Agents', path: '/platform/agents', icon: 'Bot' },
    ],
  },
  {
    group: 'MONITOR',
    items: [
      { label: 'Usage & Analytics', path: '/platform/usage', icon: 'Activity' },
      { label: 'Backups', path: '/platform/backups', icon: 'HardDrive' },
    ],
  },
  {
    group: 'SYSTEM',
    items: [
      { label: 'Settings', path: '/platform/settings', icon: 'Settings' },
    ],
  },
];
