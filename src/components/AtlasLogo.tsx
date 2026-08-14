interface Props {
  size?: number;
}

/**
 * Atlas logo — Google-style geometric "A"
 * 4 colored quadrants: Blue (top-left), Red (top-right), Gold (bottom-left), Green (bottom-right)
 * Uses SVG mask so the crossbar cutout is always transparent — works on any background.
 */
export default function AtlasLogo({ size = 32 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Atlas"
      role="img"
    >
      <defs>
        {/* Mask: white = show, black = hide. The A shape with crossbar hole. */}
        <mask id="atlas-a-mask">
          {/* Full A silhouette in white */}
          <path d="M24 4 L44 44 H37 L24 14 L11 44 H4 Z" fill="white" />
          {/* Crossbar hole in black */}
          <rect x="10.5" y="27" width="27" height="7" fill="black" />
        </mask>

        {/* Clip paths for the 4 quadrants */}
        <clipPath id="atlas-tl"><rect x="0"  y="0"  width="24" height="28" /></clipPath>
        <clipPath id="atlas-tr"><rect x="24" y="0"  width="24" height="28" /></clipPath>
        <clipPath id="atlas-bl"><rect x="0"  y="27" width="24" height="21" /></clipPath>
        <clipPath id="atlas-br"><rect x="24" y="27" width="24" height="21" /></clipPath>
      </defs>

      {/* Render 4 colored rects, each clipped to a quadrant, all masked by the A shape */}
      <g mask="url(#atlas-a-mask)">
        <rect x="0"  y="0"  width="24" height="28" fill="#4285F4" clipPath="url(#atlas-tl)" /> {/* Blue  */}
        <rect x="24" y="0"  width="24" height="28" fill="#EA4335" clipPath="url(#atlas-tr)" /> {/* Red   */}
        <rect x="0"  y="27" width="24" height="21" fill="#C9A84C" clipPath="url(#atlas-bl)" /> {/* Gold  */}
        <rect x="24" y="27" width="24" height="21" fill="#34A853" clipPath="url(#atlas-br)" /> {/* Green */}
      </g>
    </svg>
  );
}
