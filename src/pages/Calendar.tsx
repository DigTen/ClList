import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "../auth/AuthProvider";
import {
  deleteAttendance,
  fetchActiveClients,
  fetchAttendanceForMonth,
  updateAttendance,
  upsertAttendance,
} from "../lib/data";
import {
  addDays,
  addMonths,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  toIsoDate,
} from "../lib/date";
import { MonthPicker } from "../components/MonthPicker";
import { DayCell } from "../components/DayCell";
import { SessionsDrawer } from "../components/SessionsDrawer";
import { AddSessionDialog } from "../components/AddSessionDialog";
import type { Attendance, AttendanceBedType, AttendanceInsert, Client } from "../types/database";

type SaveSessionPayload = {
  input: AttendanceInsert;
  existingId?: string;
};

type CalendarViewMode = "month" | "week" | "day";
type BedLoadByHour = Record<string, Record<AttendanceBedType, number>>;
type SlotSessionsByBed = Record<AttendanceBedType, Attendance[]>;

const WEEKDAY_LABELS = ["Δευ", "Τρι", "Τετ", "Πεμ", "Παρ", "Σαβ", "Κυρ"];
const WEEK_HOUR_START = 8;
const WEEK_HOUR_END = 22;
const BED_CAPACITY = 4;
const BED_TYPES: AttendanceBedType[] = ["reformer", "cadillac"];
const WEEK_HOURS = Array.from(
  { length: WEEK_HOUR_END - WEEK_HOUR_START + 1 },
  (_, index) => WEEK_HOUR_START + index,
);

const EMPTY_SLOT_BEDS: SlotSessionsByBed = {
  reformer: [],
  cadillac: [],
};

function formatTime(timeStart: string | null): string {
  return timeStart ? timeStart.slice(0, 5) : "Χωρίς ώρα";
}

