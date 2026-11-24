
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import "./work-order-timer.css";

function getTimestamp(value) {
  if (!value) return null;

  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(
    0,
    Math.floor(milliseconds / 1000)
  );

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (value) => String(value).padStart(2, "0");

  const time = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  return days > 0 ? `${days} d ${time}` : time;
}

function WorkOrderTimer({
  startedAt,
  completedAt,
  status,
}) {
  const startTimestamp = getTimestamp(startedAt);
  const endTimestamp = getTimestamp(completedAt);

  const isRunning =
    status === "EN_PROGRESO" &&
    Boolean(startTimestamp) &&
    !endTimestamp;

  const isCompleted =
    status === "COMPLETADA" &&
    Boolean(startTimestamp) &&
    Boolean(endTimestamp);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) return undefined;

    setNow(Date.now());

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunning, startTimestamp]);

  if (
    status !== "EN_PROGRESO" &&
    status !== "COMPLETADA"
  ) {
    return null;
  }

  if (!startTimestamp) {
    return (
      <div className="wo-timer wo-timer--unavailable">
        <Clock size={17} />
        <span>Fecha de inicio no disponible</span>
      </div>
    );
  }

  if (status === "COMPLETADA" && !endTimestamp) {
    return (
      <div className="wo-timer wo-timer--unavailable">
        <Clock size={17} />
        <span>Duración final no disponible</span>
      </div>
    );
  }

  const end = isCompleted ? endTimestamp : now;
  const duration = formatDuration(end - startTimestamp);

  return (
    <div
      className={`wo-timer ${
        isRunning
          ? "wo-timer--running"
          : "wo-timer--completed"
      }`}
    >
      <Clock size={17} />

      <div className="wo-timer__content">
        <span className="wo-timer__label">
          {isRunning ? "Tiempo de ejecución" : "Duración final"}
        </span>

        <strong className="wo-timer__value">
          {duration}
        </strong>
      </div>

      {isRunning && (
        <span className="wo-timer__indicator" />
      )}
    </div>
  );
}

export default WorkOrderTimer;
