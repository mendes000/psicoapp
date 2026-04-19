"use client";

import { useState } from "react";

interface LoginPanelProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  isBusy: boolean;
  error: string;
}

export function LoginPanel({ onSubmit, isBusy, error }: LoginPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");

    if (!email.trim() || !password.trim()) {
      setLocalError("Informe email e senha para entrar.");
      return;
    }

    await onSubmit(email.trim(), password);
  }

  return (
    <div className="login-shell">
      <div className="login-card shell-card reveal">
        <section className="login-copy">
          <div className="eyebrow">PsicoApp em Next.js</div>
          <h1>Painel clinico pronto para acesso web e deploy estatico.</h1>
          <p>
            O app foi redesenhado como uma interface web com Supabase Auth e
            operacao direta nas tabelas de pacientes, sessoes e agendamentos.
          </p>
          <ul>
            <li>Painel consolidado com busca por paciente, CPF e email.</li>
            <li>Cadastro e edicao de pacientes em um unico fluxo web.</li>
            <li>Agenda semanal e mensal integrada ao lancamento de sessoes.</li>
          </ul>
        </section>

        <section className="login-form-wrap">
          <div className="panel-title">
            <div>
              <h2>Entrar</h2>
              <p className="panel-subcopy">
                Use as credenciais do Supabase Auth para abrir o sistema.
              </p>
            </div>
          </div>

          <form className="layout-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>Email</span>
              <div className="input-shell">
                <input
                  autoComplete="email"
                  name="email"
                  placeholder="voce@dominio.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </label>

            <label className="field">
              <span>Senha</span>
              <div className="input-shell">
                <input
                  autoComplete="current-password"
                  name="password"
                  type="password"
                  placeholder="Sua senha"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            </label>

            {(localError || error) && (
              <p className="helper-text text-danger">{localError || error}</p>
            )}

            <div className="actions-row">
              <button className="btn btn-primary" disabled={isBusy} type="submit">
                {isBusy ? "Entrando..." : "Entrar"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
