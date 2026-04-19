"use client";

import { useDeferredValue, useMemo, useState } from "react";

import type {
  ConsolidatedPatient,
  Entry,
  Patient,
} from "../lib/types";
import {
  calculateAge,
  consolidatePatients,
  formatCurrency,
  formatDateBr,
  formatDateTimeBr,
  matchesConsolidatedSearch,
  toNumber,
} from "../lib/utils";

interface DashboardViewProps {
  patients: Patient[];
  entries: Entry[];
  onOpenPatient: (patientKey: string) => void;
  onCreateSessionForPatient: (name: string) => void;
  onNavigate: (view: "pacientes" | "sessoes" | "calendario") => void;
}

function metricValue(list: ConsolidatedPatient[], key: "totalSessoes" | "totalPago" | "saldo") {
  return list.reduce((sum, patient) => sum + toNumber(patient[key]), 0);
}

export function DashboardView({
  patients,
  entries,
  onOpenPatient,
  onCreateSessionForPatient,
  onNavigate,
}: DashboardViewProps) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const consolidated = useMemo(
    () => consolidatePatients(patients, entries),
    [patients, entries],
  );
  const metrics = useMemo(
    () => ({
      totalSessoes: metricValue(consolidated, "totalSessoes"),
      totalPago: metricValue(consolidated, "totalPago"),
      saldo: metricValue(consolidated, "saldo"),
    }),
    [consolidated],
  );
  const visible = useMemo(() => {
    const search = deferredSearch.trim();
    if (!search) {
      return consolidated.slice(0, 20);
    }

    return consolidated.filter((patient) =>
      matchesConsolidatedSearch(patient, search),
    );
  }, [consolidated, deferredSearch]);

  return (
    <section className="layout-grid reveal">
      <div className="stats-grid">
        <article className="stat-card">
          <span>Pacientes consolidados</span>
          <strong>{consolidated.length}</strong>
        </article>
        <article className="stat-card">
          <span>Sessoes registradas</span>
          <strong>{metrics.totalSessoes}</strong>
        </article>
        <article className="stat-card">
          <span>Total pago</span>
          <strong>{formatCurrency(metrics.totalPago)}</strong>
        </article>
        <article className="stat-card">
          <span>Saldo consolidado</span>
          <strong>{formatCurrency(metrics.saldo)}</strong>
        </article>
      </div>

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
            onClick={() => onNavigate("pacientes")}
          >
            Novo paciente
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => onNavigate("sessoes")}
          >
            Nova sessao
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => onNavigate("calendario")}
          >
            Abrir calendario
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          <div>
            <h2>Painel de pacientes</h2>
            <p className="panel-subcopy">
              {deferredSearch.trim()
                ? `Resultados para "${deferredSearch.trim()}".`
                : "Mostrando os 20 pacientes mais recentes. Use a busca para localizar os demais."}
            </p>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="empty-state">
            Nenhum paciente encontrado para o filtro informado.
          </div>
        ) : (
          <div className="stack-list">
            {visible.map((patient, index) => (
              <details
                className="stack-card reveal"
                key={patient.nomeKey}
                style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}
              >
                <summary>
                  <div className="stack-summary">
                    <div>
                      <strong>{patient.nome || "(Sem nome)"}</strong>
                      <div className="session-meta">
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
                  <div className="actions-row">
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => onOpenPatient(patient.nomeKey)}
                    >
                      Editar cadastro
                    </button>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => onCreateSessionForPatient(patient.nome)}
                    >
                      Registrar sessao
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

                  <section className="layout-grid">
                    <h3 className="section-heading">Ultimas sessoes</h3>
                    {patient.ultimasSessoes.length === 0 ? (
                      <div className="empty-state">
                        Nenhuma sessao encontrada para este paciente.
                      </div>
                    ) : (
                      <div className="session-list">
                        {patient.ultimasSessoes.map((entry) => (
                          <article
                            className="session-row"
                            key={`${patient.nomeKey}-${entry.id ?? entry.data}`}
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
