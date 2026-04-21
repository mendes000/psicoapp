"use client";

import { useDeferredValue, useEffect, useState } from "react";

import type { DashboardSnapshot } from "../lib/types";
import {
  calculateAge,
  formatCurrency,
  formatDateBr,
  formatDateTimeBr,
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
  onCreatePatient: () => void;
  onCreateSession: () => void;
  onOpenCalendar: () => void;
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
  onCreatePatient,
  onCreateSession,
  onOpenCalendar,
}: DashboardViewProps) {
  const [search, setSearch] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const deferredSearch = useDeferredValue(search);
  const searchLabel = deferredSearch.trim();
  const activeSnapshot = snapshot ?? initialSnapshot ?? EMPTY_SNAPSHOT;

  useEffect(() => {
    if (!searchLabel && !reviewOnly && initialSnapshot) {
      setSnapshot(initialSnapshot);
      setLoadError("");
    }
  }, [initialSnapshot, reviewOnly, searchLabel]);

  useEffect(() => {
    if (!searchLabel && !reviewOnly) {
      return;
    }

    let cancelled = false;

    setLoading(true);
    setLoadError("");

    void onLoadSnapshot({
      search: searchLabel,
      reviewOnly,
      itemLimit: reviewOnly ? 200 : 100,
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
  }, [onLoadSnapshot, reviewOnly, searchLabel]);

  const visible = activeSnapshot.items;

  return (
    <section className="layout-grid reveal">
      <div className="stats-grid">
        <article className="stat-card">
          <span>Cadastros ativos</span>
          <strong>{activeSnapshot.metrics.totalCadastros}</strong>
        </article>
        <article className="stat-card">
          <span>Sessoes registradas</span>
          <strong>{activeSnapshot.metrics.totalSessoes}</strong>
        </article>
        <article className="stat-card">
          <span>Total pago</span>
          <strong>{formatCurrency(activeSnapshot.metrics.totalPago)}</strong>
        </article>
        <article className="stat-card">
          <span>Saldo consolidado</span>
          <strong>{formatCurrency(activeSnapshot.metrics.saldo)}</strong>
        </article>
      </div>

      {activeSnapshot.reviewCount > 0 && (
        <div className="notice-card">
          <strong>Revisao de vinculos recomendada</strong>
          <p>
            {activeSnapshot.reviewCount} item(ns) do painel ficaram fora do vinculo
            automatico para evitar mistura de historicos entre homonimos ou nomes sem
            cadastro.
          </p>
          <div className="actions-row">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setReviewOnly((current) => !current)}
            >
              {reviewOnly ? "Voltar ao painel completo" : "Ver apenas pendencias"}
            </button>
          </div>
        </div>
      )}

      <div className="toolbar">
        <div className="search-row">
          <label className="field">
            <span>Buscar paciente, CPF ou email</span>
            <div className="input-shell">
              <input
                placeholder="Ex.: Ana, 12345678900 ou ana@email.com"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </label>
        </div>

        <div className="actions-row">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={onCreatePatient}
          >
            Novo paciente
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={onCreateSession}
          >
            Nova sessao
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={onOpenCalendar}
          >
            Abrir calendario
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          <div>
            <h2 className="panel-heading">Painel</h2>
            <p className="panel-subcopy">
              {reviewOnly
                ? searchLabel
                  ? `Pendencias para revisar com filtro "${searchLabel}".`
                  : `Mostrando ${activeSnapshot.totalCount} item(ns) pendentes de revisao.`
                : searchLabel
                  ? `Resultados para "${searchLabel}".`
                  : activeSnapshot.limited
                    ? "Mostrando os 20 pacientes mais recentes. Use a busca para localizar os demais."
                    : "Mostrando o panorama consolidado do atendimento."}
            </p>
          </div>
          <div className="panel-meta">
            <span className="pill">{activeSnapshot.reviewCount} para revisar</span>
            {reviewOnly && <span className="pill">Filtro de revisao ativo</span>}
            {loading && <span className="pill">Atualizando busca...</span>}
            <span className="pill">
              {searchLabel
                ? `${activeSnapshot.totalCount} encontrados`
                : activeSnapshot.limited
                  ? `${visible.length} visiveis`
                  : `${activeSnapshot.totalCount} visiveis`}
            </span>
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
              ? "Nenhuma pendencia encontrada para o filtro informado."
              : "Nenhum paciente encontrado para o filtro informado."}
          </div>
        ) : (
          <div className="stack-list">
            {visible.map((patient, index) => (
              <details
                className="stack-card reveal"
                key={patient.key}
                style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}
              >
                <summary>
                  <div className="stack-summary">
                    <div>
                      <strong>{patient.nome || "(Sem nome)"}</strong>
                      <div className="session-meta">
                        {patient.reviewState === "duplicate-name" && (
                          <span>Homonimo em {patient.duplicateNameCount} cadastros</span>
                        )}
                        {patient.reviewState === "entry-only" && (
                          <span>Historico sem vinculo automatico</span>
                        )}
                        {patient.tratamento && <span>{patient.tratamento}</span>}
                        {patient.cpf && <span>CPF {patient.cpf}</span>}
                        {patient.ultimaSessaoData && (
                          <span>Ultima sessao em {formatDateTimeBr(patient.ultimaSessaoData)}</span>
                        )}
                      </div>
                    </div>
                    <div className="session-meta">
                      <span>{patient.totalSessoes} sessoes</span>
                      <span>{formatCurrency(patient.totalPago)} recebidos</span>
                      <span>{formatCurrency(patient.saldo)} saldo</span>
                    </div>
                  </div>
                </summary>

                <div className="stack-body">
                  {patient.reviewState !== "ok" && (
                    <div className="notice-card inline-notice">
                      <strong>Revisao manual necessaria</strong>
                      <p>{patient.reviewNote}</p>
                    </div>
                  )}

                  <div className="actions-row">
                    {patient.hasPatientRecord && (
                      <button
                        className="btn btn-secondary"
                        type="button"
                        onClick={() => onOpenPatient(patient.patientKey)}
                      >
                        Editar cadastro
                      </button>
                    )}
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => onCreateSessionForPatient(patient.nome)}
                    >
                      {patient.hasPatientRecord ? "Registrar sessao" : "Abrir sessao com este nome"}
                    </button>
                  </div>

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
                              <span>
                                Sessao {formatCurrency(entry.valor_sessao)}
                              </span>
                              <span>Pago {formatCurrency(entry.valor_pago)}</span>
                            </div>
                            {entry.obs && <span>{entry.obs}</span>}
                            {entry.anotacoes_clinicas && (
                              <span>{entry.anotacoes_clinicas}</span>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
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
