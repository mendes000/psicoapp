"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";

import type { DashboardSnapshot, Entry } from "../lib/types";
import {
  calculateAge,
  formatCurrency,
  formatDateBr,
  formatDateTimeBr,
  normalizeText,
  parseFlexibleDate,
  toNumber,
} from "../lib/utils";

interface DashboardViewProps {
  entries: Entry[];
  initialSnapshot: DashboardSnapshot | null;
  onEditPatient: (patientKey: string) => void;
  onNewSession: () => void;
  onLoadSnapshot: (options?: {
    search?: string;
    reviewOnly?: boolean;
    itemLimit?: number;
  }) => Promise<DashboardSnapshot>;
  onUpdatePatientObservation: (args: {
    patientKey: string;
    nome: string;
    cpf: string;
    email: string;
    telefone: string;
    observacoes: string;
  }) => Promise<void>;
  onUpdateFinancialEntry: (args: {
    entryId: Entry["id"];
    valorPago: number;
    obs: string;
  }) => Promise<void>;
}

const EMPTY_SNAPSHOT: DashboardSnapshot = {
  metrics: {
    totalCadastros: 0,
    totalSessoes: 0,
    totalPago: 0,
    saldo: 0,
  },
  reviewCount: 0,
  totalCount: 0,
  limited: false,
  items: [],
};

type PatientTab = "financas" | "faltas" | "prontuario" | "ficha";
type SessionStatus = "paid" | "unpaid" | "missed" | "rescheduled";

