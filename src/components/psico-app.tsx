"use client";

import type { Session } from "@supabase/supabase-js";
import {
  startTransition,
  useEffect,
  useEffectEvent,
  useState,
} from "react";

import { CalendarView } from "@/components/calendar-view";
import { DashboardView } from "@/components/dashboard-view";
import { LoginPanel } from "@/components/login-panel";
import { PatientsView } from "@/components/patients-view";
import { SessionsView } from "@/components/sessions-view";
import {
  createScheduleRecord,
  loadClinicData,
  saveSessionRecord,
  signOutSupabase,
  upsertPatientRecord,
} from "@/lib/data";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";
import type {
  AppView,
  CalendarEvent,
  Entry,
  FlashMessage,
  Patient,
  PatientSelectionRequest,
  Schedule,
  SessionEditorContext,
  SessionFormValues,
  SessionSeed,
} from "@/lib/types";
import {
  buildCalendarEvents,
  collectPatientColumns,
  emptySessionForm,
  entryToSessionForm,
  formatDateTimeBr,
} from "@/lib/utils";

export function PsicoApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [dataLoading, setDataLoading] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [activeView, setActiveView] = useState<AppView>("painel");
  const [flash, setFlash] = useState<FlashMessage | null>(null);
  const [selectedPatientRequest, setSelectedPatientRequest] =
    useState<PatientSelectionRequest | null>(null);
  const [sessionSeed, setSessionSeed] = useState<SessionSeed | null>(null);

  const configured = hasSupabaseConfig();
  const calendarEvents = buildCalendarEvents(entries, schedules);
  const patientColumns = collectPatientColumns(patients);

  useEffect(() => {
    if (!flash) {
      return;
    }

    const timer = window.setTimeout(() => setFlash(null), 6000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  async function refreshData(message?: FlashMessage) {
    if (!configured) {
      return;
    }

    setDataLoading(true);

    try {
      const result = await loadClinicData();
      startTransition(() => {
        setPatients(result.patients);
        setEntries(result.entries);
        setSchedules(result.schedules);
        if (message) {
          setFlash(message);
        }
      });
    } catch (error) {
      setFlash({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao carregar os dados.",
      });
    } finally {
      setDataLoading(false);
    }
  }

  const applySession = useEffectEvent(async (nextSession: Session | null) => {
    setSession(nextSession);
    setAuthError("");
    setAuthLoading(false);

    if (nextSession) {
      await refreshData();
      return;
    }

    startTransition(() => {
      setPatients([]);
      setEntries([]);
      setSchedules([]);
    });
  });

  useEffect(() => {
    if (!configured) {
      setAuthLoading(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setAuthError(error.message);
      }
      void applySession(data.session ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [applySession, configured]);

  async function signIn(email: string, password: string) {
    if (!configured) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    setAuthError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthError(error.message);
      throw error;
    }
  }

  async function handleSignOut() {
    try {
      await signOutSupabase();
      setFlash({ type: "info", text: "Sessao encerrada." });
    } catch (error) {
      setFlash({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao encerrar a sessao.",
      });
    }
  }

  async function handleSavePatient(form: Parameters<typeof upsertPatientRecord>[0]["form"], existing: Patient | null) {
    try {
      await upsertPatientRecord({
        form,
        existing,
        columns: patientColumns,
      });
      setSelectedPatientRequest(null);
      await refreshData({
        type: "success",
        text: existing ? `Paciente ${form.nome} atualizado.` : `Paciente ${form.nome} criado.`,
      });
    } catch (error) {
      setFlash({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao salvar paciente.",
      });
      throw error;
    }
  }

  async function handleSchedule(
    form: SessionFormValues,
    context: SessionEditorContext,
  ) {
    try {
      const result = await createScheduleRecord(form, context);
      setSessionSeed(null);
      await refreshData({
        type: "success",
        text: result.updated
          ? `Agendamento atualizado para ${form.nome} em ${formatDateTimeBr(`${form.data}T${form.hora}`)}.`
          : `Agendamento salvo para ${form.nome} em ${formatDateTimeBr(`${form.data}T${form.hora}`)}.`,
      });
    } catch (error) {
      setFlash({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao salvar agendamento.",
      });
      throw error;
    }
  }

  async function handleSaveSession(
    form: SessionFormValues,
    context: SessionEditorContext,
  ) {
    try {
      const result = await saveSessionRecord(form, context);
      if (result.remarcar) {
        setFlash({
          type: "info",
          text: "Sessao remarcada. Ajuste a nova data e use Agendar.",
        });
        return result;
      }

      setSessionSeed(null);
      await refreshData({
        type: "success",
        text: context.entryId != null
          ? "Atendimento atualizado com sucesso."
          : "Atendimento registrado com sucesso.",
      });
      return result;
    } catch (error) {
      setFlash({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao salvar atendimento.",
      });
      throw error;
    }
  }

  function requestPatientEditor(key: string) {
    setSessionSeed(null);
    setSelectedPatientRequest({
      key,
      requestedAt: Date.now(),
    });
    setActiveView("pacientes");
  }

  function requestNewSessionForPatient(name: string) {
    setSelectedPatientRequest(null);
    setSessionSeed({
      requestedAt: Date.now(),
      form: emptySessionForm({
        nome: name,
      }),
    });
    setActiveView("sessoes");
  }

  function requestSessionAt(date: string, time: string) {
    setSelectedPatientRequest(null);
    setSessionSeed({
      requestedAt: Date.now(),
      form: emptySessionForm({
        data: date,
        hora: time,
      }),
    });
    setActiveView("sessoes");
  }

  function requestEventEdition(event: CalendarEvent) {
    setSelectedPatientRequest(null);
    setSessionSeed({
      requestedAt: Date.now(),
      form: entryToSessionForm(event),
      context:
        event.source === "entrada"
          ? { entryId: event.id }
          : { scheduleId: event.id },
      label: `${event.nome} em ${formatDateTimeBr(event.data)}`,
    });
    setActiveView("sessoes");
  }

  function handlePatientRequestConsumed() {
    setSelectedPatientRequest(null);
  }

  function handleSessionSeedConsumed() {
    setSessionSeed(null);
  }

  if (!configured) {
    return (
      <main className="login-shell">
        <div className="login-card shell-card">
          <section className="login-copy">
            <div className="eyebrow">Configuracao pendente</div>
            <h1>Configure o Supabase antes de publicar o app.</h1>
            <p>
              Defina `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
              no ambiente local e no provedor onde o site sera publicado.
            </p>
          </section>

          <section className="login-form-wrap">
            <div className="empty-state">
              Sem essas variaveis o frontend nao consegue autenticar nem consultar
              as tabelas.
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <LoginPanel
        error={authError}
        isBusy={authLoading}
        onSubmit={signIn}
      />
    );
  }

  return (
    <main className="page-shell">
      <div className="shell-card app-frame">
        <header className="topbar">
          <div className="headline">
            <div className="eyebrow">PsicoApp | Static Deploy Ready</div>
            <h1>Gestao clinica sem Streamlit, com interface web e deploy direto.</h1>
            <p>
              O backend continua no Supabase. A camada de interface agora esta em
              Next.js, com login, cadastro, sessoes e calendario em uma unica app.
            </p>
          </div>

          <div className="session-badge">
            <strong>{session.user.email}</strong>
            <span>{dataLoading ? "Sincronizando dados..." : "Sessao autenticada no Supabase"}</span>
            <div className="actions-row">
              <button className="btn btn-danger" type="button" onClick={() => void handleSignOut()}>
                Sair
              </button>
            </div>
          </div>
        </header>

        {flash && <div className={`flash ${flash.type}`}>{flash.text}</div>}

        <div className="content-shell">
          <nav className="nav-row">
            {[
              ["painel", "Painel"],
              ["pacientes", "Pacientes"],
              ["sessoes", "Sessoes"],
              ["calendario", "Calendario"],
            ].map(([key, label]) => (
              <button
                className={`nav-chip ${activeView === key ? "active" : ""}`}
                key={key}
                type="button"
                onClick={() => setActiveView(key as AppView)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="status-row">
            <span className="pill">{patients.length} pacientes carregados</span>
            <span className="pill">{entries.length} sessoes carregadas</span>
            <span className="pill">{schedules.length} agendamentos carregados</span>
          </div>

          {activeView === "painel" && (
            <DashboardView
              entries={entries}
              onCreateSessionForPatient={requestNewSessionForPatient}
              onNavigate={setActiveView}
              onOpenPatient={requestPatientEditor}
              patients={patients}
            />
          )}

          {activeView === "pacientes" && (
            <PatientsView
              columns={patientColumns}
              onSavePatient={handleSavePatient}
              onSelectionHandled={handlePatientRequestConsumed}
              patients={patients}
              selectedRequest={selectedPatientRequest}
            />
          )}

          {activeView === "sessoes" && (
            <SessionsView
              entries={entries}
              onSaveSession={handleSaveSession}
              onSchedule={handleSchedule}
              onSeedConsumed={handleSessionSeedConsumed}
              patients={patients}
              seed={sessionSeed}
            />
          )}

          {activeView === "calendario" && (
            <CalendarView
              events={calendarEvents}
              onCreateAt={requestSessionAt}
              onOpenEvent={requestEventEdition}
            />
          )}
        </div>
      </div>
    </main>
  );
}
