"use client";

import { useDeferredValue, useEffect, useState } from "react";

import type {
  Patient,
  PatientColumnMap,
  PatientFormValues,
  PatientSelectionRequest,
} from "../lib/types";
import {
  DEFAULT_ORIGINS,
  DEFAULT_TREATMENTS,
  emptyPatientForm,
  formatCepBr,
  formatDateInput,
  formatPhoneBr,
  normalizeText,
  parseFlexibleDate,
  parseTreatments,
  patientToFormValues,
  serializeTreatments,
  similarity,
  uniqueTexts,
} from "../lib/utils";

const CREATE_NEW_KEY = "__new__";

interface PatientsViewProps {
  patients: Patient[];
  columns: PatientColumnMap;
  selectedRequest: PatientSelectionRequest | null;
  onSelectionHandled: () => void;
  onSavePatient: (
    form: PatientFormValues,
    existing: Patient | null,
  ) => Promise<void>;
}

export function PatientsView({
  patients,
  columns,
  selectedRequest,
  onSelectionHandled,
  onSavePatient,
}: PatientsViewProps) {
  const [selectedKey, setSelectedKey] = useState(CREATE_NEW_KEY);
  const [form, setForm] = useState<PatientFormValues>(emptyPatientForm());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [newTreatment, setNewTreatment] = useState("");
  const [cepFeedback, setCepFeedback] = useState("");

  const deferredSearch = useDeferredValue(search);
  const allTreatments = uniqueTexts([
    ...DEFAULT_TREATMENTS,
    ...patients.flatMap((patient) => parseTreatments(patient.tratamento)),
    ...parseTreatments(form.tratamento),
  ]);

  const availableOrigins = uniqueTexts([
    ...DEFAULT_ORIGINS,
    ...patients.map((patient) => patient.origem),
    form.origem,
  ]);

  const filteredPatients = patients.filter((patient) => {
    if (!deferredSearch.trim()) {
      return true;
    }

    const text = deferredSearch.trim();
    const key = normalizeText(text);
    const name = normalizeText(patient.nome);
    const email = String(patient.email ?? "").toLowerCase();
    const cpf = String(patient.cpf ?? "").toLowerCase();

    return (
      name.includes(key) ||
      similarity(name, key) >= 0.72 ||
      email.includes(text.toLowerCase()) ||
      cpf.includes(text.toLowerCase())
    );
  });

  useEffect(() => {
    if (!selectedRequest) {
      return;
    }

    const nextPatient = patients.find(
      (patient) => normalizeText(patient.nome) === selectedRequest.key,
    );

    if (nextPatient) {
      setSelectedKey(patientStorageKey(nextPatient));
      setForm(patientToFormValues(nextPatient, columns));
    }

    onSelectionHandled();
  }, [columns, onSelectionHandled, patients, selectedRequest]);

  useEffect(() => {
    const cepDigits = form.cep.replace(/\D+/g, "");
    if (cepDigits.length !== 8) {
      setCepFeedback("");
      return;
    }

    let cancelled = false;

    async function lookupCep() {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
        const payload = (await response.json()) as {
          erro?: boolean;
          logradouro?: string;
          bairro?: string;
          localidade?: string;
        };

        if (cancelled) {
          return;
        }

        if (payload.erro) {
          setCepFeedback("CEP nao encontrado.");
          return;
        }

        setCepFeedback("");
        setForm((current) => ({
          ...current,
          endereco: current.endereco.trim() || String(payload.logradouro ?? "").trim(),
          bairro: current.bairro.trim() || String(payload.bairro ?? "").trim(),
          cidade: current.cidade.trim() || String(payload.localidade ?? "").trim(),
        }));
      } catch {
        if (!cancelled) {
          setCepFeedback("Nao foi possivel consultar o CEP agora.");
        }
      }
    }

    void lookupCep();

    return () => {
      cancelled = true;
    };
  }, [form.cep]);

  function currentPatient() {
    return patients.find((patient) => patientStorageKey(patient) === selectedKey) ?? null;
  }

  function selectPatient(patient: Patient | null) {
    if (!patient) {
      setSelectedKey(CREATE_NEW_KEY);
      setForm(emptyPatientForm());
      setNewTreatment("");
      return;
    }

    setSelectedKey(patientStorageKey(patient));
    setForm(patientToFormValues(patient, columns));
    setNewTreatment("");
  }

  function toggleTreatment(treatment: string) {
    const current = parseTreatments(form.tratamento);
    const exists = current.some(
      (item) => normalizeText(item) === normalizeText(treatment),
    );

    const next = exists
      ? current.filter((item) => normalizeText(item) !== normalizeText(treatment))
      : [...current, treatment];

    setForm((value) => ({
      ...value,
      tratamento: serializeTreatments(next),
    }));
  }

  function addCustomTreatment() {
    if (!newTreatment.trim()) {
      return;
    }

    const next = serializeTreatments([
      ...parseTreatments(form.tratamento),
      newTreatment.trim(),
    ]);

    setForm((value) => ({ ...value, tratamento: next }));
    setNewTreatment("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.nome.trim()) {
      setCepFeedback("O nome do paciente e obrigatorio.");
      return;
    }

    if (form.nascimento.trim() && !parseFlexibleDate(form.nascimento)) {
      setCepFeedback("Nascimento invalido. Use o formato DD/MM/AAAA.");
      return;
    }

    setSaving(true);
    setCepFeedback("");

    try {
      await onSavePatient(form, currentPatient());
      selectPatient(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="two-col reveal">
      <aside className="panel">
        <div className="panel-title">
          <div>
            <h2>Pacientes</h2>
            <p className="panel-subcopy">
              Selecione um cadastro existente para editar ou crie um novo.
            </p>
          </div>
          <button className="btn btn-secondary" type="button" onClick={() => selectPatient(null)}>
            Novo
          </button>
        </div>

        <label className="field">
          <span>Buscar por nome, CPF ou email</span>
          <div className="input-shell">
            <input
              placeholder="Filtrar pacientes"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </label>

        <div className="subtle-divider" />

        <div className="patient-list">
          <button
            className={`patient-list-item ${selectedKey === CREATE_NEW_KEY ? "active" : ""}`}
            type="button"
            onClick={() => selectPatient(null)}
          >
            <strong>+ Criar novo paciente</strong>
            <span>Abre um formulario em branco.</span>
          </button>

          {filteredPatients.map((patient) => (
            <button
              className={`patient-list-item ${
                selectedKey === patientStorageKey(patient) ? "active" : ""
              }`}
              key={patientStorageKey(patient)}
              type="button"
              onClick={() => selectPatient(patient)}
            >
              <strong>{patient.nome || "(Sem nome)"}</strong>
              <span>{patient.cpf ? `CPF ${patient.cpf}` : patient.email || "Sem documento"}</span>
            </button>
          ))}
        </div>
      </aside>

      <form className="panel layout-grid" onSubmit={handleSubmit}>
        <div className="panel-title">
          <div>
            <h2>{selectedKey === CREATE_NEW_KEY ? "Novo paciente" : "Editar paciente"}</h2>
            <p className="panel-subcopy">
              Os campos seguem a mesma estrutura usada no Streamlit, mas agora em um formulario web.
            </p>
          </div>
        </div>

        <section className="form-section">
          <h3 className="section-heading">Origem e identificacao</h3>
          <div className="input-grid">
            <label className="field">
              <span>Origem do lead</span>
              <div className="select-shell">
                <select
                  value={form.origem}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, origem: event.target.value }))
                  }
                >
                  {availableOrigins.map((origin) => (
                    <option key={origin} value={origin}>
                      {origin}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <label className="field">
              <span>Quem indicou</span>
              <div className="input-shell">
                <input
                  placeholder="Nome da indicacao"
                  value={form.quemIndicou}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      quemIndicou: event.target.value,
                    }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>CPF</span>
              <div className="input-shell">
                <input
                  placeholder="Somente numeros"
                  value={form.cpf}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      cpf: event.target.value.replace(/\D+/g, ""),
                    }))
                  }
                />
              </div>
            </label>
          </div>
        </section>

        <section className="form-section">
          <h3 className="section-heading">Dados do paciente</h3>
          <div className="input-grid">
            <label className="field">
              <span>Nome completo</span>
              <div className="input-shell">
                <input
                  placeholder="Nome do paciente"
                  value={form.nome}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, nome: event.target.value }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Nascimento</span>
              <div className="input-shell">
                <input
                  placeholder="DD/MM/AAAA"
                  value={form.nascimento}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      nascimento: formatDateInput(event.target.value),
                    }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Profissao</span>
              <div className="input-shell">
                <input
                  placeholder="Profissao"
                  value={form.profissao}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      profissao: event.target.value,
                    }))
                  }
                />
              </div>
            </label>
          </div>

          <div className="layout-grid">
            <div>
              <span className="section-label">Tratamentos</span>
              <div className="chip-row" style={{ marginTop: 10 }}>
                {allTreatments.map((treatment) => {
                  const active = parseTreatments(form.tratamento).some(
                    (item) => normalizeText(item) === normalizeText(treatment),
                  );

                  return (
                    <button
                      className={`chip ${active ? "active" : ""}`}
                      key={treatment}
                      type="button"
                      onClick={() => toggleTreatment(treatment)}
                    >
                      {treatment}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="input-grid">
              <label className="field">
                <span>Novo tratamento</span>
                <div className="input-shell">
                  <input
                    placeholder="Adicionar tratamento"
                    value={newTreatment}
                    onChange={(event) => setNewTreatment(event.target.value)}
                  />
                </div>
              </label>

              <div className="actions-row" style={{ alignItems: "end" }}>
                <button className="btn btn-secondary" type="button" onClick={addCustomTreatment}>
                  Adicionar
                </button>
              </div>

              <label className="field">
                <span>Tratamento salvo</span>
                <div className="textarea-shell">
                  <textarea
                    value={form.tratamento}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        tratamento: event.target.value,
                      }))
                    }
                  />
                </div>
              </label>
            </div>
          </div>
        </section>

        <section className="form-section">
          <h3 className="section-heading">Contato</h3>
          <div className="input-grid">
            <label className="field">
              <span>Telefone</span>
              <div className="input-shell">
                <input
                  placeholder="(00) 90000-0000"
                  value={form.telefone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      telefone: formatPhoneBr(event.target.value),
                    }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Email</span>
              <div className="input-shell">
                <input
                  placeholder="email@dominio.com"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Nome do contato de emergencia</span>
              <div className="input-shell">
                <input
                  placeholder="Contato principal"
                  value={form.nomeContato}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      nomeContato: event.target.value,
                    }))
                  }
                />
              </div>
            </label>
          </div>

          <div className="input-grid">
            <label className="field">
              <span>Contato de emergencia</span>
              <div className="input-shell">
                <input
                  placeholder="Telefone ou observacao"
                  value={form.contatoEmergencia}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      contatoEmergencia: event.target.value,
                    }))
                  }
                />
              </div>
            </label>
          </div>
        </section>

        <section className="form-section">
          <h3 className="section-heading">Endereco e filiacao</h3>
          <div className="input-grid">
            <label className="field">
              <span>CEP</span>
              <div className="input-shell">
                <input
                  placeholder="00000-000"
                  value={form.cep}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      cep: formatCepBr(event.target.value),
                    }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Endereco</span>
              <div className="input-shell">
                <input
                  placeholder="Rua, numero, complemento"
                  value={form.endereco}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      endereco: event.target.value,
                    }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Bairro</span>
              <div className="input-shell">
                <input
                  placeholder="Bairro"
                  value={form.bairro}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      bairro: event.target.value,
                    }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Cidade</span>
              <div className="input-shell">
                <input
                  placeholder="Cidade"
                  value={form.cidade}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      cidade: event.target.value,
                    }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Nome do pai</span>
              <div className="input-shell">
                <input
                  placeholder="Nome do pai"
                  value={form.nomePai}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      nomePai: event.target.value,
                    }))
                  }
                />
              </div>
            </label>

            <label className="field">
              <span>Nome da mae</span>
              <div className="input-shell">
                <input
                  placeholder="Nome da mae"
                  value={form.nomeMae}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      nomeMae: event.target.value,
                    }))
                  }
                />
              </div>
            </label>
          </div>
        </section>

        <section className="form-section">
          <h3 className="section-heading">Observacoes</h3>
          <label className="field">
            <span>Anotacoes gerais</span>
            <div className="textarea-shell">
              <textarea
                placeholder="Observacoes do cadastro"
                value={form.observacoes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    observacoes: event.target.value,
                  }))
                }
              />
            </div>
          </label>
        </section>

        {cepFeedback && <p className="helper-text">{cepFeedback}</p>}

        <div className="actions-row">
          <button className="btn btn-primary" disabled={saving} type="submit">
            {saving
              ? "Salvando..."
              : selectedKey === CREATE_NEW_KEY
                ? "Salvar novo paciente"
                : "Atualizar paciente"}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => selectPatient(currentPatient())}
          >
            Recarregar formulario
          </button>
        </div>
      </form>
    </section>
  );
}

function patientStorageKey(patient: Patient) {
  if (patient.id != null) {
    return `id:${patient.id}`;
  }

  if (patient.cpf) {
    return `cpf:${patient.cpf}`;
  }

  return `nome:${normalizeText(patient.nome)}`;
}
