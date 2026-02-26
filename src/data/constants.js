export const BRAND = {
  blue: '#009ADE',
  red: '#E12F2C',
  darkText: '#272727',
  secondaryText: '#5A5D62',
  lightBg: '#F5F5F5',
  white: '#FFFFFF',
  darkNav: '#1B2133',
  darkNavWarm: '#231A12',
  amber: '#F59E0B',
};

export const DEPT_COLORS = {
  hr: '#009ADE',
  finance: '#0D9488',
  purchasing: '#7C3AED',
  ops: '#4B5563',
  sales: '#F59E0B',
  admin: '#E12F2C',
  tools: '#0284C7',
  platform: '#F59E0B',
};

export const STATUS = {
  active: { label: 'Active', color: '#16A34A', bg: '#DCFCE7', text: '#166534' },
  inactive: { label: 'Inactive', color: '#9CA3AF', bg: '#F3F4F6', text: '#4B5563' },
  setup: { label: 'Setup', color: '#EAB308', bg: '#FEF9C3', text: '#854D0E' },
};

export const NAV_ITEMS = [
  {
    group: 'PLATFORM',
    items: [
      { label: 'Dashboard', path: '/', icon: 'LayoutDashboard' },
      { label: 'Tenants', path: '/platform/tenants', icon: 'Building2' },
      { label: 'Usage', path: '/platform/usage', icon: 'Activity' },
      { label: 'Agents', path: '/platform/agents', icon: 'Bot' },
      { label: 'Config', path: '/platform/config', icon: 'Settings' },
      { label: 'Templates', path: '/platform/templates', icon: 'FileText' },
      { label: 'Brand', path: '/platform/brand', icon: 'Palette' },
    ],
  },
];
