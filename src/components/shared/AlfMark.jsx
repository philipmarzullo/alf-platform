/**
 * Alf wordmark — "alf" in Georgia serif + orange accent line.
 * Per brand standards v1.0:
 *   Font: Times-Roman (Georgia) · Regular · −3 letter-spacing
 *   Accent line: 2.5px · #C84B0A · radius 1.25px · width = 55% of wordmark
 *   Tagline: Helvetica Neue · Light 300 · +5 to +6 letter-spacing · single line
 *
 * variant: 'dark' (white text) | 'light' (near-black text)
 * size:    'sm' (sidebar/nav) | 'md' (inline) | 'lg' (auth/hero)
 */
export default function AlfMark({ variant = 'dark', size = 'sm', showTagline = false, className = '' }) {
  // Approximate rendered "alf" width per size, bar = 55% of that
  const sizes = {
    sm:  { font: 20, barW: 17, barGap: 3, tagSize: 0, tagGap: 0 },
    md:  { font: 32, barW: 27, barGap: 4, tagSize: 9, tagGap: 10 },
    lg:  { font: 48, barW: 40, barGap: 6, tagSize: 11, tagGap: 14 },
  };

  const s = sizes[size] || sizes.sm;
  const textColor = variant === 'dark' ? 'white' : '#1C1C1C';
  const tagColor = variant === 'dark' ? 'rgba(255,255,255,0.4)' : '#6B6B6B';

  return (
    <div className={className} style={{ display: 'inline-flex', flexDirection: 'column' }}>
      <span style={{
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: s.font,
        fontWeight: 400,
        letterSpacing: -3,
        color: textColor,
        lineHeight: 1,
      }}>
        alf
      </span>
      <div style={{
        width: s.barW,
        height: 2.5,
        background: '#C84B0A',
        borderRadius: 1.25,
        marginTop: s.barGap,
      }} />
      {showTagline && s.tagSize > 0 && (
        <div style={{
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: s.tagSize,
          fontWeight: 300,
          letterSpacing: 5,
          color: tagColor,
          marginTop: s.tagGap,
          lineHeight: 1,
        }}>
          OPERATIONS INTELLIGENCE
        </div>
      )}
    </div>
  );
}
