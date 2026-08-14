import "./ShinyText.css";

interface Props {
  text: string;
  className?: string;
}

/** ReactBits-style ShinyText — animated shimmer sweep over text */
export default function ShinyText({ text, className = "" }: Props) {
  return (
    <span className={`shiny-text ${className}`} aria-label={text}>
      {text}
    </span>
  );
}
