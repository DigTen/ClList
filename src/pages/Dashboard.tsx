import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { fetchAttendanceForMonth, fetchClients } from "../lib/data";
import { addDays, toIsoDate } from "../lib/date";

const WEEK_HOUR_START = 8;
const WEEK_HOUR_END = 22;
const BED_CAPACITY_PER_TYPE = 4;
const BEDS_PER_HOUR_CAPACITY = BED_CAPACITY_PER_TYPE * 2;
const HOUR_ROWS = Array.from({ length: WEEK_HOUR_END - WEEK_HOUR_START + 1 }, (_, index) => WEEK_HOUR_START + index);

const STATUS_LABELS = {
  attended: "Παρ.",
  canceled: "Ακυρ.",
  no_show: "Απουσ.",
} as const;

type BedLoadState = "normal" | "full" | "overbooked";

function parseMinutes(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const [hourPart, minutePart] = value.split(":");
  const hour = Number.parseInt(hourPart, 10);
  const minute = Number.parseInt(minutePart, 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  return hour * 60 + minute;
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatTime(value: string | null): string {
  return value ? value.slice(0, 5) : "Χωρίς ώρα";
}

function formatBedType(value: "reformer" | "cadillac"): string {
  return value === "cadillac" ? "CADILLAC" : "REFORMER";
}

function getBedLoadState(count: number): BedLoadState {
  if (count > BED_CAPACITY_PER_TYPE) {
    return "overbooked";
  }
  if (count === BED_CAPACITY_PER_TYPE) {
    return "full";
  }
  return "normal";
}

export function DashboardPage() {
  const { user } = useAuth();
  const now = new Date();
  const todayIso = toIsoDate(now);
  const tomorrowIso = toIsoDate(addDays(now, 1));

  const clientsQuery = useQuery({
    queryKey: ["clients-all", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchClients(user!.id),
  });

  const attendanceTodayQuery = useQuery({
    queryKey: ["attendance", user?.id, todayIso, tomorrowIso, "dashboard"],
    enabled: Boolean(user?.id),
    queryFn: () => fetchAttendanceForMonth(user!.id, todayIso, tomorrowIso),
  });

  const clientsById = useMemo(() => {
    return (clientsQuery.data ?? []).reduce<Record<string, { full_name: string }>>((acc, client) => {
      acc[client.id] = { full_name: client.full_name };
      return acc;
    }, {});
  }, [clientsQuery.data]);

  const todaySessions = useMemo(() => {
    return [...(attendanceTodayQuery.data ?? [])].sort((a, b) => (a.time_start ?? "").localeCompare(b.time_start ?? ""));
  }, [attendanceTodayQuery.data]);

  const todayCounts = useMemo(() => {
    return todaySessions.reduce(
      (acc, session) => {
        acc.total += 1;
        if (session.status === "attended") {
          acc.attended += 1;
        } else if (session.status === "canceled") {
          acc.canceled += 1;
        } else if (session.status === "no_show") {
          acc.noShow += 1;
        }
        return acc;
      },
      { total: 0, attended: 0, canceled: 0, noShow: 0 },
    );
  }, [todaySessions]);

  const upcomingSessions = useMemo(() => {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const upperBound = nowMinutes + 180;

    return todaySessions.filter((session) => {
      const minutes = parseMinutes(session.time_start);
      if (minutes == null) {
        return false;
      }
      return minutes >= nowMinutes && minutes <= upperBound;
    });
  }, [now, todaySessions]);

  const todayOccupancyByHourAndBed = useMemo(() => {
    const byHour = new Map<number, { reformerCount: number; cadillacCount: number }>();
    HOUR_ROWS.forEach((hour) => {
      byHour.set(hour, { reformerCount: 0, cadillacCount: 0 });
    });

    todaySessions.forEach((session) => {
      const minutes = parseMinutes(session.time_start);
      if (minutes == null) {
        return;
      }
      const hour = Math.floor(minutes / 60);
      if (hour < WEEK_HOUR_START || hour > WEEK_HOUR_END) {
        return;
      }

      const current = byHour.get(hour);
      if (!current) {
        return;
      }

      if (session.bed_type === "cadillac") {
        current.cadillacCount += 1;
      } else {
        current.reformerCount += 1;
      }
    });

    return HOUR_ROWS.map((hour) => {
      const bedCounts = byHour.get(hour) ?? { reformerCount: 0, cadillacCount: 0 };
      const total = bedCounts.reformerCount + bedCounts.cadillacCount;
      const ratio = BEDS_PER_HOUR_CAPACITY > 0 ? total / BEDS_PER_HOUR_CAPACITY : 0;
      return {
        hour,
        hourLabel: formatHourLabel(hour),
        reformerCount: bedCounts.reformerCount,
        cadillacCount: bedCounts.cadillacCount,
        reformerState: getBedLoadState(bedCounts.reformerCount),
        cadillacState: getBedLoadState(bedCounts.cadillacCount),
        total,
        totalCapacity: BEDS_PER_HOUR_CAPACITY,
        ratio,
      };
    });
  }, [todaySessions]);

  if (clientsQuery.isLoading || attendanceTodayQuery.isLoading) {
    return <div className="status-box">Φόρτωση dashboard...</div>;
  }

  if (clientsQuery.isError || attendanceTodayQuery.isError) {
    const message =
      (clientsQuery.error instanceof Error && clientsQuery.error.message) ||
      (attendanceTodayQuery.error instanceof Error && attendanceTodayQuery.error.message) ||
      "Δεν ήταν δυνατή η φόρτωση dashboard.";
    return <div className="status-box status-error">{message}</div>;
  }

  return (
    <section className="stack-md">
      <div className="day-hub-grid">
        <article className="card day-hub-card day-hub-card-today">
          <h3>Συνεδρίες σήμερα</h3>
          <strong>{todayCounts.total}</strong>
          <p className="muted-text">
            {STATUS_LABELS.attended}: {todayCounts.attended} | {STATUS_LABELS.canceled}: {todayCounts.canceled} | {STATUS_LABELS.no_show}: {todayCounts.noShow}
          </p>
        </article>

        <article className="card day-hub-card">
          <h3>Επόμενες 3 ώρες</h3>
          {upcomingSessions.length ? (
            <div className="upcoming-list">
              {upcomingSessions.slice(0, 8).map((session) => (
                <article key={session.id} className="upcoming-item">
                  <div>
                    <strong>{clientsById[session.client_id]?.full_name ?? "Άγνωστος πελάτης"}</strong>
                    <p className="muted-text">
                      {formatTime(session.time_start)} · {formatBedType(session.bed_type)}
                    </p>
                  </div>
                  <span className={`status-pill status-${session.status.replace("_", "-")}`}>{STATUS_LABELS[session.status]}</span>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">Δεν υπάρχουν συνεδρίες στις επόμενες 3 ώρες.</div>
          )}
        </article>

        <article className="card day-hub-card">
          <h3>Πληρότητα σήμερα</h3>
          <div className="occupancy-list occupancy-list-bed">
            {todayOccupancyByHourAndBed.map((row) => (
              <div key={row.hour} className="occupancy-row-bed">
                <div className="occupancy-row-head">
                  <span className="occupancy-hour">{row.hourLabel}</span>
                  <div className="occupancy-bed-group">
                    <span className={`occupancy-bed-badge occupancy-bed-badge-${row.reformerState}`}>
                      REFORMER {row.reformerCount}/{BED_CAPACITY_PER_TYPE}
                    </span>
                    <span className={`occupancy-bed-badge occupancy-bed-badge-${row.cadillacState}`}>
                      CADILLAC {row.cadillacCount}/{BED_CAPACITY_PER_TYPE}
                    </span>
                  </div>
                  <span className="occupancy-value">
                    {row.total}/{row.totalCapacity}
                  </span>
                </div>
                <div className="occupancy-track">
                  <span
                    className={`occupancy-fill ${row.ratio >= 1 ? "occupancy-fill-over" : ""}`.trim()}
                    style={{ width: `${Math.min(100, row.ratio * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>

      <article className="card stack-sm">
        <h3>Γρήγορες ενέργειες</h3>
        <div className="row gap-sm wrap quick-actions">
          <Link className="button button-primary" to="/calendar">
            Νέα συνεδρία
          </Link>
          <Link className="button" to="/calendar">
            Άνοιγμα σημερινού ημερολογίου
          </Link>
          <Link className="button" to="/payments">
            Μετάβαση σε πληρωμές μήνα
          </Link>
        </div>
      </article>
    </section>
  );
}
