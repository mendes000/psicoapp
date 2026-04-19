"use client";

import { useDeferredValue, useEffect, useState } from "react";

import type {
  Entry,
  Patient,
  SessionEditorContext,
  SessionFormValues,
  SessionSeed,
} from "@/lib/types";
import {
  emptySessionForm,
  entryToSessionForm,
  formatCurrency,
  formatDateTimeBr,
  normalizeText,
  parseFlexibleDate,
  similarity,
  toInputTimeValue,
  toNumber,
} from "@/lib/utils";

interface SessionsViewProps {
  patients: Patient[];
  entries: Entry[];
  seed: SessionSeed | null;
  onSeedConsumed: () => void;
  onSchedule: (
    form: SessionFormValues,
    context: SessionEditorContext,
  ) => Promise<void>;
  onSaveSession: (
    form: SessionFormValues,
    context: SessionEditorContext,
  ) => Promise<{ remarcar: boolean }>;
}

export function SessionsView({
  patients,
  entries,
  seed,
  onSeedConsumed,
  onSchedule,
  onSaveSession,
}: SessionsViewProps) {
  const [form, setForm] = useState<SessionFormValues>(emptySessionForm());
  const [context, setContext] = useState<SessionEditorContext>({});
  const [busyAction, setBusyAction] = useState<"schedule" | "save" | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const patientNames = Array.from(
    new Set(
      patients
        .map((patient) => String(patient.nome ?? "").trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, "pt-BR"));

  useEffect(() => {
    if (!seed) {
      return;
    }

    setForm((current) => ({
      ...current,
      ...emptySessionForm(seed.form),
      ...seed.form,
    }));
    setContext(seed.context ?? {});
    onSeedConsumed();
  }, [onSeedConsumed, seed]);

  const filteredEntries = entries.filter((entry) => {
    if (!deferredSearch.trim()) {
      return true;
    }

    const searchValue = deferredSearch.trim();
    const normalized = normalizeText(searchValue);
    const name = normalizeText(entry.nome);

    return (
      name.includes(normalized) ||
      similarity(name, normalized) >= 0.72 ||
      String(entry.obs ?? "").toLowerCase().includes(searchValue.toLowerCase())
    );
  });

  function prefillFromEntry(entry: Entry) {
    setForm(entryToSessionForm(entry));
    setContext({ entryId: entry.id });
  }

  function canSelectStatus() {
    const date = parseFlexibleDate(`${form.data}T${form.hora}`);
    if (!date) {
      return false;
    }
    return Date.now() > date.getTime();
  }

  async function handleSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.nome.trim()) {
      return;
    }

    setBusyAction("schedule");
    try {
      await onSchedule(form, context);
      setContext({});
      setForm((current) =>
        emptySessionForm({
          nome: current.nome,
          data: current.data,
          hora: current.hora,
        }),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSave() {
    if (!form.nome.trim()) {
      return;
    }

    setBusyAction("save");
    try {
      const result = await onSaveSession(form, context);

      if (result.remarcar) {
        const now = new Date();
        setContext({});
        setForm((current) =>
          emptySessionForm({
            nome: current.nome,
            data: current.data,
            hora: toInputTimeValue(now),
          }),
        );
        return;
      }

      setContext({});
      setForm((current) =>
        emptySessionForm({
          nome: current.nome,
        }),
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="layout-grid reveal">
      <div className="panel">
        <div className="panel-title">
          <div>
            <h2>Lancamento de sessoes</h2>
            <p className="panel-subcopy">
              Agende atendimentos futuros ou registre sessoes realizadas, faltas e edicoes.
            </p>
          </div>
          {context.entryId != null && (
            <span className="pill">Editando sessao existente</span>
          )}
          {context.scheduleId != null && (
            <span className="pill">Editando agendamento existente</span>
          )}
        </div>

        <form className="layout-grid" onSubmit={handleSchedule}>
          <div className="input-grid">
            <label className="field">
              <span>Paciente</span>
              <div className="input-shell">
                <input
                  list="patient-name-options"
                  placeholder="Selecione ou digite o nome"
                  value={form.nome}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, nome: event.target.value }))
                  }
                />
                <datalist id="patient-name-options">
                  {patientNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            </label>

            <label className="field">
              <span>Data</span>
              <div className="input-shell">
                <input
                  type="date"
                  value={form.data}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, data: event.target.value }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Horario</span>
              <div className="input-shell">
                <input
                  type="time"
                  value={form.hora}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, hora: event.target.value }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Tipo</span>
              <div className="select-shell">
                <select
                  value={form.tipo}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, tipo: event.target.value }))
                  }
                >
                  <option value="Sessao Individual">Sessao Individual</option>
                  <option value="Avaliacao">Avaliacao</option>
                </select>
              </div>
            </label>

            <label className="field">
              <span>Valor da sessao</span>
              <div className="input-shell">
                <input
                  inputMode="decimal"
                  value={form.valorSessao}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      valorSessao: event.target.value,
                    }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Valor pago</span>
              <div className="input-shell">
                <input
                  inputMode="decimal"
                  value={form.valorPago}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      valorPago: event.target.value,
                    }))
                  }
                />
              </div>
            </label>
          </div>

          <div className="input-grid">
            <label className="field">
              <span>Evolucao clinica</span>
              <div className="textarea-shell">
                <textarea
                  value={form.anotacoesClinicas}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      anotacoesClinicas: event.target.value,
                    }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Observacoes</span>
              <div className="textarea-shell">
                <textarea
                  value={form.obs}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, obs: event.target.value }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Situacao</span>
              <div className="select-shell">
                <select
                  disabled={!canSelectStatus()}
                  value={form.situacao}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      situacao: event.target.value as SessionFormValues["situacao"],
                    }))
                  }
                >
                  <option value="Realizado">Realizado</option>
                  <option value="Remarcado">Remarcado</option>
                  <option value="Falta abonada">Falta abonada</option>
                  <option value="Falta cobrada">Falta cobrada</option>
                </select>
              </div>
            </label>
          </div>

          <div className="actions-row">
            <button
              className="btn btn-secondary"
              disabled={busyAction !== null}
              type="submit"
            >
              {busyAction === "schedule"
                ? context.scheduleId != null
                  ? "Atualizando..."
                  : "Agendando..."
                : context.scheduleId != null
                  ? "Atualizar agendamento"
                  : "Agendar"}
            </button>
            <button
              className="btn btn-primary"
              disabled={busyAction !== null || !canSelectStatus()}
              type="button"
              onClick={() => void handleSave()}
            >
              {busyAction === "save" ? "Salvando..." : "Salvar atendimento"}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setContext({});
                setForm(emptySessionForm());
              }}
            >
              Limpar
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="panel-title">
          <div>
            <h2>Tabela de sessoes</h2>
            <p className="panel-subcopy">
              Clique em uma sessao para carregar no formulario e editar.
            </p>
          </div>
          <label className="field" style={{ minWidth: 280 }}>
            <span>Filtrar sessoes</span>
            <div className="input-shell">
              <input
                placeholder="Buscar por paciente ou observacao"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </label>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="empty-state">Nenhuma sessao encontrada.</div>
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Paciente</th>
                  <th>Tipo</th>
                  <th>Valor sessao</th>
                  <th>Valor pago</th>
                  <th>Acao</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr key={String(entry.id ?? entry.data ?? entry.nome)}>
                    <td>{formatDateTimeBr(entry.data)}</td>
                    <td>{entry.nome || "Sem nome"}</td>
                    <td>{entry.tipo || "Sem tipo"}</td>
                    <td>{formatCurrency(entry.valor_sessao)}</td>
                    <td>{formatCurrency(entry.valor_pago)}</td>
                    <td>
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => prefillFromEntry(entry)}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {entries.length > 0 && (
          <div className="status-row" style={{ marginTop: 18 }}>
            <span className="pill">
              Ultima sessao: {formatDateTimeBr(entries[0]?.data)}
            </span>
            <span className="pill">
              Ticket medio:{" "}
              {formatCurrency(
                entries.reduce((sum, entry) => sum + toNumber(entry.valor_pago), 0) /
                  Math.max(entries.length, 1),
              )}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
