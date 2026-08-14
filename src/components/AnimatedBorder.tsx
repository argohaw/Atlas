import type { ReactNode } from "react";
import "./AnimatedBorder.css";

interface Props {
  children: ReactNode;
  active?: boolean;
}

/** ReactBits-style animated conic-gradient border — activates on focus */
export default function AnimatedBorder({ children, active = false }: Props) {
  return (
    <div className={`anim-border-wrap${active ? " anim-border-active" : ""}`}>
      <div className="anim-border-inner">{children}</div>
    </div>
  );
}
