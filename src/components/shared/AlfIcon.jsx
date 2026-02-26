export default function AlfIcon({ size = 16, className = '' }) {
  return (
    <img
      src="/alf-logo.jpg"
      alt="Alf"
      className={`rounded-full ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
