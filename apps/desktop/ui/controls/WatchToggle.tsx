import "./watchToggle.css";

type Props = { isWatched: boolean; onToggle: () => void };

/** The star that puts a player on the coach's watch list or takes him off it. */
export function WatchToggle({ isWatched, onToggle }: Props) {
  return (
    <button className={isWatched ? "watch-toggle on" : "watch-toggle"} aria-pressed={isWatched} onClick={onToggle}>
      <i className={isWatched ? "ph-fill ph-star" : "ph-bold ph-star"} aria-hidden="true" />
      {isWatched ? "Observando" : "Observar"}
    </button>
  );
}