export function DashboardView({
  entries,
  initialSnapshot,
  onEditPatient,
  onLoadSnapshot,
  onNewSession,
  onUpdateFinancialEntry,
  onUpdatePatientObservation,
}: DashboardViewProps) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(initialSnapshot);
  const [search, setSearch] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [activeTab, setActiveTab] = useState<PatientTab>("financas");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const deferredSearch = useDeferredValue(search);
  const activeSnapshot = snapshot ?? initialSnapshot ?? EMPTY_SNAPSHOT;

  useEffect(() => {
    if (!reviewOnly && !deferredSearch.trim()) {
      setSnapshot(initialSnapshot);
      setLoadError("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError("");

    void onLoadSnapshot({
      search: deferredSearch,
      reviewOnly,
      itemLimit: 5000,
    })
      .then((nextSnapshot) => {
        if (!cancelled) {
          setSnapshot(nextSnapshot);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Falha ao atualizar o painel.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [deferredSearch, initialSnapshot, onLoadSnapshot, reviewOnly]);

  const visiblePatients = activeSnapshot.items;
  const selectedPatient = useMemo(() => {
    if (visiblePatients.length === 0) {
      return null;
    }

    return (
      visiblePatients.find((patient) => patient.key === selectedKey) ??
      visiblePatients[0]
    );
  }, [selectedKey, visiblePatients]);

  useEffect(() => {
    if (!selectedPatient) {
      setSelectedKey("");
      return;
    }

    if (selectedKey !== selectedPatient.key) {
      setSelectedKey(selectedPatient.key);
    }
  }, [selectedKey, selectedPatient]);

  return (
    <section className="app clinical-dashboard reveal">
      <aside className="lista">
        <div className="lista-header">
          <div className="lista-title-row">
            <h2>Meus Pacientes</h2>
            <span>{activeSnapshot.totalCount || visiblePatients.length}</span>
          </div>
          <input
            className="busca"
            placeholder="Buscar paciente..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {activeSnapshot.reviewCount > 0 && (
            <button
              className={`review-toggle ${reviewOnly ? "on" : ""}`}
              type="button"
              onClick={() => setReviewOnly((current) => !current)}
            >
              {reviewOnly ? "Mostrando pendencias" : `${activeSnapshot.reviewCount} para revisar`}
            </button>
          )}
        </div>

        <div className="lista-scroll">
          {loading && <div className="sidebar-note">Atualizando...</div>}
          {loadError && <div className="sidebar-note danger">{loadError}</div>}
          {visiblePatients.length === 0 ? (
            <div className="sidebar-note">Nenhum paciente encontrado.</div>
          ) : (
            visiblePatients.map((patient) => (
              <button
                className={`pac-card ${selectedPatient?.key === patient.key ? "ativo" : ""}`}
                key={patient.key}
                type="button"
                onClick={() => {
                  setSelectedKey(patient.key);
                  setActiveTab("financas");
                }}
              >
                <span className={`avatar ${patient.saldo < 0 ? "verm" : "verde"}`}>
                  {initials(patient.nome)}
                </span>
                <span className="pac-info">
                  <span className="pac-nome">{patient.nome || "(Sem nome)"}</span>
                  <span className="pac-sub">{patientSubtitle(patient)}</span>
                </span>
                <span className={`tag ${patient.saldo < 0 ? "tag-v" : "tag-ok"}`}>
                  {patient.saldo < 0 ? "Devendo" : "Em dia"}
                </span>
              </button>
            ))
          )}
        </div>
        <button className="btn-nova" type="button" onClick={onNewSession}>
          + Nova Sessao Rapida
        </button>
      </aside>

      <div className="painel">
        {!selectedPatient ? (
          <div className="vazio">
            <div className="emoji">+</div>
            <p>Selecione um paciente para abrir o painel.</p>
          </div>
        ) : (
          <PatientPanel
            activeTab={activeTab}
            entries={entries}
            onEditPatient={onEditPatient}
            onNewSession={onNewSession}
            onTabChange={setActiveTab}
            onUpdateFinancialEntry={onUpdateFinancialEntry}
            onUpdatePatientObservation={onUpdatePatientObservation}
            patient={selectedPatient}
          />
        )}
      </div>
    </section>
  );
}

function PatientPanel({
  activeTab,
  entries,
  onEditPatient,
  onNewSession,
  onTabChange,
  onUpdateFinancialEntry,
  onUpdatePatientObservation,
  patient,
}: {
  activeTab: PatientTab;
  entries: Entry[];
  onEditPatient: (patientKey: string) => void;
  onNewSession: () => void;
  onTabChange: (tab: PatientTab) => void;
  onUpdateFinancialEntry: (args: {
    entryId: Entry["id"];
    valorPago: number;
    obs: string;
  }) => Promise<void>;
  onUpdatePatientObservation: (args: {
    patientKey: string;
    nome: string;
    cpf: string;
    email: string;
    telefone: string;
    observacoes: string;
  }) => Promise<void>;
  patient: DashboardSnapshot["items"][number];
}) {
  const patientEntries = usePatientEntries(entries, patient);
  const [exportOpen, setExportOpen] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [toast, setToast] = useState("");
  const unpaidEntries = patientEntries.filter(
    (entry) => toNumber(entry.valor_sessao) > toNumber(entry.valor_pago),
  );
  const paidEntries = patientEntries.filter(
    (entry) => toNumber(entry.valor_pago) > 0,
  );
  const missedEntries = patientEntries.filter((entry) => sessionStatus(entry) === "missed");
  const rescheduledEntries = patientEntries.filter(
    (entry) => sessionStatus(entry) === "rescheduled",
  );
  const attentionEntries = patientEntries.filter((entry) => {
    const status = sessionStatus(entry);
    return status === "unpaid" || status === "missed" || status === "rescheduled";
  });
  const openAmount = Math.max(0, -patient.saldo);
  const suggestedPayment = unpaidEntries.reduce(
    (sum, entry) => sum + Math.max(0, toNumber(entry.valor_sessao) - toNumber(entry.valor_pago)),
    0,
  );
  const sessionValue = sessionPrice(patientEntries);
  const visiblePaidEntries = showAllSessions ? paidEntries : paidEntries.slice(0, 12);
  const visibleProntuarioEntries = showAllSessions ? patientEntries : patientEntries.slice(0, 20);
  const hasHiddenSessions = paidEntries.length > 12 || patientEntries.length > 20;

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function handleExport(kind: "prontuario" | "financeiro" | "ficha" | "tudo") {
    const labels = {
      prontuario: "Prontuario completo",
      financeiro: "Relatorio financeiro",
      ficha: "Ficha do paciente",
      tudo: "Arquivo completo",
    };

    downloadTextFile({
      content: buildExportText(kind, patient, patientEntries),
      filename: `${safeFilename(patient.nome || "paciente")}-${kind}.txt`,
    });
    setExportOpen(false);
    setToast(`Exportado: ${labels[kind]} - ${patient.nome}`);
  }

  return (
    <>
      <div className="pac-header" data-session-value={sessionValue}>
        <div className="pac-header-top">
          <div className="pac-header-nome">
            <h1>{patient.nome || "(Sem nome)"}</h1>
            <p>
              {patient.cpf ? `CPF ${patient.cpf} · ` : ""}
              {patient.tratamento || "Terapia Individual"}
              {sessionPrice(patientEntries) > 0
                ? ` · ${formatCurrency(sessionPrice(patientEntries))} / sessao`
                : ""}
            </p>
          </div>
          <div className="header-acoes">
            <button className="btn-sessao-rapida btn-sess" type="button" onClick={onNewSession}>
              + Registrar sessao
            </button>
            <div className="export-wrap">
              <button
                aria-expanded={exportOpen}
                className="btn-export"
                type="button"
                onClick={() => setExportOpen((current) => !current)}
              >
                Exportar v
              </button>
              <div className={`export-menu ${exportOpen ? "on" : ""}`}>
                <button className="exp-item" type="button" onClick={() => handleExport("prontuario")}>
                  <span className="exp-icon ei-pront">P</span>
                  <span>
                    <strong>Prontuario completo</strong>
                    <small>Todas as anotacoes · PDF</small>
                  </span>
                </button>
                <div className="exp-sep" />
                <button className="exp-item" type="button" onClick={() => handleExport("financeiro")}>
                  <span className="exp-icon ei-fin">R$</span>
                  <span>
                    <strong>Relatorio financeiro</strong>
                    <small>Sessoes e pagamentos · PDF</small>
                  </span>
                </button>
                <div className="exp-sep" />
                <button className="exp-item" type="button" onClick={() => handleExport("ficha")}>
                  <span className="exp-icon ei-ficha">F</span>
                  <span>
                    <strong>Ficha do paciente</strong>
                    <small>Dados cadastrais · PDF</small>
                  </span>
                </button>
                <div className="exp-sep" />
                <button className="exp-item" type="button" onClick={() => handleExport("tudo")}>
                  <span className="exp-icon ei-all">T</span>
                  <span>
                    <strong>Exportar tudo</strong>
                    <small>Prontuario + Ficha + Financas</small>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="abas">
          <button
            className={`aba ${activeTab === "financas" ? "on" : ""}`}
            type="button"
            onClick={() => onTabChange("financas")}
          >
            Financeiro
          </button>
          <button
            className={`aba ${activeTab === "faltas" ? "on" : ""}`}
            type="button"
            onClick={() => onTabChange("faltas")}
          >
            Faltas
          </button>
          <button
            className={`aba ${activeTab === "prontuario" ? "on" : ""}`}
            type="button"
            onClick={() => onTabChange("prontuario")}
          >
            Prontuario
          </button>
          <button
            className={`aba ${activeTab === "ficha" ? "on" : ""}`}
            type="button"
            onClick={() => onTabChange("ficha")}
          >
            Ficha
          </button>
        </div>
      </div>

      <div className={`aba-content ${activeTab === "financas" ? "on" : ""}`}>
        <div className="fin-cards">
          <div className="fin-card fc-azul">
            <div className="fc-l">Sessoes realizadas</div>
            <div className="fc-v">{patient.totalSessoes} sessoes</div>
          </div>
          <div className="fin-card fc-verde">
            <div className="fc-l">Total recebido</div>
            <div className="fc-v">{formatCurrency(patient.totalPago)}</div>
          </div>
          <div className="fin-card fc-verm">
            <div className="fc-l">Em aberto</div>
            <div className="fc-v">{formatCurrency(openAmount)}</div>
          </div>
          <div className="fin-card fc-amar">
            <div className="fc-l">Faltas total</div>
            <div className="fc-v">{missedEntries.length} faltas</div>
          </div>
        </div>

        <div className="sec-titulo">Sessoes nao pagas e ocorrencias</div>
        <div className="sess-lista">
          {attentionEntries.length === 0 ? (
            <div className="empty-state">Nenhuma sessao em aberto, falta ou remarcacao.</div>
          ) : (
            attentionEntries.map((entry, index) => (
              <FinanceSessionRow
                entry={entry}
                index={patientEntries.length - index}
                key={rowKey(patient.key, entry, index)}
                onUpdateFinancialEntry={onUpdateFinancialEntry}
              />
            ))
          )}
        </div>

        {unpaidEntries.length > 0 && (
          <div className="reg-pgto">
            <h3>Registrar pagamento recebido</h3>
            <div className="reg-grid">
              <label className="campo">
                <span>Valor recebido</span>
                <input readOnly value={formatCurrency(suggestedPayment)} />
              </label>
              <label className="campo">
                <span>Sessoes contempladas</span>
                <input readOnly value={`${unpaidEntries.length} sessoes em aberto`} />
              </label>
            </div>
            <div className="preview-sessoes">
              <div className="ps-titulo">Marque cada sessao como paga na lista acima.</div>
              <div className="chips">
                {unpaidEntries.slice(0, 6).map((entry, index) => (
                  <span className="chip" key={rowKey(patient.key, entry, index)}>
                    {formatDateBr(entry.data)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="section-heading-row patient-section-row">
          <div className="sec-titulo">Historico de pagamentos</div>
          {hasHiddenSessions && (
            <button
              className="section-action-btn"
              type="button"
              onClick={() => setShowAllSessions((current) => !current)}
            >
              {showAllSessions ? "Ver ultimas sessoes" : "Ver todas as sessoes"}
            </button>
          )}
        </div>
        <div className="pgto-list">
          {paidEntries.length === 0 ? (
            <div className="empty-state">Nenhum pagamento registrado.</div>
          ) : (
            visiblePaidEntries.map((entry, index) => (
              <div className="pgto-item" key={rowKey(patient.key, entry, index)}>
                <div className="pgto-top">
                  <div>
                    <div className="pgto-title">{formatDateTimeBr(entry.data)}</div>
                    <div className="pgto-data-obs">{entry.obs || entry.tipo || "Pagamento registrado"}</div>
                  </div>
                  <div className="pgto-valor">{formatCurrency(entry.valor_pago)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={`aba-content ${activeTab === "faltas" ? "on" : ""}`}>
        <div className="faltas-bloco">
          <h3>Controle de Faltas e Remarcacoes</h3>
          <div className="faltas-resumo">
            <div className="fr-card frc-amar">
              <div className="frl">Total de faltas</div>
              <div className="frv">{missedEntries.length}</div>
            </div>
            <div className="fr-card frc-roxo">
              <div className="frl">Remarcacoes</div>
              <div className="frv">{rescheduledEntries.length}</div>
            </div>
            <div className="fr-card frc-verm">
              <div className="frl">Sem aviso previo</div>
              <div className="frv">{noNoticeCount(missedEntries)}</div>
            </div>
          </div>

          <div className="faltas-reg-titulo">Historico</div>
          {[...missedEntries, ...rescheduledEntries].length === 0 ? (
            <div className="empty-state">Nenhuma falta ou remarcacao registrada.</div>
          ) : (
            [...missedEntries, ...rescheduledEntries]
              .sort((left, right) => {
                const leftTime = parseFlexibleDate(left.data)?.getTime() ?? 0;
                const rightTime = parseFlexibleDate(right.data)?.getTime() ?? 0;
                return rightTime - leftTime;
              })
              .map((entry, index) => (
                <AbsenceItem
                  entry={entry}
                  key={rowKey(patient.key, entry, index)}
                />
              ))
          )}

          <div className="reg-falta">
            <div className="reg-falta-titulo">+ Registrar nova falta ou remarcacao</div>
            <div className="reg-falta-grid">
              <label className="campo">
                <span>Paciente</span>
                <input readOnly value={patient.nome || "(Sem nome)"} />
              </label>
              <label className="campo">
                <span>Registro</span>
                <select defaultValue="Falta - sem aviso">
                  <option>Falta - sem aviso</option>
                  <option>Falta - avisou mesmo dia</option>
                  <option>Remarcacao (&gt;24h)</option>
                  <option>Remarcacao (&lt;24h)</option>
                </select>
              </label>
              <button className="btn-reg-falta" type="button" onClick={onNewSession}>
                Registrar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={`aba-content ${activeTab === "prontuario" ? "on" : ""}`}>
        <EditableProntuarioObservation
          onUpdatePatientObservation={onUpdatePatientObservation}
          patient={patient}
        />
        <div className="section-heading-row patient-section-row">
          <div className="sec-titulo">Sessoes do prontuario</div>
          {hasHiddenSessions && (
            <button
              className="section-action-btn"
              type="button"
              onClick={() => setShowAllSessions((current) => !current)}
            >
              {showAllSessions ? "Ver ultimas sessoes" : "Ver todas as sessoes"}
            </button>
          )}
        </div>
        <div className="pront-lista">
          {patientEntries.length === 0 ? (
            <div className="empty-state">Nenhuma anotacao encontrada para este paciente.</div>
          ) : (
            visibleProntuarioEntries.map((entry, index) => (
              <ProntuarioItem
                entry={entry}
                initiallyOpen={index === 0}
                index={patientEntries.length - index}
                key={rowKey(patient.key, entry, index)}
              />
            ))
          )}
        </div>
      </div>

      <div className={`aba-content ${activeTab === "ficha" ? "on" : ""}`}>
        {patient.reviewState !== "ok" && (
          <div className="notice-card inline-notice">
            <strong>Revisao manual necessaria</strong>
            <p>{patient.reviewNote}</p>
          </div>
        )}
        <div className="ficha-actions">
          {patient.hasPatientRecord && (
            <button
              className="section-action-btn"
              type="button"
              onClick={() => onEditPatient(patient.patientKey)}
            >
              Editar ficha
            </button>
          )}
        </div>
        <div className="ficha-grid">
          {fichaItems(patient).map(([label, value, wide]) => (
            <div className={`ficha-campo ${wide ? "full" : ""}`} key={label}>
              <div className="fc-label">{label}</div>
              <div className="fc-val">{value || "(nao informado)"}</div>
            </div>
          ))}
        </div>
      </div>
      {toast && <div className="toast on">{toast}</div>}
    </>
  );
}

function FinanceSessionRow({
  entry,
  index,
  onUpdateFinancialEntry,
}: {
  entry: Entry;
  index: number;
  onUpdateFinancialEntry: (args: {
    entryId: Entry["id"];
    valorPago: number;
    obs: string;
  }) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const canEdit = entry.id !== null && entry.id !== undefined && entry.id !== "";
  const status = sessionStatus(entry);
  const isUnpaid = status === "unpaid";

  async function markPaid() {
    if (!canEdit || saving || !isUnpaid) {
      return;
    }

    setSaving(true);
    try {
      await onUpdateFinancialEntry({
        entryId: entry.id,
        valorPago: toNumber(entry.valor_sessao),
        obs: String(entry.obs ?? "").trim(),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`sess-row ${sessionRowClass(status)}`}>
      <div className={`num-ball ${sessionBallClass(status)}`}>
        {status === "missed" ? "x" : status === "rescheduled" ? "r" : index}
      </div>
      <div>
        <div className="sess-data">{formatDateBr(entry.data)}</div>
        <div className="sess-label">{entry.tipo || "Sessao"}</div>
        {entry.obs && <div className="sess-obs">{entry.obs}</div>}
      </div>
      <div className="ml-auto sess-actions">
        <span className={`status-pill ${sessionPillClass(status)}`}>
          {sessionStatusLabel(status)}
        </span>
        {isUnpaid && (
          <button
            className="mini-action"
            disabled={!canEdit || saving}
            type="button"
            onClick={() => void markPaid()}
          >
            {saving ? "Salvando..." : "Quitar"}
          </button>
        )}
      </div>
    </div>
  );
}

function AbsenceItem({ entry }: { entry: Entry }) {
  const status = sessionStatus(entry);
  const missed = status === "missed";

  return (
    <div className={`falta-item ${missed ? "ft-falta" : "ft-remarc"}`}>
      <div className={`fi-icon ${missed ? "fi-a" : "fi-r"}`}>
        {missed ? "!" : "r"}
      </div>
      <div className="fi-info">
        <div className="fi-data">{formatDateBr(entry.data)}</div>
        <div className="fi-label">{entry.tipo || sessionStatusLabel(status)}</div>
        <div className="fi-obs">{entry.obs || (missed ? "Falta registrada" : "Remarcacao registrada")}</div>
      </div>
      <span className={`status-pill ${sessionPillClass(status)}`}>
        {sessionStatusLabel(status)}
      </span>
    </div>
  );
}

function ProntuarioItem({
  entry,
  index,
  initiallyOpen,
}: {
  entry: Entry;
  index: number;
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const note = String(entry.anotacoes_clinicas ?? "").trim();

  return (
    <article className="pront-item">
      <button
        className={`pront-top ${open ? "aberto" : ""}`}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <div>
          <div className="pront-dt">{formatDateTimeBr(entry.data)} · {index}a sessao</div>
          <div className="pront-resumo">{note || "(evolucao clinica nao preenchida)"}</div>
        </div>
        <span className={`pront-seta ${open ? "aberto" : ""}`}>v</span>
      </button>
      <div className={`pront-corpo ${open ? "on" : ""}`}>
        {note || "(evolucao clinica nao preenchida)"}
      </div>
    </article>
  );
}

function EditableProntuarioObservation({
  onUpdatePatientObservation,
  patient,
}: {
  onUpdatePatientObservation: (args: {
    patientKey: string;
    nome: string;
    cpf: string;
    email: string;
    telefone: string;
    observacoes: string;
  }) => Promise<void>;
  patient: DashboardSnapshot["items"][number];
}) {
  const currentValue = String(patient.observacoes ?? "").trim();
  const [draft, setDraft] = useState(currentValue);
  const [saving, setSaving] = useState(false);
  const canEdit = patient.hasPatientRecord && patient.patientKey !== "";

  useEffect(() => {
    setDraft(currentValue);
  }, [currentValue, patient.key]);

  async function handleBlur() {
    const nextValue = draft.trim();
    if (!canEdit || saving || currentValue === nextValue) {
      return;
    }

    setSaving(true);
    try {
      await onUpdatePatientObservation({
        patientKey: patient.patientKey,
        nome: patient.nome,
        cpf: patient.cpf,
        email: patient.email,
        telefone: patient.telefone,
        observacoes: nextValue,
      });
    } catch {
      setDraft(currentValue);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pront-add pront-editor">
      <label>
        <span>{saving ? "Salvando..." : "Observacoes gerais do prontuario"}</span>
        <textarea
          disabled={!canEdit || saving}
          placeholder="Registrar observacoes do prontuario..."
          value={draft}
          onBlur={() => void handleBlur()}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
    </div>
  );
}

function usePatientEntries(entries: Entry[], patient: DashboardSnapshot["items"][number]) {
  return useMemo(() => {
    const key = normalizeText(patient.nome);
    const source = entries.filter((entry) => normalizeText(entry.nome) === key);
    const items = source.length > 0 ? source : patient.ultimasSessoes;

    return [...items].sort((left, right) => {
      const leftTime = parseFlexibleDate(left.data)?.getTime() ?? 0;
      const rightTime = parseFlexibleDate(right.data)?.getTime() ?? 0;
      return rightTime - leftTime;
    });
  }, [entries, patient]);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? "P"}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function patientSubtitle(patient: DashboardSnapshot["items"][number]) {
  if (patient.saldo < 0) {
    return `${Math.abs(patient.saldo / Math.max(sessionPrice(patient.ultimasSessoes), 1)).toFixed(0)} sessoes em aberto · ${formatCurrency(Math.abs(patient.saldo))}`;
  }

  if (patient.ultimaSessaoData) {
    return `Ultima sessao: ${formatDateBr(patient.ultimaSessaoData)}`;
  }

  return patient.tratamento || "Sem sessoes registradas";
}

function sessionPrice(entries: Entry[]) {
  const entry = entries.find((item) => toNumber(item.valor_sessao) > 0);
  return toNumber(entry?.valor_sessao);
}

function sessionStatus(entry: Entry): SessionStatus {
  const text = normalizeText([
    entry.tipo,
    entry.obs,
    entry.situacao,
    entry.status,
  ].join(" "));

  if (text.includes("remarc")) {
    return "rescheduled";
  }

  if (text.includes("falta") || text.includes("faltou")) {
    return "missed";
  }

  return toNumber(entry.valor_pago) > 0 ? "paid" : "unpaid";
}

function sessionRowClass(status: SessionStatus) {
  return {
    paid: "pago",
    unpaid: "nao",
    missed: "falta",
    rescheduled: "remarc",
  }[status];
}

function sessionBallClass(status: SessionStatus) {
  return {
    paid: "nb-ok",
    unpaid: "nb-nao",
    missed: "nb-falta",
    rescheduled: "nb-remarc",
  }[status];
}

function sessionPillClass(status: SessionStatus) {
  return {
    paid: "sp-ok",
    unpaid: "sp-nao",
    missed: "sp-falta",
    rescheduled: "sp-remarc",
  }[status];
}

function sessionStatusLabel(status: SessionStatus) {
  return {
    paid: "Pago",
    unpaid: "Nao pago",
    missed: "Faltou",
    rescheduled: "Remarcada",
  }[status];
}

function noNoticeCount(entries: Entry[]) {
  return entries.filter((entry) => {
    const text = normalizeText([entry.tipo, entry.obs, entry.situacao].join(" "));
    return text.includes("sem aviso") || text.includes("sem previo");
  }).length;
}

function buildExportText(
  kind: "prontuario" | "financeiro" | "ficha" | "tudo",
  patient: DashboardSnapshot["items"][number],
  entries: Entry[],
) {
  const sections: string[] = [];

  function addFicha() {
    sections.push(
      [
        "FICHA DO PACIENTE",
        `Nome: ${patient.nome}`,
        `CPF: ${patient.cpf || "(nao informado)"}`,
        `Telefone: ${patient.telefone || "(nao informado)"}`,
        `Email: ${patient.email || "(nao informado)"}`,
        `Tratamento: ${patient.tratamento || "(nao informado)"}`,
        `Observacoes: ${patient.observacoes || "(nao informado)"}`,
      ].join("\n"),
    );
  }

  function addFinanceiro() {
    sections.push(
      [
        "FINANCEIRO",
        `Sessoes: ${patient.totalSessoes}`,
        `Total recebido: ${formatCurrency(patient.totalPago)}`,
        `Em aberto: ${formatCurrency(Math.max(0, -patient.saldo))}`,
        "",
        ...entries.map((entry) =>
          [
            formatDateTimeBr(entry.data),
            entry.tipo || "Sessao",
            `Valor: ${formatCurrency(entry.valor_sessao)}`,
            `Pago: ${formatCurrency(entry.valor_pago)}`,
            `Status: ${sessionStatusLabel(sessionStatus(entry))}`,
            entry.obs ? `Obs: ${entry.obs}` : "",
          ].filter(Boolean).join(" | "),
        ),
      ].join("\n"),
    );
  }

  function addProntuario() {
    sections.push(
      [
        "PRONTUARIO",
        ...entries.map((entry) =>
          [
            formatDateTimeBr(entry.data),
            String(entry.anotacoes_clinicas ?? "").trim() || "(evolucao clinica nao preenchida)",
          ].join(" - "),
        ),
      ].join("\n"),
    );
  }

  if (kind === "ficha" || kind === "tudo") {
    addFicha();
  }

  if (kind === "financeiro" || kind === "tudo") {
    addFinanceiro();
  }

  if (kind === "prontuario" || kind === "tudo") {
    addProntuario();
  }

  return sections.join("\n\n---\n\n");
}

function downloadTextFile({ content, filename }: { content: string; filename: string }) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFilename(value: string) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "paciente";
}

function rowKey(patientKey: string, entry: Entry, index: number) {
  return [patientKey, entry.id ?? "sem-id", entry.data ?? "sem-data", index].join("-");
}

function fichaItems(patient: DashboardSnapshot["items"][number]): Array<[string, string, boolean?]> {
  return [
    ["Nome completo", patient.nome],
    ["CPF", patient.cpf],
    ["Data de nascimento", [formatDateBr(patient.nascimento), calculateAge(patient.nascimento) && `${calculateAge(patient.nascimento)} anos`].filter(Boolean).join(" · ")],
    ["Telefone / WhatsApp", patient.telefone],
    ["E-mail", patient.email],
    ["Modalidade", patient.tratamento],
    ["Profissao", patient.profissao],
    ["Origem", patient.origem],
    ["Quem indicou", patient.quemIndicou],
    ["Contato de emergencia", patient.contatoEmergencia],
    ["Endereco", [patient.endereco, patient.bairro, patient.cidade, patient.cep].filter(Boolean).join(" · "), true],
    ["Familia", [patient.nomePai && `Pai: ${patient.nomePai}`, patient.nomeMae && `Mae: ${patient.nomeMae}`].filter(Boolean).join(" · "), true],
    ["Observacoes gerais", patient.observacoes, true],
  ];
}
