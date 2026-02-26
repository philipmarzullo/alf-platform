import { Palette } from 'lucide-react';

export default function PlatformBrandPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="p-4 bg-amber-50 rounded-full mb-4">
        <Palette size={32} className="text-amber-500" />
      </div>
      <h2 className="text-xl font-semibold text-dark-text mb-2">Brand Settings</h2>
      <p className="text-sm text-secondary-text max-w-md">
        Configure per-tenant branding and theming. Coming soon.
      </p>
    </div>
  );
}
