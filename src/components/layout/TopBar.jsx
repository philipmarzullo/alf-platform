import { useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const BREADCRUMB_MAP = {
  '/': ['Dashboard'],
  '/platform/tenants': ['Tenants'],
  '/platform/tenants/new': ['Tenants', 'New Tenant'],
  '/platform/usage': ['Usage'],
  '/platform/settings': ['Settings'],
};

export default function TopBar() {
  const location = useLocation();

  // Handle dynamic tenant detail routes
  let crumbs = BREADCRUMB_MAP[location.pathname];
  if (!crumbs && location.pathname.startsWith('/platform/tenants/')) {
    crumbs = ['Tenants', 'Tenant Detail'];
  }
  crumbs = crumbs || ['Dashboard'];

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-1.5 text-sm">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={14} className="text-gray-300" />}
            <span className={i === crumbs.length - 1 ? 'text-dark-text font-medium' : 'text-secondary-text'}>
              {crumb}
            </span>
          </span>
        ))}
      </div>
    </header>
  );
}
