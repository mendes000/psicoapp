"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

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
  onLoadSnapshot: (options?: {
    search?: string;
    reviewOnly?: boolean;
    itemLimit?: number;
  }) => Promise<DashboardSnapshot>;
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

export function DashboardView({
  entries,
  initialSnapshot,
  onEditPatient,
  onLoadSnapshot,
  onUpdateFinancialEntry,
}: DashboardViewProps) {
  const [reviewOnly, setReviewOnly] = useState(false);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(initialSnapshot);
  const [allItemsSnapshot, setAllItemsSnapshot] = useState<DashboardSnapshot | null>(null);
  const [openPatientKey, setOpenPatientKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [optionSearch, setOptionSearch] = useState("");
  const deferredOptionSearch = useDeferredValue(optionSearch);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const activeSnapshot = snapshot ?? initialSnapshot ?? EMPTY_SNAPSHOT;

  useEffect(() => {
    setAllItemsSnapshot(null);
  }, [initialSnapshot]);

  useEffect(() => {
    if (!reviewOnly) {
      setSnapshot(initialSnapshot);
      setLoadError("");
      return;
    }

    let cancelled = false;

    setLoading(true);
    setLoadError("");

    void onLoadSnapshot({
      reviewOnly,
      itemLimit: 5000,
    })
      .then((nextSnapshot) => {
        if (cancelled) {
          return;
        }

        setSnapshot(nextSnapshot);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setLoadError(
          error instanceof Error ? error.message : "Falha ao atualizar o painel.",
        );
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialSnapshot, onLoadSnapshot, reviewOnly]);

  useEffect(() => {
    if (!dropdownOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [dropdownOpen]);

  const patientOptions = useMemo(() => {
    const source = allItemsSnapshot?.items ?? activeSnapshot.items;

    return Array.from(
      new Set(
        source
          .map((patient) => String(patient.nome ?? "").trim())
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right, "pt-BR"));
  }, [activeSnapshot.items, allItemsSnapshot?.items]);

  const filteredOptions = useMemo(() => {
    const search = normalizeText(deferredOptionSearch);
    const selectedSet = new Set(selectedNames);
    const selectedOptions = patientOptions.filter((name) => selectedSet.has(name));

    if (!search) {
      return [
        ...selectedOptions,
        ...patientOptions.filter((name) => !selectedSet.has(name)),
      ];
    }

    const matchingOptions = patientOptions.filter(
      (name) => !selectedSet.has(name) && normalizeText(name).includes(search),
    );

    return [...selectedOptions, ...matchingOptions];
  }, [deferredOptionSearch, patientOptions, selectedNames]);

  const visible = useMemo(() => {
    if (selectedNames.length === 0) {
      return activeSnapshot.items;
    }

    const source = reviewOnly
      ? activeSnapshot.items
      : allItemsSnapshot?.items ?? activeSnapshot.items;
    const selectedSet = new Set(selectedNames);

    return source.filter((patient) => selectedSet.has(patient.nome));
  }, [activeSnapshot.items, allItemsSnapshot?.items, reviewOnly, selectedNames]);

  useEffect(() => {
    if (!openPatientKey) {
      return;
    }

    const stillVisible = visible.some((patient) => patient.key === openPatientKey);
    if (!stillVisible) {
      setOpenPatientKey(null);
    }
  }, [openPatientKey, visible]);

  async function ensureAllItemsLoaded() {
    if (allItemsSnapshot || optionsLoading) {
      return;
    }

    setOptionsLoading(true);
    try {
      const nextSnapshot = await onLoadSnapshot({ itemLimit: 5000 });
      setAllItemsSnapshot(nextSnapshot);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Falha ao carregar a lista de pacientes.",
      );
    } finally {
      setOptionsLoading(false);
    }
  }

  function toggleSelection(name: string) {
    setSelectedNames((current) =>
      current.includes(name)
        ? current.filter((value) => value !== name)
        : [...current, name],
    );
  }

  function triggerLabel() {
    if (selectedNames.length === 0) {
      return "Selecionar pacientes";
    }

    if (selectedNames.length <= 2) {
      return selectedNames.join(", ");
    }

    return `${selectedNames.length} pacientes selecionados`;
  }

  return (
    <section className="layout-grid reveal">
      {activeSnapshot.reviewCount > 0 && (
        <div className="dashboard-hero-review-slot">
          <div className="review-hint review-hint-hero">
            <span className="review-hint-text">
              {activeSnapshot.reviewCount} vinculacao{activeSnapshot.reviewCount > 1 ? "es" : ""} para revisar
            </span>
            <button
              className="review-hint-action"
              type="button"
              onClick={() => setReviewOnly((current) => !current)}
            >
              {reviewOnly ? "mostrar tudo" : "ver pendencias"}
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-title">
          <div className="panel-title-main panel-title-main-inline">
            <h2 className="panel-heading">Painel</h2>
            <div className="search-row panel-search-row">
              <div className="field panel-search-field" ref={dropdownRef}>
                <div className="multi-select">
                  <button
                    aria-expanded={dropdownOpen}
                    className="multi-select-trigger"
                    type="button"
                    onClick={() => {
                      const nextOpen = !dropdownOpen;
                      setDropdownOpen(nextOpen);
                      if (nextOpen) {
                        void ensureAllItemsLoaded();
                      }
                    }}
                  >
                    <span className="multi-select-summary">{triggerLabel()}</span>
                    <span className="multi-select-caret">{dropdownOpen ? "^" : "v"}</span>
                  </button>

                  {dropdownOpen && (
                    <div className="multi-select-menu">
                      <div className="input-shell multi-select-search-shell">
                        <input
                          autoFocus
                          placeholder="Buscar nome..."
                          value={optionSearch}
                          onChange={(event) => setOptionSearch(event.target.value)}
                        />
                      </div>

                      {selectedNames.length > 0 && (
                        <div className="multi-select-actions">
                          <button
                            className="review-hint-action"
                            type="button"
                            onClick={() => setSelectedNames([])}
                          >
                            Limpar selecao
                          </button>
                        </div>
                      )}

                      <div className="multi-select-list">
                        {optionsLoading ? (
                          <div className="empty-state multi-select-empty">
                            Carregando pacientes...
                          </div>
                        ) : filteredOptions.length === 0 ? (
                          <div className="empty-state multi-select-empty">
                            Nenhum paciente encontrado.
                          </div>
                        ) : (
                          filteredOptions.map((name) => (
                            <label className="multi-select-option" key={name}>
                              <input
                                checked={selectedNames.includes(name)}
                                type="checkbox"
                                onChange={() => toggleSelection(name)}
                              />
                              <span>{name}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="panel-meta panel-meta-dashboard">
            {reviewOnly && <span className="pill">Filtro de revisao ativo</span>}
            {(loading || optionsLoading) && <span className="pill">Atualizando painel...</span>}
          </div>
        </div>

        {loadError && (
          <div className="flash info">
            Atualizacao parcial no painel. {loadError}
          </div>
        )}

        {visible.length === 0 ? (
          <div className="empty-state">
            {reviewOnly
              ? "Nenhuma pendencia encontrada para os pacientes selecionados."
              : selectedNames.length > 0
                ? "Nenhum paciente encontrado para a selecao informada."
                : "Nenhum paciente encontrado."}
          </div>
        ) : (
          <div className="stack-list">
            {visible.map((patient, index) => (
              <details
                className="stack-card reveal"
                key={patient.key}
                open={openPatientKey === patient.key}
                style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}
                onToggle={(event) => {
                  const isOpen = event.currentTarget.open;
                  setOpenPatientKey((current) =>
                    isOpen
                      ? patient.key
                      : current === patient.key
                        ? null
                        : current,
                  );
                }}
              >
                <PatientRecord
                  entries={entries}
                  onEditPatient={onEditPatient}
                  onUpdateFinancialEntry={onUpdateFinancialEntry}
                  patient={patient}
                />
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PatientRecord({
  entries,
  onEditPatient,
  onUpdateFinancialEntry,
  patient,
}: {
  entries: Entry[];
  onEditPatient: (patientKey: string) => void;
  onUpdateFinancialEntry: (args: {
    entryId: Entry["id"];
    valorPago: number;
    obs: string;
  }) => Promise<void>;
  patient: DashboardSnapshot["items"][number];
}) {
  const [activeTab, setActiveTab] = useState<"ficha" | "prontuario" | "financas">("ficha");
  const [showAllSessions, setShowAllSessions] = useState(false);
  const patientEntries = useMemo(() => {
    const patientKey = normalizeText(patient.nome);
    const source = entries.filter((entry) => normalizeText(String(entry.nome ?? "")) === patientKey);
    const items = source.length > 0 ? source : patient.ultimasSessoes;

    return [...items].sort((left, right) => {
      const leftTime = parseFlexibleDate(left.data)?.getTime() ?? 0;
      const rightTime = parseFlexibleDate(right.data)?.getTime() ?? 0;
      return rightTime - leftTime;
    });
  }, [entries, patient]);

  return (
    <>
      <summary>
        <div className="stack-summary stack-summary-with-tabs">
          <div className="patient-summary-main">
            <div className="patient-summary-heading">
              <strong>{patient.nome || "(Sem nome)"}</strong>
              {patient.ultimaSessaoData && (
                <span className="patient-summary-last-session">
                  Ultima sessao em {formatDateTimeBr(patient.ultimaSessaoData)}
                </span>
              )}
            </div>
            <div className="session-meta">
              {patient.reviewState === "duplicate-name" && (
                <span>Homonimo em {patient.duplicateNameCount} cadastros</span>
              )}
              {patient.reviewState === "entry-only" && (
                <span>Historico sem vinculo automatico</span>
              )}
              {patient.tratamento && <span>{patient.tratamento}</span>}
            </div>
          </div>

          <div
            className="record-tabs"
            role="tablist"
            aria-label={`Abas de ${patient.nome}`}
            onClick={(event) => event.preventDefault()}
          >
            <button
              className={`record-tab ${activeTab === "ficha" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTab("ficha")}
            >
              Ficha
            </button>
            <button
              className={`record-tab ${activeTab === "prontuario" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTab("prontuario")}
            >
              Prontuario
            </button>
            <button
              className={`record-tab ${activeTab === "financas" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTab("financas")}
            >
              Financas
            </button>
          </div>
        </div>
      </summary>

      <PatientTabsContent
        activeTab={activeTab}
        onEditPatient={onEditPatient}
        onToggleShowAllSessions={() => setShowAllSessions((current) => !current)}
        onUpdateFinancialEntry={onUpdateFinancialEntry}
        patientEntries={patientEntries}
        patient={patient}
        showAllSessions={showAllSessions}
      />
    </>
  );
}

function PatientTabsContent({
  activeTab,
  onEditPatient,
  onToggleShowAllSessions,
  onUpdateFinancialEntry,
  patientEntries,
  patient,
  showAllSessions,
}: {
  activeTab: "ficha" | "prontuario" | "financas";
  onEditPatient: (patientKey: string) => void;
  onToggleShowAllSessions: () => void;
  onUpdateFinancialEntry: (args: {
    entryId: Entry["id"];
    valorPago: number;
    obs: string;
  }) => Promise<void>;
  patientEntries: Entry[];
  patient: DashboardSnapshot["items"][number];
  showAllSessions: boolean;
}) {
  const hasMoreProntuarioSessions = patientEntries.length > patient.ultimasSessoes.length;
  const hasMoreFinanceSessions = patientEntries.length > 10;
  const prontuarioEntries = showAllSessions ? patientEntries : patient.ultimasSessoes;
  const financeEntries = showAllSessions ? patientEntries : patientEntries.slice(0, 10);
  const personalItems: Array<[label: string, value: string]> = [
    ["Nascimento", formatDateBr(patient.nascimento)],
    ["Idade", calculateAge(patient.nascimento)],
    ["CPF", patient.cpf],
    ["Profissao", patient.profissao],
    ["Origem", patient.origem],
    ["Quem indicou", patient.quemIndicou],
  ];
  const contactItems: Array<[label: string, value: string]> = [
    ["Telefone", patient.telefone],
    ["Email", patient.email],
    ["Contato emergencia", patient.contatoEmergencia],
    ["Nome contato", patient.nomeContato],
    ["Endereco", patient.endereco],
    ["Bairro", patient.bairro],
    ["Cidade", patient.cidade],
    ["CEP", patient.cep],
  ];
  const familyItems: Array<[label: string, value: string]> = [
    ["Nome do pai", patient.nomePai],
    ["Nome da mae", patient.nomeMae],
    ["Observacoes", patient.observacoes],
  ];

  return (
    <div className="stack-body">
      {activeTab === "ficha" && (
        <>
          {patient.reviewState !== "ok" && (
            <div className="notice-card inline-notice">
              <strong>Revisao manual necessaria</strong>
              <p>{patient.reviewNote}</p>
            </div>
          )}

          {patient.hasPatientRecord && (
            <>
              <section className="layout-grid">
                <div className="section-heading-row">
                  <h3 className="section-heading">Ficha do paciente</h3>
                  <button
                    className="section-action-btn"
                    type="button"
                    onClick={() => onEditPatient(patient.patientKey)}
                  >
                    Editar
                  </button>
                </div>

                <CompactDetailList items={personalItems} />
              </section>

              <CompactDetailSection
                items={contactItems}
                title="Contato e endereco"
              />

              <CompactDetailSection
                items={familyItems}
                title="Familia e observacoes"
              />
            </>
          )}
        </>
      )}

      {activeTab === "prontuario" && (
        <>
          <section className="layout-grid">
            <div className="section-heading-row">
              <h3 className="section-heading">
                {patient.hasPatientRecord ? "Ultimas sessoes" : "Historico encontrado"}
              </h3>
              {hasMoreProntuarioSessions && (
                <button
                  className="section-action-btn"
                  type="button"
                  onClick={onToggleShowAllSessions}
                >
                  {showAllSessions ? "Mostrar ultimas sessoes" : "Mostrar todas as sessoes"}
                </button>
              )}
            </div>
            {prontuarioEntries.length === 0 ? (
              <div className="empty-state">
                {patient.hasPatientRecord
                  ? "Nenhuma sessao encontrada para este paciente."
                  : "Nenhuma sessao encontrada para este historico."}
              </div>
            ) : (
              <div className="compact-entry-stack">
                {prontuarioEntries.map((entry, index) => (
                  <article
                    className="compact-inline-row"
                    key={[
                      patient.key,
                      entry.id ?? "sem-id",
                      entry.data ?? "sem-data",
                      index,
                    ].join("-")}
                  >
                    <strong className="compact-inline-date">
                      {formatDateTimeBr(entry.data)}
                    </strong>
                    {String(entry.anotacoes_clinicas ?? "").trim() ? (
                      <span className="compact-inline-value">
                        {String(entry.anotacoes_clinicas ?? "").trim()}
                      </span>
                    ) : (
                      <span className="compact-inline-placeholder">
                        (campo nao preenchido)
                      </span>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      {activeTab === "financas" && (
        <section className="layout-grid">
          <div className="section-heading-row">
            <h3 className="section-heading">Sessoes</h3>
            {hasMoreFinanceSessions && (
              <button
                className="section-action-btn"
                type="button"
                onClick={onToggleShowAllSessions}
              >
                {showAllSessions ? "Mostrar ultimas sessoes" : "Mostrar todas as sessoes"}
              </button>
            )}
          </div>
          {financeEntries.length === 0 ? (
            <div className="empty-state">Nenhuma sessao encontrada para este paciente.</div>
          ) : (
            <div className="compact-finance-table">
              <div className="compact-finance-head">
                <div className="compact-finance-meta-head">
                  <span>Data</span>
                  <span>Valor da sessao</span>
                  <span>Pagamento</span>
                </div>
                <span>Observacoes</span>
              </div>
              {financeEntries.map((entry, index) => {
                return (
                  <EditableFinanceRow
                    entry={entry}
                    key={[
                      patient.key,
                      entry.id ?? "sem-id",
                      entry.data ?? "sem-data",
                      index,
                    ].join("-")}
                    onUpdateFinancialEntry={onUpdateFinancialEntry}
                  />
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function CompactDetailList({
  fallbackItem,
  items,
}: {
  fallbackItem?: [label: string, value: string];
  items: Array<[label: string, value: string]>;
}) {
  const filledItems = items.filter(([, value]) => String(value ?? "").trim());

  if (filledItems.length === 0) {
    if (!fallbackItem) {
      return null;
    }

    filledItems.push(fallbackItem);
  }

  return (
    <div className="compact-detail-list">
      {filledItems.map(([label, value]) => (
        <div className="compact-detail-row" key={label}>
          <span className="compact-detail-label">{label}</span>
          <strong className="compact-detail-value">{value}</strong>
        </div>
      ))}
    </div>
  );
}

function CompactDetailSection({
  items,
  title,
}: {
  items: Array<[label: string, value: string]>;
  title: string;
}) {
  const filledItems = items.filter(([, value]) => String(value ?? "").trim());

  if (filledItems.length === 0) {
    return null;
  }

  return (
    <section className="layout-grid">
      <h3 className="section-heading">{title}</h3>
      <CompactDetailList items={filledItems} />
    </section>
  );
}

function EditableFinanceRow({
  entry,
  onUpdateFinancialEntry,
}: {
  entry: Entry;
  onUpdateFinancialEntry: (args: {
    entryId: Entry["id"];
    valorPago: number;
    obs: string;
  }) => Promise<void>;
}) {
  const entryId = entry.id;
  const canEdit = entryId !== null && entryId !== undefined && entryId !== "";
  const paidFromEntry = toNumber(entry.valor_pago) > 0;
  const [isPaid, setIsPaid] = useState(paidFromEntry);
  const [observationDraft, setObservationDraft] = useState(String(entry.obs ?? "").trim());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIsPaid(paidFromEntry);
  }, [paidFromEntry]);

  useEffect(() => {
    setObservationDraft(String(entry.obs ?? "").trim());
  }, [entry.id, entry.obs]);

  async function persist(nextState?: { isPaid?: boolean; obs?: string }) {
    if (!canEdit) {
      return;
    }

    const nextPaid = nextState?.isPaid ?? isPaid;
    const nextObs = nextState?.obs ?? observationDraft;

    setSaving(true);
    try {
      await onUpdateFinancialEntry({
        entryId,
        valorPago: nextPaid ? toNumber(entry.valor_sessao) : 0,
        obs: nextObs,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle() {
    if (!canEdit || saving) {
      return;
    }

    const nextPaid = !isPaid;
    setIsPaid(nextPaid);

    try {
      await persist({ isPaid: nextPaid });
    } catch {
      setIsPaid(paidFromEntry);
    }
  }

  async function handleObservationBlur() {
    const currentValue = String(entry.obs ?? "").trim();
    const nextValue = observationDraft.trim();

    if (!canEdit || saving || currentValue === nextValue) {
      if (currentValue !== observationDraft) {
        setObservationDraft(currentValue);
      }
      return;
    }

    try {
      await persist({ obs: nextValue });
    } catch {
      setObservationDraft(currentValue);
    }
  }

  return (
    <article className="compact-finance-row">
      <div className="compact-finance-meta">
        <strong className="compact-inline-date">{formatDateBr(entry.data)}</strong>
        <strong className="compact-inline-value">
          {formatCurrency(entry.valor_sessao)}
        </strong>
        <div className="payment-toggle finance-toggle compact-finance-payment">
          <button
            aria-checked={isPaid}
            aria-label={isPaid ? "Sessao paga" : "Sessao nao paga"}
            className={`payment-switch ${isPaid ? "active" : ""}`}
            disabled={!canEdit || saving}
            role="switch"
            tabIndex={canEdit ? 0 : -1}
            type="button"
            onClick={() => void handleToggle()}
          />
        </div>
      </div>
      <input
        className="compact-observation-editor"
        disabled={!canEdit || saving}
        placeholder="(campo nao preenchido)"
        value={observationDraft}
        onBlur={() => void handleObservationBlur()}
        onChange={(event) => setObservationDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
    </article>
  );
}


