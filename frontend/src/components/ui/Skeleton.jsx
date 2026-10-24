import styles from "./Skeleton.module.css";

function Skeleton({
  width = "100%",
  height = "1rem",
  radius = "0.5rem",
}) {
  return (
    <div
      className={`skeleton ${styles.moduleScope}`}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard() {
  return (
    <div className={`skeleton-card ${styles.moduleScope}`}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <Skeleton height="1.1rem" width="55%" />
        <Skeleton height="1.4rem" width="20%" radius="999px" />
      </div>
      <Skeleton height="0.8rem" width="40%" />
      <Skeleton height="0.8rem" width="70%" />
      <Skeleton height="0.8rem" width="50%" />
    </div>
  );
}

export function SkeletonMetric() {
  return (
    <div
      className={`panel metric-card ${styles.moduleScope}`}
      style={{ gap: "0.5rem", display: "grid" }}
    >
      <Skeleton height="0.75rem" width="50%" />
      <Skeleton height="2.2rem" width="40%" />
    </div>
  );
}
