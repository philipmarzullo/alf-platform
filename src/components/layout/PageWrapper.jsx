export default function PageWrapper({ children }) {
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      {children}
    </div>
  );
}
