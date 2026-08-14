import { useRef, type MouseEvent, type ReactNode } from "react";
import "./SpotlightCard.css";

interface Props {
  children: ReactNode;
  className?: string;
  spotColor?: string;
}

/** ReactBits-style SpotlightCard — radial glow follows the mouse */
export default function SpotlightCard({ children, className = "", spotColor = "rgba(99,179,237,0.12)" }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.style.setProperty("--spot-x", `${x}px`);
    el.style.setProperty("--spot-y", `${y}px`);
    el.style.setProperty("--spot-color", spotColor);
  }

  return (
    <div ref={ref} className={`spotlight-card ${className}`} onMouseMove={handleMouseMove}>
      {children}
    </div>
  );
}
