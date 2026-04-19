"use client";

import { useMemo, useState } from "react";

import type { CalendarEvent } from "../lib/types";
import {
  addDays,
  formatCurrency,
  formatDateBr,
  isSameDate,
  monthGridBounds,
  startOfWeek,
  toDateKey,
  toInputDateValue,
  toInputTimeValue,
} from "../lib/utils";

type CalendarMode = "Semanal" | "Mensal";

interface CalendarViewProps {
  events: CalendarEvent[];
  onCreateAt: (date: string, time: string) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}

export function CalendarView({
  events,
  onCreateAt,
  onOpenEvent,
}: CalendarViewProps) {
  const [mode, setMode] = useState<CalendarMode>("Semanal");
  const [anchor, setAnchor] = useState(new Date());
  const [defaultTime, setDefaultTime] = useState("09:00");

  const eventsMap = useMemo(() => {
    const nextMap = new Map<string, CalendarEvent[]>();

    for (const event of events) {
      const key = toDateKey(event.startsAt);
      const current = nextMap.get(key) ?? [];
      current.push(event);
      nextMap.set(key, current);
    }

    for (const [key, current] of nextMap.entries()) {
      current.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
      nextMap.set(key, current);
    }

    return nextMap;
  }, [events]);

  function move(offset: number) {
    if (mode === "Semanal") {
      setAnchor((current) => addDays(current, offset * 7));
      return;
    }

    setAnchor((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [anchor]);

  const monthDays = useMemo(() => {
    const monthBounds = monthGridBounds(anchor);
    const days: Date[] = [];

    for (
      let cursor = new Date(monthBounds.start);
      cursor <= monthBounds.end;
      cursor = addDays(cursor, 1)
    ) {
      days.push(cursor);
    }

    return days;
  }, [anchor]);

  const visibleDays = mode === "Semanal" ? weekDays : monthDays;

  return (
    <section className="panel reveal">
      <div className="panel-title">
        <div>
          <h2>Calendario de sessoes</h2>
          <p className="panel-subcopy">
            Clique em um dia para abrir o formulario de sessoes com data e horario preenchidos.
          </p>
        </div>
      </div>

      <div className="calendar-toolbar">
        <div className="actions-row">
          <button className="btn" type="button" onClick={() => move(-1)}>
            {"<"}
          </button>
          <button className="btn" type="button" onClick={() => move(1)}>
            {">"}
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => setAnchor(new Date())}>
            Hoje
          </button>
        </div>

        <div className="actions-row">
          <label className="field">
            <span>Visualizacao</span>
            <div className="select-shell">
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as CalendarMode)}
              >
                <option value="Semanal">Semanal</option>
                <option value="Mensal">Mensal</option>
              </select>
            </div>
          </label>

          <label className="field">
            <span>Horario padrao</span>
            <div className="input-shell">
              <input
                type="time"
                value={defaultTime}
                onChange={(event) => setDefaultTime(event.target.value)}
              />
            </div>
          </label>
        </div>
      </div>

      <div className="status-row">
        <span className="pill">
          Periodo atual:{" "}
          {mode === "Semanal"
            ? `${formatDateBr(weekDays[0])} a ${formatDateBr(weekDays[6])}`
            : anchor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </span>
        <span className="pill">{events.length} eventos totais</span>
      </div>

      <div className="calendar-grid">
        {visibleDays.map((day) => {
          const key = toDateKey(day);
          const dayEvents = eventsMap.get(key) ?? [];
          const isMuted = mode === "Mensal" && day.getMonth() !== anchor.getMonth();

          return (
            <article
              className={`calendar-day ${isMuted ? "muted-day" : ""}`}
              key={key}
            >
              <header>
                <div>
                  <h4>
                    {day.toLocaleDateString("pt-BR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </h4>
                </div>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => onCreateAt(toInputDateValue(day), defaultTime)}
                >
                  +
                </button>
              </header>

              {dayEvents.length === 0 ? (
                <div className="empty-state">
                  {isSameDate(day, new Date())
                    ? "Nenhum evento hoje."
                    : "Nenhum evento neste dia."}
                </div>
              ) : (
                dayEvents.map((event, index) => (
                  <button
                    className={`calendar-event source-${event.source}`}
                    key={[
                      event.source,
                      event.id ?? "sem-id",
                      event.data ?? "sem-data",
                      event.nome ?? "sem-nome",
                      index,
                    ].join("-")}
                    type="button"
                    onClick={() => onOpenEvent(event)}
                  >
                    <strong>
                      {event.startsAt.toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      | {event.nome || "Sem nome"}
                    </strong>
                    <span>{event.tipo || "Sem tipo"}</span>
                    <span>{formatCurrency(event.valorPago)}</span>
                  </button>
                ))
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
