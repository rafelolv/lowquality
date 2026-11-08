interface MascotProps {
  className?: string;
  title?: string;
}

/**
 * Bitrot, LowQuality's resident corrupted monitor. Drawn on a strict pixel grid
 * so it stays crisp at every size.
 */
export function Mascot({ className = '', title = 'Bitrot, the LowQuality mascot' }: MascotProps) {
  return (
    <svg
      className={`mascot ${className}`}
      viewBox="0 0 48 48"
      role="img"
      aria-label={title}
      shapeRendering="crispEdges"
    >
      <g className="mascot__float">
        <rect x="4" y="20" width="2" height="2" fill="#ffcc29" opacity="0.7" />
        <rect x="42" y="16" width="2" height="2" fill="#ffcc29" opacity="0.5" />
        <rect x="39" y="4" width="3" height="2" fill="#d9b8ff" opacity="0.65" />
        <rect x="10" y="7" width="2" height="2" fill="#d9b8ff" opacity="0.4" />
        <rect x="19" y="1" width="2" height="2" fill="#ffcc29" opacity="0.8" />
        <rect x="30" y="8" width="1" height="2" fill="#d9b8ff" opacity="0.3" />
      </g>

      {/* antenna */}
      <rect x="23" y="3" width="2" height="7" fill="#130822" />
      <rect x="23" y="3" width="1" height="6" fill="#a477de" />
      <rect x="26" y="2" width="3" height="2" fill="#ffcc29" />
      <rect x="28" y="4" width="2" height="2" fill="#ffcc29" />
      <rect x="29" y="6" width="2" height="2" fill="#d89c13" />

      {/* feet */}
      <rect x="11" y="39" width="8" height="5" fill="#130822" />
      <rect x="29" y="39" width="8" height="5" fill="#130822" />
      <rect x="13" y="39" width="5" height="3" fill="#5b318b" />
      <rect x="30" y="39" width="5" height="3" fill="#5b318b" />
      <rect x="12" y="43" width="9" height="2" fill="#a477de" />
      <rect x="27" y="43" width="9" height="2" fill="#a477de" />

      {/* casing */}
      <rect x="7" y="8" width="34" height="33" fill="#160a27" />
      <rect x="9" y="10" width="30" height="29" fill="#4f2a7c" />
      <rect x="10" y="11" width="28" height="25" fill="#3c1f60" />
      <rect x="9" y="35" width="30" height="4" fill="#2b1547" />
      <rect x="11" y="11" width="2" height="2" fill="#b98cff" />
      <rect x="35" y="36" width="2" height="2" fill="#ffcc29" />

      {/* screen bezel */}
      <rect x="13" y="14" width="22" height="18" fill="#10061f" />
      <rect x="14" y="15" width="20" height="16" fill="#261042" />
      <rect x="15" y="16" width="18" height="14" fill="#3a1d5d" />
      <rect x="16" y="17" width="16" height="12" fill="#1b0d30" />
      <rect x="16" y="17" width="16" height="1" fill="#7d50b4" opacity="0.5" />

      {/* face */}
      <g className="mascot__eyes">
        <rect x="19" y="20" width="4" height="4" fill="#ffcc29" />
        <rect x="26" y="20" width="4" height="4" fill="#ffcc29" />
        <rect x="21" y="21" width="1" height="2" fill="#160a27" />
        <rect x="28" y="21" width="1" height="2" fill="#160a27" />
      </g>
      <rect x="21" y="26" width="7" height="1" fill="#ffcc29" />
      <rect x="23" y="27" width="3" height="1" fill="#d89c13" />
      <rect x="18" y="25" width="2" height="1" fill="#f8f4ff" opacity="0.35" />
      <rect x="30" y="25" width="1" height="1" fill="#f8f4ff" opacity="0.25" />

      {/* screen crack */}
      <rect x="31" y="16" width="1" height="3" fill="#d9b8ff" opacity="0.7" />
      <rect x="32" y="19" width="1" height="2" fill="#d9b8ff" opacity="0.7" />
      <rect x="33" y="21" width="1" height="1" fill="#d9b8ff" opacity="0.5" />

      {/* little status sticker */}
      <rect x="15" y="35" width="8" height="3" fill="#ffcc29" />
      <rect x="16" y="35" width="6" height="1" fill="#ffe27a" />
      <rect x="17" y="37" width="4" height="1" fill="#bb840d" />
      <rect x="28" y="35" width="3" height="3" fill="#ff5a5f" />
      <rect x="33" y="35" width="2" height="2" fill="#6fd08c" />
    </svg>
  );
}
