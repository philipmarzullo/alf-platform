/**
 * Alf brand mark — spiral SVG.
 * Extracted from alf-brand-system-v2.jsx.
 */
export default function AlfMark({ size = 110, color = '#C84B0A', className = '' }) {
  const sw = Math.max(2.5, size * 0.04);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 220 220"
      fill="none"
      aria-label="Alf mark"
      className={className}
    >
      <path
        d="M 70 170 C 55 155, 48 135, 52 112 C 56 84, 78 62, 106 56 C 124 52, 144 56, 160 68 C 174 79, 182 95, 180 112 C 178 129, 167 141, 150 146 C 132 151, 114 147, 102 136 C 92 126, 88 114, 92 102 C 96 90, 108 82, 122 82 C 136 82, 146 90, 146 102 C 146 113, 138 121, 126 122 C 112 123, 104 114, 106 102"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 96 54 C 120 36, 152 34, 178 50"
        stroke={color}
        strokeWidth={sw * 0.9}
        strokeLinecap="round"
      />
    </svg>
  );
}
