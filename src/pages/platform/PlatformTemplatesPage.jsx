import { FileText } from 'lucide-react';

export default function PlatformTemplatesPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="p-4 bg-amber-50 rounded-full mb-4">
        <FileText size={32} className="text-amber-500" />
      </div>
      <h2 className="text-xl font-semibold text-dark-text mb-2">Prompt Templates</h2>
      <p className="text-sm text-secondary-text max-w-md">
        Manage shared prompt templates across tenants. Coming soon.
      </p>
    </div>
  );
}
