import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronRight, Bot } from 'lucide-react';
import AlfChatPanel from '../shared/AlfChatPanel';

const BREADCRUMB_MAP = {
  '/': ['Dashboard'],
  '/platform/tenants': ['Tenants'],
  '/platform/tenants/new': ['Tenants', 'New Tenant'],
  '/platform/agents': ['Agents'],
  '/platform/usage': ['Usage'],
  '/platform/backups': ['Backups'],
  '/platform/settings': ['Settings'],
};

export default function TopBar({ pageContext }) {
  const location = useLocation();
  const [chatOpen, setChatOpen] = useState(false);

  // Handle dynamic routes
  let crumbs = BREADCRUMB_MAP[location.pathname];
  if (!crumbs && location.pathname.startsWith('/platform/tenants/')) {
    crumbs = ['Tenants', 'Tenant Detail'];
  }
  if (!crumbs && location.pathname.startsWith('/platform/agents/')) {
    crumbs = ['Agents', 'Agent Detail'];
  }
  crumbs = crumbs || ['Dashboard'];

  return (
    <>
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 shrink-0">
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

        <button
          onClick={() => setChatOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-alf-orange bg-alf-orange/5 border border-alf-orange/20 rounded-lg hover:bg-alf-orange/10 transition-colors"
        >
          <Bot size={15} />
          <span className="hidden sm:inline">Ask Alf</span>
        </button>
      </header>

      <AlfChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        pageContext={pageContext}
      />
    </>
  );
}