function sortSessionsByTime(sessions: Attendance[]): Attendance[] {
  return [...sessions].sort((a, b) => (a.time_start ?? "").localeCompare(b.time_start ?? ""));
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function getHourFromTime(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const hour = Number.parseInt(value.slice(0, 2), 10);
  return Number.isFinite(hour) ? hour : null;
}

function formatBedType(value: AttendanceBedType): string {
  return value === "cadillac" ? "CADILLAC" : "REFORMER";
}

function getBedLoadState(count: number): "normal" | "full" | "overbooked" {
  if (count > BED_CAPACITY) {
    return "overbooked";
  }
  if (count === BED_CAPACITY) {
    return "full";
  }
  return "normal";
}

function buildEmptyBedLoadByHour(): BedLoadByHour {
  return WEEK_HOURS.reduce<BedLoadByHour>((acc, hour) => {
    acc[formatHourLabel(hour)] = {
      reformer: 0,
      cadillac: 0,
    };
    return acc;
  }, {});
}

function buildEmptySlotBeds(): SlotSessionsByBed {
  return {
    reformer: [],
    cadillac: [],
  };
}

export function CalendarPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()));
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [drawerDate, setDrawerDate] = useState<Date | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogInitialTime, setDialogInitialTime] = useState<string | undefined>(undefined);
  const [editingSession, setEditingSession] = useState<Attendance | null>(null);

  const monthStartDate = startOfMonth(selectedMonth);
  const monthGridStart = useMemo(() => startOfWeek(monthStartDate), [monthStartDate]);
  const monthGridEndExclusive = useMemo(() => addDays(monthGridStart, 42), [monthGridStart]);
  const weekStartDate = useMemo(() => startOfWeek(focusDate), [focusDate]);
  const weekEndExclusive = useMemo(() => addDays(weekStartDate, 7), [weekStartDate]);
  const dayStartDate = focusDate;
  const dayEndExclusive = useMemo(() => addDays(dayStartDate, 1), [dayStartDate]);

  const rangeStartDate = viewMode === "month" ? monthGridStart : viewMode === "week" ? weekStartDate : dayStartDate;
  const rangeEndExclusive =
    viewMode === "month" ? monthGridEndExclusive : viewMode === "week" ? weekEndExclusive : dayEndExclusive;
  const rangeStart = toIsoDate(rangeStartDate);
  const rangeEnd = toIsoDate(rangeEndExclusive);

  const clientsQuery = useQuery({
    queryKey: ["clients", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchActiveClients(user!.id),
  });

  const attendanceQuery = useQuery({
    queryKey: ["attendance", user?.id, rangeStart, rangeEnd],
    enabled: Boolean(user?.id),
    queryFn: () => fetchAttendanceForMonth(user!.id, rangeStart, rangeEnd),
  });

  const clientsById = useMemo<Record<string, Client>>(() => {
    return (clientsQuery.data ?? []).reduce<Record<string, Client>>((acc, client) => {
      acc[client.id] = client;
      return acc;
    }, {});
  }, [clientsQuery.data]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Attendance[]>();
    (attendanceQuery.data ?? []).forEach((session) => {
      const list = map.get(session.session_date);
      if (list) {
        list.push(session);
      } else {
        map.set(session.session_date, [session]);
      }
    });
    return map;
  }, [attendanceQuery.data]);

  const monthDays = useMemo(
    () => Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index)),
    [monthGridStart],
  );
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index)), [weekStartDate]);
  const weekSlotSessionsByBed = useMemo(() => {
    const map = new Map<string, SlotSessionsByBed>();
    if (viewMode !== "week") {
      return map;
    }
    (attendanceQuery.data ?? []).forEach((session) => {
      const hour = getHourFromTime(session.time_start);
      if (hour == null || hour < WEEK_HOUR_START || hour > WEEK_HOUR_END) {
        return;
      }
      const key = `${session.session_date}-${hour}`;
      const existing = map.get(key) ?? buildEmptySlotBeds();
      existing[session.bed_type].push(session);
      map.set(key, existing);
    });
    for (const [key, value] of map.entries()) {
      map.set(key, {
        reformer: sortSessionsByTime(value.reformer),
        cadillac: sortSessionsByTime(value.cadillac),
      });
    }
    return map;
  }, [attendanceQuery.data, viewMode]);

  const weekUnscheduledSessions = useMemo(() => {
    if (viewMode !== "week") {
      return [];
    }
    return sortSessionsByTime((attendanceQuery.data ?? []).filter((session) => !session.time_start));
  }, [attendanceQuery.data, viewMode]);
  const periodLabel = useMemo(() => {
    if (viewMode === "month") {
      return monthStartDate.toLocaleDateString("el-GR", { month: "long", year: "numeric" });
    }
    if (viewMode === "week") {
      const weekEnd = addDays(weekEndExclusive, -1);
      const startLabel = weekStartDate.toLocaleDateString("el-GR", { month: "short", day: "numeric" });
      const endLabel = weekEnd.toLocaleDateString("el-GR", { month: "short", day: "numeric", year: "numeric" });
      return `${startLabel} - ${endLabel}`;
    }
    return dayStartDate.toLocaleDateString("el-GR", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [dayStartDate, monthStartDate, viewMode, weekEndExclusive, weekStartDate]);

  const totals = useMemo(() => {
    return (attendanceQuery.data ?? []).reduce(
      (acc, session) => {
        acc.total += 1;
        if (session.status === "attended") {
          acc.attended += 1;
        }
        if (session.status === "canceled") {
          acc.canceled += 1;
        }
        if (session.status === "no_show") {
          acc.noShow += 1;
        }
        return acc;
      },
      { total: 0, attended: 0, canceled: 0, noShow: 0 },
    );
  }, [attendanceQuery.data]);

  const saveAttendanceMutation = useMutation({
    mutationFn: async ({ input, existingId }: SaveSessionPayload) => {
      if (!user) {
        throw new Error("Πρέπει να συνδεθείς για να αποθηκεύσεις συνεδρίες.");
      }

      const payload: AttendanceInsert = {
        ...input,
        user_id: user.id,
      };

      if (existingId) {
        return updateAttendance(existingId, {
          client_id: payload.client_id,
          session_date: payload.session_date,
          time_start: payload.time_start,
          duration_minutes: payload.duration_minutes,
          bed_type: payload.bed_type,
          status: payload.status,
          notes: payload.notes,
        });
      }

      return upsertAttendance(payload);
    },
    onSuccess: (savedSession) => {
      queryClient.setQueryData<Attendance[]>(["attendance", user?.id, rangeStart, rangeEnd], (current = []) => {
        if (savedSession.session_date < rangeStart || savedSession.session_date >= rangeEnd) {
          return current;
        }
        const existingIndex = current.findIndex((session) => session.id === savedSession.id);
        if (existingIndex >= 0) {
          const next = [...current];
          next[existingIndex] = savedSession;
          return next;
        }
        return [...current, savedSession].sort((a, b) => {
          if (a.session_date === b.session_date) {
            return (a.time_start ?? "").localeCompare(b.time_start ?? "");
          }
          return a.session_date.localeCompare(b.session_date);
        });
      });
      queryClient.invalidateQueries({ queryKey: ["attendance", user?.id] });
      toast.success("Η συνεδρία αποθηκεύτηκε.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Δεν ήταν δυνατή η αποθήκευση συνεδρίας.";
      toast.error(message);
    },
  });

  const deleteAttendanceMutation = useMutation({
    mutationFn: (sessionId: string) => deleteAttendance(sessionId),
    onSuccess: (_, sessionId) => {
      queryClient.setQueryData<Attendance[]>(["attendance", user?.id, rangeStart, rangeEnd], (current = []) =>
        current.filter((session) => session.id !== sessionId),
      );
      queryClient.invalidateQueries({ queryKey: ["attendance", user?.id] });
      toast.success("Η συνεδρία διαγράφηκε.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Δεν ήταν δυνατή η διαγραφή συνεδρίας.";
      toast.error(message);
    },
  });

  const handleSelectDay = (date: Date) => {
    setDrawerDate(date);
    setIsDrawerOpen(true);
    setFocusDate(date);
    if (!isSameMonth(date, monthStartDate)) {
      setSelectedMonth(startOfMonth(date));
    }
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setDrawerDate(null);
    setEditingSession(null);
    setDialogInitialTime(undefined);
    setIsDialogOpen(false);
  };

  const selectedDateKey = drawerDate ? toIsoDate(drawerDate) : null;
  const sessionsForSelectedDay = selectedDateKey ? sortSessionsByTime(sessionsByDate.get(selectedDateKey) ?? []) : [];
  const sessionsForFocusDay = useMemo(() => {
    const focusDateKey = toIsoDate(dayStartDate);
    return sortSessionsByTime(sessionsByDate.get(focusDateKey) ?? []);
  }, [dayStartDate, sessionsByDate]);
  const daySlotSessionsByBed = useMemo(() => {
    const map = new Map<number, SlotSessionsByBed>();
    sessionsForFocusDay.forEach((session) => {
      const hour = getHourFromTime(session.time_start);
      if (hour == null || hour < WEEK_HOUR_START || hour > WEEK_HOUR_END) {
        return;
      }
      const existing = map.get(hour) ?? buildEmptySlotBeds();
      existing[session.bed_type].push(session);
      map.set(hour, existing);
    });
    for (const [hour, value] of map.entries()) {
      map.set(hour, {
        reformer: sortSessionsByTime(value.reformer),
        cadillac: sortSessionsByTime(value.cadillac),
      });
    }
    return map;
  }, [sessionsForFocusDay]);
  const dayUnscheduledSessions = useMemo(() => {
    return sessionsForFocusDay.filter((session) => {
      const hour = getHourFromTime(session.time_start);
      return hour == null || hour < WEEK_HOUR_START || hour > WEEK_HOUR_END;
    });
  }, [sessionsForFocusDay]);

  const handleAddSession = () => {
    setEditingSession(null);
    setDialogInitialTime(undefined);
    if (!drawerDate) {
      setDrawerDate(focusDate);
    }
    setIsDialogOpen(true);
  };

  const handleEditSession = (session: Attendance) => {
    setEditingSession(session);
    setDialogInitialTime(undefined);
    setIsDialogOpen(true);
  };

  const handleDeleteSession = (session: Attendance) => {
    if (!window.confirm("Να διαγραφεί αυτή η συνεδρία;")) {
      return;
    }
    void deleteAttendanceMutation.mutateAsync(session.id);
  };

  const handleSaveSession = async (input: AttendanceInsert, existingId?: string) => {
    await saveAttendanceMutation.mutateAsync({ input, existingId });
  };

  const handleChangeMonth = (nextMonth: Date) => {
    setSelectedMonth(startOfMonth(nextMonth));
    setFocusDate(startOfMonth(nextMonth));
  };

  const shiftPeriod = (delta: -1 | 1) => {
    if (viewMode === "month") {
      const nextMonth = addMonths(monthStartDate, delta);
      setSelectedMonth(nextMonth);
      setFocusDate(nextMonth);
      return;
    }
    if (viewMode === "week") {
      const nextFocusDate = addDays(weekStartDate, delta * 7);
      setFocusDate(nextFocusDate);
      setSelectedMonth(startOfMonth(nextFocusDate));
      return;
    }
    const nextFocusDate = addDays(dayStartDate, delta);
    setFocusDate(nextFocusDate);
    setSelectedMonth(startOfMonth(nextFocusDate));
  };

  const jumpToToday = () => {
    const today = new Date();
    setSelectedMonth(startOfMonth(today));
    setFocusDate(today);
  };

  const openDialogForDay = (date: Date, initialTime?: string) => {
    setDrawerDate(date);
    setEditingSession(null);
    setDialogInitialTime(initialTime);
    setIsDialogOpen(true);
  };

  const dialogDateIso = editingSession?.session_date ?? toIsoDate(drawerDate ?? focusDate);
  const dialogBedLoadByHour = useMemo(() => {
    const bedLoadByHour = buildEmptyBedLoadByHour();

    (attendanceQuery.data ?? []).forEach((session) => {
      if (session.session_date !== dialogDateIso) {
        return;
      }
      const hour = getHourFromTime(session.time_start);
      if (hour == null || hour < WEEK_HOUR_START || hour > WEEK_HOUR_END) {
        return;
      }
      const hourLabel = formatHourLabel(hour);
      bedLoadByHour[hourLabel][session.bed_type] += 1;
    });

    return bedLoadByHour;
  }, [attendanceQuery.data, dialogDateIso]);

  if (clientsQuery.isLoading || attendanceQuery.isLoading) {
    return <div className="status-box">Φόρτωση ημερολογίου...</div>;
  }

  if (clientsQuery.isError || attendanceQuery.isError) {
    const message =
      (clientsQuery.error instanceof Error && clientsQuery.error.message) ||
      (attendanceQuery.error instanceof Error && attendanceQuery.error.message) ||
      "Δεν ήταν δυνατή η φόρτωση ημερολογίου.";
    return <div className="status-box status-error">{message}</div>;
  }

  return (
    <section className="stack-md">
      <div className="card stack-sm">
        <div className="row space-between align-end wrap gap-sm">
          <MonthPicker value={selectedMonth} onChange={handleChangeMonth} />
          <div className="row gap-sm align-center wrap">
            <button type="button" className="button" onClick={() => shiftPeriod(-1)}>
              Προηγ.
            </button>
            <button type="button" className="button" onClick={() => shiftPeriod(1)}>
              Επόμ.
            </button>
            <button type="button" className="button" onClick={jumpToToday}>
              Σήμερα
            </button>
          </div>
        </div>

        <div className="row space-between align-center wrap gap-sm">
          <div className="calendar-view-toggle">
            <button
              type="button"
              className={viewMode === "month" ? "button button-primary" : "button"}
              onClick={() => setViewMode("month")}
            >
              Μήνας
            </button>
            <button
              type="button"
              className={viewMode === "week" ? "button button-primary" : "button"}
              onClick={() => setViewMode("week")}
            >
              Εβδομάδα
            </button>
            <button
              type="button"
              className={viewMode === "day" ? "button button-primary" : "button"}
              onClick={() => setViewMode("day")}
            >
              Ημέρα
            </button>
          </div>

          <strong className="calendar-period-label">{periodLabel}</strong>

          <div className="calendar-legend">
            <span className="status-pill status-attended">Παρακολ. {totals.attended}</span>
            <span className="status-pill status-canceled">Ακυρ. {totals.canceled}</span>
            <span className="status-pill status-no-show">Απουσ. {totals.noShow}</span>
            <span className="status-pill">Σύνολο {totals.total}</span>
          </div>
        </div>
      </div>

      {viewMode === "day" ? (
        <div className="card stack-sm">
          <div className="row space-between align-center wrap gap-sm">
            <div>
              <h3>{dayStartDate.toLocaleDateString("el-GR", { weekday: "long", month: "long", day: "numeric" })}</h3>
              <p className="muted-text">{sessionsForFocusDay.length} συνεδρίες</p>
            </div>
            <button type="button" className="button button-primary" onClick={() => openDialogForDay(dayStartDate)}>
              Προσθήκη συνεδρίας
            </button>
          </div>
          {dayUnscheduledSessions.length ? (
            <div className="status-box status-error">
              Υπάρχουν συνεδρίες εκτός ωραρίου 08:00-22:00. Χρειάζεται επεξεργασία για να εμφανιστούν στο ωρολόγιο.
            </div>
          ) : null}

          <div className="day-schedule">
            {WEEK_HOURS.map((hour) => {
              const hourLabel = formatHourLabel(hour);
              const slotSessionsByBed = daySlotSessionsByBed.get(hour) ?? EMPTY_SLOT_BEDS;
              const slotTotal = slotSessionsByBed.reformer.length + slotSessionsByBed.cadillac.length;
              const slotDateLabel = dayStartDate.toLocaleDateString("el-GR", {
                weekday: "long",
                day: "2-digit",
                month: "2-digit",
              });

              return (
                <div key={hour} className="day-row">
                  <div className="day-hour-cell">{hourLabel}</div>
                  <div
                    role="button"
                    tabIndex={0}
                    className="week-slot day-slot"
                    aria-label={
                      slotTotal
                        ? `${slotDateLabel} ${hourLabel}. REFORMER ${slotSessionsByBed.reformer.length}/${BED_CAPACITY}, CADILLAC ${slotSessionsByBed.cadillac.length}/${BED_CAPACITY}`
                        : `Προσθήκη νέας συνεδρίας ${slotDateLabel} ${hourLabel}`
                    }
                    onClick={() => openDialogForDay(dayStartDate, hourLabel)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openDialogForDay(dayStartDate, hourLabel);
                      }
                    }}
                  >
                    <div className="week-slot-content">
                      <div className="week-bed-lanes">
                        {BED_TYPES.map((bedType) => {
                          const bedSessions = slotSessionsByBed[bedType];
                          const bedCount = bedSessions.length;
                          const bedState = getBedLoadState(bedCount);

                          return (
                            <section
                              key={bedType}
                              className={`week-bed-lane week-bed-lane-${bedState}`}
                              aria-label={`${formatBedType(bedType)} ${bedCount} από ${BED_CAPACITY}`}
                            >
                              <header className="week-bed-lane-head">
                                <strong className="week-bed-label">{formatBedType(bedType)}</strong>
                                <span
                                  className={`week-bed-badge week-bed-badge-${bedState}`}
                                  aria-label={`Πληρότητα ${formatBedType(bedType)} ${bedCount} από ${BED_CAPACITY}`}
                                >
                                  {bedCount}/{BED_CAPACITY}
                                </span>
                              </header>

                              {bedSessions.length ? (
                                <div className="week-bed-chips">
                                  {bedSessions.map((session) => {
                                    const clientName = clientsById[session.client_id]?.full_name ?? "Άγνωστος πελάτης";
                                    return (
                                      <button
                                        key={session.id}
                                        type="button"
                                        className={`week-session-chip ${bedCount > BED_CAPACITY ? "week-session-chip-overbooked" : ""}`}
                                        aria-label={`Επεξεργασία συνεδρίας ${clientName}, ${formatTime(session.time_start)} · ${formatBedType(session.bed_type)} (${bedCount}/${BED_CAPACITY})`}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleEditSession(session);
                                        }}
                                      >
                                        <span className="week-session-title">{clientName}</span>
                                        <span className="week-session-meta">
                                          {formatTime(session.time_start)} · {formatBedType(session.bed_type)}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="week-bed-empty">-</span>
                              )}
                            </section>
                          );
                        })}
                      </div>

                      {slotTotal === 0 ? (
                        <span className="week-slot-add-group" aria-hidden="true">
                          <span className="week-slot-add">+</span>
                          <span className="week-slot-add-label">Νέα συνεδρία</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : viewMode === "week" ? (
        <div className="card stack-sm">
          {weekUnscheduledSessions.length ? (
            <div className="status-box status-error">
              Υπάρχουν συνεδρίες χωρίς ώρα. Χρειάζεται επεξεργασία για να εμφανιστούν στο ωρολόγιο.
            </div>
          ) : null}

          <div className="week-schedule">
            <div className="week-schedule-header">
              <div className="week-hour-cell week-hour-head">Ώρα</div>
              {weekDays.map((date, dayIndex) => (
                <button
                  key={toIsoDate(date)}
                  type="button"
                  className={`week-day-head ${isSameDay(date, new Date()) ? "week-day-head-today" : ""}`}
                  onClick={() => handleSelectDay(date)}
                >
                  <span>{WEEKDAY_LABELS[dayIndex]}</span>
                  <strong>{date.toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit" })}</strong>
                </button>
              ))}
            </div>

            <div className="week-schedule-body">
              {WEEK_HOURS.map((hour) => {
                const hourLabel = formatHourLabel(hour);
                return (
                  <div key={hour} className="week-row">
                    <div className="week-hour-cell">{hourLabel}</div>
                    {weekDays.map((date) => {
                      const dateKey = toIsoDate(date);
                      const slotSessionsByBed = weekSlotSessionsByBed.get(`${dateKey}-${hour}`) ?? EMPTY_SLOT_BEDS;
                      const slotTotal = slotSessionsByBed.reformer.length + slotSessionsByBed.cadillac.length;
                      const slotDateLabel = date.toLocaleDateString("el-GR", {
                        weekday: "long",
                        day: "2-digit",
                        month: "2-digit",
                      });
                      return (
                        <div
                          key={`${dateKey}-${hour}`}
                          role="button"
                          tabIndex={0}
                          className={["week-slot", isSameDay(date, new Date()) ? "week-slot-today" : ""].filter(Boolean).join(" ")}
                          aria-label={
                            slotTotal
                              ? `${slotDateLabel} ${hourLabel}. REFORMER ${slotSessionsByBed.reformer.length}/${BED_CAPACITY}, CADILLAC ${slotSessionsByBed.cadillac.length}/${BED_CAPACITY}`
                              : `Προσθήκη νέας συνεδρίας ${slotDateLabel} ${hourLabel}`
                          }
                          onClick={() => openDialogForDay(date, hourLabel)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openDialogForDay(date, hourLabel);
                            }
                          }}
                        >
                          <div className="week-slot-content">
                            <div className="week-bed-lanes">
                              {BED_TYPES.map((bedType) => {
                                const bedSessions = slotSessionsByBed[bedType];
                                const bedCount = bedSessions.length;
                                const bedState = getBedLoadState(bedCount);

                                return (
                                  <section
                                    key={bedType}
                                    className={`week-bed-lane week-bed-lane-${bedState}`}
                                    aria-label={`${formatBedType(bedType)} ${bedCount} από ${BED_CAPACITY}`}
                                  >
                                    <header className="week-bed-lane-head">
                                      <strong className="week-bed-label">{formatBedType(bedType)}</strong>
                                      <span
                                        className={`week-bed-badge week-bed-badge-${bedState}`}
                                        aria-label={`Πληρότητα ${formatBedType(bedType)} ${bedCount} από ${BED_CAPACITY}`}
                                      >
                                        {bedCount}/{BED_CAPACITY}
                                      </span>
                                    </header>

                                    {bedSessions.length ? (
                                      <div className="week-bed-chips">
                                        {bedSessions.map((session) => {
                                          const clientName = clientsById[session.client_id]?.full_name ?? "Άγνωστος πελάτης";
                                          return (
                                            <button
                                              key={session.id}
                                              type="button"
                                              className={`week-session-chip ${bedCount > BED_CAPACITY ? "week-session-chip-overbooked" : ""}`}
                                              aria-label={`Επεξεργασία συνεδρίας ${clientName}, ${formatTime(session.time_start)} · ${formatBedType(session.bed_type)} (${bedCount}/${BED_CAPACITY})`}
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                handleEditSession(session);
                                              }}
                                            >
                                              <span className="week-session-title">{clientName}</span>
                                              <span className="week-session-meta">
                                                {formatTime(session.time_start)} · {formatBedType(session.bed_type)}
                                              </span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <span className="week-bed-empty">-</span>
                                    )}
                                  </section>
                                );
                              })}
                            </div>

                            {slotTotal === 0 ? (
                              <span className="week-slot-add-group" aria-hidden="true">
                                <span className="week-slot-add">+</span>
                                <span className="week-slot-add-label">Νέα συνεδρία</span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="calendar-weekdays">
            {WEEKDAY_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="calendar-wrap">
            <div className="calendar-grid">
              {monthDays.map((date) => {
                const dateKey = toIsoDate(date);
                const sessions = sessionsByDate.get(dateKey) ?? [];
                return (
                  <DayCell
                    key={dateKey}
                    date={date}
                    isCurrentMonth={isSameMonth(date, monthStartDate)}
                    isToday={isSameDay(date, new Date())}
                    isSelected={drawerDate ? isSameDay(date, drawerDate) : false}
                    sessions={sessions}
                    onSelect={handleSelectDay}
                  />
                );
              })}
            </div>
          </div>
        </>
      )}

      <SessionsDrawer
        isOpen={isDrawerOpen}
        date={drawerDate}
        sessions={sessionsForSelectedDay}
        clientsById={clientsById}
        onClose={handleCloseDrawer}
        onAdd={handleAddSession}
        onEdit={handleEditSession}
        onDelete={handleDeleteSession}
      />

      {user ? (
        <AddSessionDialog
          isOpen={isDialogOpen}
          onClose={() => {
            setIsDialogOpen(false);
            setEditingSession(null);
            setDialogInitialTime(undefined);
          }}
          onSave={handleSaveSession}
          userId={user.id}
          clients={clientsQuery.data ?? []}
          initialDate={drawerDate ?? focusDate}
          initialTime={dialogInitialTime}
          initialSession={editingSession}
          bedLoadByHour={dialogBedLoadByHour}
        />
      ) : null}
    </section>
  );
}
