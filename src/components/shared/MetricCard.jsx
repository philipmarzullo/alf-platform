export default function MetricCard({ label, value, trend, color, icon: Icon }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-secondary-text mb-1">{label}</div>
          <div className={`text-3xl font-semibold ${color ? '' : 'text-dark-text'}`} style={color ? { color } : {}}>
            {value}
          </div>
        </div>
        {Icon && (
          <div className="p-2 bg-gray-50 rounded-lg">
            <Icon size={20} className="text-secondary-text" />
          </div>
        )}
      </div>
      {trend && (
        <div className="mt-3 h-8 bg-gray-50 rounded flex items-center justify-center text-xs text-secondary-text">
          {trend}
        </div>
      )}
    </div>
  );
}
