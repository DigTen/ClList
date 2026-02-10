import type { Attendance } from "../types/database";

type DayCellProps = {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  sessions: Attendance[];
  onSelect: (date: Date) => void;
};

export function DayCell({ date, isCurrentMonth, isToday, isSelected, sessions, onSelect }: DayCellProps) {
  const attendedCount = sessions.filter((session) => session.status === "attended").length;
  const canceledCount = sessions.filter((session) => session.status === "canceled").length;
  const noShowCount = sessions.filter((session) => session.status === "no_show").length;

  const className = [
    "calendar-day",
    isCurrentMonth ? "calendar-day-current" : "calendar-day-outside",
    isToday ? "calendar-day-today" : "",
    isSelected ? "calendar-day-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={className} onClick={() => onSelect(date)}>
      <div className="calendar-day-header">
        <span>{date.getDate()}</span>
        {sessions.length ? <span className="calendar-day-count">{sessions.length}</span> : null}
      </div>
      {sessions.length ? (
        <div className="calendar-day-status">
          {attendedCount ? <span className="status-pill status-attended">{attendedCount} Παρ.</span> : null}
          {canceledCount ? <span className="status-pill status-canceled">{canceledCount} Ακυρ.</span> : null}
          {noShowCount ? <span className="status-pill status-no-show">{noShowCount} Απουσ.</span> : null}
        </div>
      ) : (
        <span className="calendar-day-empty">Χωρίς συνεδρίες</span>
      )}
    </button>
  );
}
