"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import type { DashboardSnapshot } from "../lib/types";
import {
  calculateAge,
  formatCurrency,
  formatDateBr,
  formatDateTimeBr,
  normalizeText,
} from "../lib/utils";

interface DashboardViewProps {
  initialSnapshot: DashboardSnapshot | null;
  onLoadSnapshot: (options?: {
    search?: string;
    reviewOnly?: boolean;
    itemLimit?: number;
  }) => Promise<DashboardSnapshot>;
  onOpenPatient: (patientKey: string) => void;
  onCreateSessionForPatient: (name: string) => void;
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
  initialSnapshot,
  onLoadSnapshot,
  onOpenPatient,
  onCreateSessionForPatient,
}: DashboardViewProps) {
  const [reviewOnly, setReviewOnly] = useState(false);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(initialSnapshot);
  const [allItemsSnapshot, setAllItemsSnapshot] = useState<DashboardSnapshot | null>(null);
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
                style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}
              >
                <PatientRecord
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
  patient,
}: {
  patient: DashboardSnapshot["items"][number];
}) {
  const [activeTab, setActiveTab] = useState<"ficha" | "prontuario" | "financas">("ficha");

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
              {patient.cpf && <span>CPF {patient.cpf}</span>}
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
        patient={patient}
      />
    </>
  );
}

function PatientTabsContent({
  activeTab,
  patient,
}: {
  activeTab: "ficha" | "prontuario" | "financas";
  patient: DashboardSnapshot["items"][number];
}) {
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

          <div className="detail-grid">
            <div className="detail-item">
              <label>Sessoes</label>
              <strong>{patient.totalSessoes}</strong>
            </div>
            <div className="detail-item">
              <label>Total pago</label>
              <strong>{formatCurrency(patient.totalPago)}</strong>
            </div>
            <div className="detail-item">
              <label>Saldo</label>
              <strong>{formatCurrency(patient.saldo)}</strong>
            </div>
          </div>

          {patient.hasPatientRecord && (
            <>
              <section className="layout-grid">
                <h3 className="section-heading">Dados pessoais</h3>
                <div className="detail-grid">
                  <Detail label="Nascimento" value={formatDateBr(patient.nascimento)} />
                  <Detail label="Idade" value={calculateAge(patient.nascimento)} />
                  <Detail label="CPF" value={patient.cpf} />
                  <Detail label="Profissao" value={patient.profissao} />
                  <Detail label="Origem" value={patient.origem} />
                  <Detail label="Quem indicou" value={patient.quemIndicou} />
                </div>
              </section>

              <section className="layout-grid">
                <h3 className="section-heading">Contato e endereco</h3>
                <div className="detail-grid">
                  <Detail label="Telefone" value={patient.telefone} />
                  <Detail label="Email" value={patient.email} />
                  <Detail label="Contato emergencia" value={patient.contatoEmergencia} />
                  <Detail label="Nome contato" value={patient.nomeContato} />
                  <Detail label="Endereco" value={patient.endereco} />
                  <Detail label="Bairro" value={patient.bairro} />
                  <Detail label="Cidade" value={patient.cidade} />
                  <Detail label="CEP" value={patient.cep} />
                </div>
              </section>

              <section className="layout-grid">
                <h3 className="section-heading">Familia e observacoes</h3>
                <div className="detail-grid">
                  <Detail label="Nome do pai" value={patient.nomePai} />
                  <Detail label="Nome da mae" value={patient.nomeMae} />
                  <Detail
                    label="Observacoes"
                    value={patient.observacoes}
                    className="detail-item"
                  />
                </div>
              </section>
            </>
          )}

          <section className="layout-grid">
            <h3 className="section-heading">
              {patient.hasPatientRecord ? "Ultimas sessoes" : "Historico encontrado"}
            </h3>
            {patient.ultimasSessoes.length === 0 ? (
              <div className="empty-state">
                {patient.hasPatientRecord
                  ? "Nenhuma sessao encontrada para este paciente."
                  : "Nenhuma sessao encontrada para este historico."}
              </div>
            ) : (
              <div className="session-list">
                {patient.ultimasSessoes.map((entry, index) => (
                  <article
                    className="session-row"
                    key={[
                      patient.key,
                      entry.id ?? "sem-id",
                      entry.data ?? "sem-data",
                      index,
                    ].join("-")}
                  >
                    <div className="session-meta">
                      <strong>{formatDateTimeBr(entry.data)}</strong>
                      <span>{entry.tipo || "Sem tipo"}</span>
                      <span>Sessao {formatCurrency(entry.valor_sessao)}</span>
                      <span>Pago {formatCurrency(entry.valor_pago)}</span>
                    </div>
                    {entry.obs && <span>{entry.obs}</span>}
                    {entry.anotacoes_clinicas && <span>{entry.anotacoes_clinicas}</span>}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === "prontuario" && <div className="empty-state">Em branco por enquanto.</div>}
      {activeTab === "financas" && <div className="empty-state">Em branco por enquanto.</div>}
    </div>
  );
}

function Detail({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className ?? "detail-item"}>
      <label>{label}</label>
      <strong>{value || "-"}</strong>
    </div>
  );
}

