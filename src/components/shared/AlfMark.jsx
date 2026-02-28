/**
 * Alf wordmark — "alf" in Georgia serif + orange accent bar.
 *
 * variant: 'dark' (white text for dark bg) | 'light' (near-black text for light bg)
 * size:    'sm' (sidebar) | 'md' (inline) | 'lg' (auth pages)
 */
export default function AlfMark({ variant = 'dark', size = 'sm', showTagline = false, className = '' }) {
  const sizes = {
    sm:  { font: 20, bar: 16, barH: 2, barGap: 3, tagSize: 0, tagGap: 0 },
    md:  { font: 32, bar: 24, barH: 2.5, barGap: 5, tagSize: 9, tagGap: 10 },
    lg:  { font: 48, bar: 32, barH: 3, barGap: 6, tagSize: 10, tagGap: 14 },
  };

  const s = sizes[size] || sizes.sm;
  const textColor = variant === 'dark' ? 'white' : '#1C1C1C';
  const tagColor = variant === 'dark' ? 'rgba(255,255,255,0.4)' : '#6B6B6B';

  return (
    <div className={className} style={{ display: 'inline-flex', flexDirection: 'column' }}>
      <span style={{
        fontFamily: 'Georgia, serif',
        fontSize: s.font,
        fontWeight: 400,
        letterSpacing: -1,
        color: textColor,
        lineHeight: 1,
      }}>
        alf
      </span>
      <div style={{
        width: s.bar,
        height: s.barH,
        background: '#C84B0A',
        borderRadius: 1,
        marginTop: s.barGap,
      }} />
      {showTagline && s.tagSize > 0 && (
        <div style={{
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: s.tagSize,
          fontWeight: 300,
          letterSpacing: 4,
          color: tagColor,
          marginTop: s.tagGap,
          lineHeight: 1.5,
        }}>
          OPERATIONS<br />INTELLIGENCE
        </div>
      )}
    </div>
  );
}
