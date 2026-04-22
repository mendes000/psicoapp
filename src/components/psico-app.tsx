"use client";

import type { Session } from "@supabase/supabase-js";
import {
  useMemo,
  useRef,
  startTransition,
  useEffect,
  useEffectEvent,
  useState,
} from "react";

import { AppLogo } from "./app-logo";
import { CalendarView } from "./calendar-view";
import { DashboardView } from "./dashboard-view";
import { LoginPanel } from "./login-panel";
import { PatientsView } from "./patients-view";
import { SessionsView } from "./sessions-view";
import {
  createScheduleRecord,
  loadDashboardSnapshot,
  loadEntries,
  loadPatients,
  loadSchedules,
  saveSessionRecord,
  signOutSupabase,
  updateEntryFinancialRecord,
  updatePatientObservationRecord,
  upsertPatientRecord,
} from "../lib/data";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "../lib/supabase";
import type {
  AppView,
  CalendarEvent,
  DashboardSnapshot,
  Entry,
  FlashMessage,
  Patient,
  PatientSelectionRequest,
  Schedule,
  SessionEditorContext,
  SessionFormValues,
  SessionSeed,
} from "../lib/types";
import {
  buildDashboardSnapshot,
  buildCalendarEvents,
  collectPatientColumns,
  emptySessionForm,
  entryToSessionForm,
  formatDateTimeBr,
  patientRecordKey,
} from "../lib/utils";

const NEW_PATIENT_REQUEST_KEY = "__new__";
const CLINIC_CACHE_KEY_PREFIX = "psicoapp:clinic-cache:";
type LoadStatus = "idle" | "loading" | "ready" | "error";
type DatasetKey = "patients" | "entries" | "schedules" | "dashboard";

export function PsicoApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [dataLoadCount, setDataLoadCount] = useState(0);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [dashboardSnapshot, setDashboardSnapshot] = useState<DashboardSnapshot | null>(null);
  const [dashboardStatus, setDashboardStatus] = useState<LoadStatus>("idle");
  const [patientsStatus, setPatientsStatus] = useState<LoadStatus>("idle");
  const [entriesStatus, setEntriesStatus] = useState<LoadStatus>("idle");
  const [schedulesStatus, setSchedulesStatus] = useState<LoadStatus>("idle");
  const [initialLoadState, setInitialLoadState] = useState<"pending" | "ready" | "error">("pending");
  const [syncIssue, setSyncIssue] = useState("");
  const [activeView, setActiveView] = useState<AppView>("painel");
  const [flash, setFlash] = useState<FlashMessage | null>(null);
  const [selectedPatientRequest, setSelectedPatientRequest] =
    useState<PatientSelectionRequest | null>(null);
  const [sessionSeed, setSessionSeed] = useState<SessionSeed | null>(null);
  const loadedUserIdRef = useRef<string | null>(null);
  const pendingLoadsRef = useRef(0);

  const configured = hasSupabaseConfig();
  const dataLoading = dataLoadCount > 0;
  const sessionUserId = session?.user.id ?? null;
  const isPanelReady = dashboardStatus === "ready";
  const isPatientsReady = patientsStatus === "ready";
  const isSessionsReady =
    patientsStatus === "ready" &&
    entriesStatus === "ready" &&
    schedulesStatus === "ready";
  const isCalendarReady =
    entriesStatus === "ready" &&
    schedulesStatus === "ready";
  const panelHasVisibleData = (dashboardSnapshot?.items.length ?? 0) > 0;
  const patientsHasVisibleData = patients.length > 0;
  const sessionsHasVisibleData =
    patients.length > 0 || entries.length > 0 || schedules.length > 0;
  const calendarHasVisibleData = entries.length > 0 || schedules.length > 0;
  const currentViewHasVisibleData =
    activeView === "painel"
      ? panelHasVisibleData
      : activeView === "pacientes"
        ? patientsHasVisibleData
        : activeView === "sessoes"
          ? sessionsHasVisibleData
          : calendarHasVisibleData;
  const calendarEvents = useMemo(
    () => buildCalendarEvents(entries, schedules),
    [entries, schedules],
  );
  const patientColumns = useMemo(
    () => collectPatientColumns(patients),
    [patients],
  );

  useEffect(() => {
    if (!flash) {
      return;
    }

    const timer = window.setTimeout(() => setFlash(null), 6000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  function startDataTask() {
    pendingLoadsRef.current += 1;
    setDataLoadCount(pendingLoadsRef.current);
  }

  function finishDataTask() {
    pendingLoadsRef.current = Math.max(0, pendingLoadsRef.current - 1);
    setDataLoadCount(pendingLoadsRef.current);
  }

  async function withDataTask<T>(operation: () => Promise<T>) {
    startDataTask();

    try {
      return await operation();
    } finally {
      finishDataTask();
    }
  }

  function getClinicCacheKey(userId: string, dataset: DatasetKey) {
    return `${CLINIC_CACHE_KEY_PREFIX}${userId}:${dataset}`;
  }

  function readCacheValue<T>(userId: string, dataset: DatasetKey): T | null {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const raw = window.sessionStorage.getItem(getClinicCacheKey(userId, dataset));
      if (!raw) {
        return null;
      }

      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  function readDatasetCache<T>(userId: string, dataset: DatasetKey): T[] | null {
    const cached = readCacheValue<unknown>(userId, dataset);
    return Array.isArray(cached) ? (cached as T[]) : null;
  }

  function persistCacheValue<T>(userId: string, dataset: DatasetKey, value: T) {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.sessionStorage.setItem(
        getClinicCacheKey(userId, dataset),
        JSON.stringify(value),
      );
    } catch {
      // Ignore cache write failures and keep the live data flow running.
    }
  }

  function persistDatasetCache<T>(userId: string, dataset: DatasetKey, records: T[]) {
    persistCacheValue(userId, dataset, records);
  }

  async function waitForRetry(delayMs: number) {
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }

  async function loadWithRetry<T>(loader: () => Promise<T>, retries = 1) {
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await loader();
      } catch (error) {
        lastError = error;

        if (attempt < retries) {
          await waitForRetry(450 * (attempt + 1));
        }
      }
    }

    throw lastError;
  }

  function applyPatients(nextPatients: Patient[], message?: FlashMessage) {
    startTransition(() => {
      setPatients(nextPatients);
      if (message) {
        setFlash(message);
      }
    });
  }

  function applyEntries(nextEntries: Entry[], message?: FlashMessage) {
    startTransition(() => {
      setEntries(nextEntries);
      if (message) {
        setFlash(message);
      }
    });
  }

  function applySchedules(nextSchedules: Schedule[], message?: FlashMessage) {
    startTransition(() => {
      setSchedules(nextSchedules);
      if (message) {
        setFlash(message);
      }
    });
  }

  function applyDashboardSnapshot(nextSnapshot: DashboardSnapshot, message?: FlashMessage) {
    startTransition(() => {
      setDashboardSnapshot(nextSnapshot);
      if (message) {
        setFlash(message);
      }
    });
  }

  async function ensureDashboardLoaded(options?: {
    force?: boolean;
    message?: FlashMessage;
    userId?: string;
    search?: string;
    reviewOnly?: boolean;
    itemLimit?: number;
  }) {
    if (!configured) {
      return false;
    }

    const search = String(options?.search ?? "").trim();
    const reviewOnly = options?.reviewOnly ?? false;
    const itemLimit = options?.itemLimit ?? 20;
    const isDefaultQuery = !search && !reviewOnly && itemLimit === 20;

    if (isDefaultQuery && dashboardStatus === "ready" && !options?.force) {
      return true;
    }

    if (isDefaultQuery && dashboardStatus === "loading" && !options?.force) {
      return false;
    }

    const hadUsableData = isDefaultQuery && dashboardStatus === "ready";

    if (isDefaultQuery) {
      setDashboardStatus("loading");
    }

    return await withDataTask(async () => {
      try {
        const result = await loadWithRetry(
          () =>
            loadDashboardSnapshot({
              search,
              reviewOnly,
              itemLimit,
            }),
          1,
        );

        if (isDefaultQuery) {
          applyDashboardSnapshot(result, options?.message);
          if (options?.userId) {
            persistCacheValue(options.userId, "dashboard", result);
          }
          setDashboardStatus("ready");
        }

        setSyncIssue("");
        return true;
      } catch (error) {
        setSyncIssue(
          error instanceof Error ? error.message : "Falha ao carregar o painel.",
        );

        if (isDefaultQuery) {
          setDashboardStatus(hadUsableData ? "ready" : "error");
        }

        return false;
      }
    });
  }

  async function ensurePatientsLoaded(options?: {
    force?: boolean;
    message?: FlashMessage;
    userId?: string;
  }) {
    if (!configured) {
      return false;
    }

    if (patientsStatus === "ready" && !options?.force) {
      return true;
    }

    if (patientsStatus === "loading" && !options?.force) {
      return false;
    }

    const hadUsableData = patientsStatus === "ready";
    setPatientsStatus("loading");

    return await withDataTask(async () => {
      try {
        const result = await loadWithRetry(loadPatients, 1);
        applyPatients(result, options?.message);
        if (options?.userId) {
          persistDatasetCache(options.userId, "patients", result);
        }
        setSyncIssue("");
        setPatientsStatus("ready");
        return true;
      } catch (error) {
        setSyncIssue(
          error instanceof Error ? error.message : "Falha ao carregar pacientes.",
        );
        setPatientsStatus(hadUsableData ? "ready" : "error");
        return false;
      }
    });
  }

  async function ensureEntriesLoaded(options?: {
    force?: boolean;
    message?: FlashMessage;
    userId?: string;
  }) {
    if (!configured) {
      return false;
    }

    if (entriesStatus === "ready" && !options?.force) {
      return true;
    }

    if (entriesStatus === "loading" && !options?.force) {
      return false;
    }

    const hadUsableData = entriesStatus === "ready";
    setEntriesStatus("loading");

    return await withDataTask(async () => {
      try {
        const result = await loadWithRetry(loadEntries, 1);
        applyEntries(result, options?.message);
        if (options?.userId) {
          persistDatasetCache(options.userId, "entries", result);
        }
        setSyncIssue("");
        setEntriesStatus("ready");
        return true;
      } catch (error) {
        setSyncIssue(
          error instanceof Error ? error.message : "Falha ao carregar sessoes.",
        );
        setEntriesStatus(hadUsableData ? "ready" : "error");
        return false;
      }
    });
  }

  async function ensureSchedulesLoaded(options?: {
    force?: boolean;
    message?: FlashMessage;
    userId?: string;
  }) {
    if (!configured) {
      return false;
    }

    if (schedulesStatus === "ready" && !options?.force) {
      return true;
    }

    if (schedulesStatus === "loading" && !options?.force) {
      return false;
    }

    const hadUsableData = schedulesStatus === "ready";
    setSchedulesStatus("loading");

    return await withDataTask(async () => {
      try {
        const result = await loadWithRetry(loadSchedules, 1);
        applySchedules(result, options?.message);
        if (options?.userId) {
          persistDatasetCache(options.userId, "schedules", result);
        }
        setSyncIssue("");
        setSchedulesStatus("ready");
        return true;
      } catch (error) {
        setSyncIssue(
          error instanceof Error ? error.message : "Falha ao carregar agendamentos.",
        );
        setSchedulesStatus(hadUsableData ? "ready" : "error");
        return false;
      }
    });
  }

  async function refreshPatients(message?: FlashMessage) {
    const [patientsOk, dashboardOk] = await Promise.all([
      ensurePatientsLoaded({
        force: true,
        message,
        userId: loadedUserIdRef.current ?? undefined,
      }),
      ensureDashboardLoaded({
        force: true,
        userId: loadedUserIdRef.current ?? undefined,
      }),
    ]);

    return patientsOk && dashboardOk;
  }

  async function refreshDashboard(message?: FlashMessage) {
    return ensureDashboardLoaded({
      force: true,
      message,
      userId: loadedUserIdRef.current ?? undefined,
    });
  }

  async function refreshEntriesAndSchedules(message?: FlashMessage) {
    const [entriesOk, schedulesOk, dashboardOk] = await Promise.all([
      ensureEntriesLoaded({
        force: true,
        message,
        userId: loadedUserIdRef.current ?? undefined,
      }),
      ensureSchedulesLoaded({
        force: true,
        userId: loadedUserIdRef.current ?? undefined,
      }),
      ensureDashboardLoaded({
        force: true,
        userId: loadedUserIdRef.current ?? undefined,
      }),
    ]);

    return entriesOk && schedulesOk && dashboardOk;
  }

  async function refreshSchedules(message?: FlashMessage) {
    return ensureSchedulesLoaded({
      force: true,
      message,
      userId: loadedUserIdRef.current ?? undefined,
    });
  }

  function currentViewLoadingCopy(view: AppView) {
    switch (view) {
      case "pacientes":
        return "Sincronizando os cadastros antes de abrir a tela.";
      case "sessoes":
        return "Sincronizando pacientes, sessoes e agenda antes de abrir a tela.";
      case "calendario":
        return "Sincronizando sessoes e agendamentos antes de abrir a agenda.";
      case "painel":
      default:
        return "Sincronizando o resumo clinico antes de abrir o painel.";
    }
  }

  function currentViewFailureCopy(view: AppView) {
    switch (view) {
      case "pacientes":
        return "Nao foi possivel concluir a carga dos cadastros agora.";
      case "sessoes":
        return "Nao foi possivel concluir a carga das sessoes agora.";
      case "calendario":
        return "Nao foi possivel concluir a carga da agenda agora.";
      case "painel":
      default:
        return "Nao foi possivel concluir a carga inicial do painel agora.";
    }
  }

  function datasetPillText(
    count: number,
    status: LoadStatus,
    readyLabel: string,
    loadingLabel: string,
    idleLabel: string,
  ) {
    if (status === "ready") {
      return readyLabel.replace("{count}", String(count));
    }

    if (status === "loading") {
      return loadingLabel;
    }

    if (status === "error" && count > 0) {
      return readyLabel.replace("{count}", String(count));
    }

    return idleLabel;
  }

  async function retryCurrentView() {
    if (!sessionUserId) {
      return;
    }

    if (activeView === "painel") {
      await ensureDashboardLoaded({ userId: sessionUserId, force: true });
      return;
    }

    if (activeView === "pacientes") {
      await ensurePatientsLoaded({ userId: sessionUserId, force: true });
      return;
    }

    if (activeView === "sessoes") {
      await Promise.all([
        ensurePatientsLoaded({ userId: sessionUserId, force: true }),
        ensureEntriesLoaded({ userId: sessionUserId, force: true }),
        ensureSchedulesLoaded({ userId: sessionUserId, force: true }),
      ]);
      return;
    }

    await Promise.all([
      ensureEntriesLoaded({ userId: sessionUserId, force: true }),
      ensureSchedulesLoaded({ userId: sessionUserId, force: true }),
    ]);
  }

  const applySession = useEffectEvent(
    async (nextSession: Session | null, forceRefresh = false) => {
      setSession(nextSession);
      setAuthError("");
      setAuthLoading(false);

      if (nextSession) {
        const sameUserAlreadyLoaded = loadedUserIdRef.current === nextSession.user.id;
        if (sameUserAlreadyLoaded && !forceRefresh) {
          return;
        }

        loadedUserIdRef.current = nextSession.user.id;
        setSyncIssue("");

        const cachedDashboard = readCacheValue<DashboardSnapshot>(
          nextSession.user.id,
          "dashboard",
        );
        const cachedPatients = readDatasetCache<Patient>(nextSession.user.id, "patients");
        const cachedEntries = readDatasetCache<Entry>(nextSession.user.id, "entries");
        const cachedSchedules = readDatasetCache<Schedule>(nextSession.user.id, "schedules");

        if (cachedDashboard) {
          applyDashboardSnapshot(cachedDashboard);
          setDashboardStatus("ready");
        } else {
          setDashboardStatus("idle");
        }

        if (cachedPatients) {
          applyPatients(cachedPatients);
          setPatientsStatus("ready");
        } else {
          setPatientsStatus("idle");
        }

        if (cachedEntries) {
          applyEntries(cachedEntries);
          setEntriesStatus("ready");
        } else {
          setEntriesStatus("idle");
        }

        if (cachedSchedules) {
          applySchedules(cachedSchedules);
          setSchedulesStatus("ready");
        } else {
          setSchedulesStatus("idle");
        }

        setInitialLoadState("pending");
        await ensureDashboardLoaded({
          userId: nextSession.user.id,
          force: forceRefresh,
        });
        return;
      }

      loadedUserIdRef.current = null;
      setInitialLoadState("pending");
      setSyncIssue("");
      setDashboardSnapshot(null);
      setDashboardStatus("idle");
      setPatientsStatus("idle");
      setEntriesStatus("idle");
      setSchedulesStatus("idle");
      startTransition(() => {
        setPatients([]);
        setEntries([]);
        setSchedules([]);
      });
    },
  );

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
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "TOKEN_REFRESHED") {
        void applySession(nextSession, false);
        return;
      }

      if (event === "SIGNED_OUT") {
        void applySession(null, true);
        return;
      }

      if (event === "USER_UPDATED") {
        void applySession(nextSession, true);
        return;
      }

      void applySession(nextSession, false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [configured]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const userId = session.user.id;

    if (activeView === "painel") {
      void ensureDashboardLoaded({ userId });
      return;
    }

    if (activeView === "pacientes") {
      void ensurePatientsLoaded({ userId });
      return;
    }

    if (activeView === "sessoes") {
      void Promise.all([
        ensurePatientsLoaded({ userId }),
        ensureEntriesLoaded({ userId }),
        ensureSchedulesLoaded({ userId }),
      ]);
      return;
    }

    if (activeView === "calendario") {
      void Promise.all([
        ensureEntriesLoaded({ userId }),
        ensureSchedulesLoaded({ userId }),
      ]);
    }
  }, [activeView, sessionUserId]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (activeView === "painel") {
      if (isPanelReady) {
        setInitialLoadState("ready");
        return;
      }

      if (dashboardStatus === "error" && !panelHasVisibleData) {
        setInitialLoadState("error");
        return;
      }

      setInitialLoadState("pending");
      return;
    }

    if (activeView === "pacientes") {
      if (isPatientsReady) {
        setInitialLoadState("ready");
        return;
      }

      if (patientsStatus === "error" && !patientsHasVisibleData) {
        setInitialLoadState("error");
        return;
      }

      setInitialLoadState("pending");
      return;
    }

    if (activeView === "sessoes") {
      if (isSessionsReady) {
        setInitialLoadState("ready");
        return;
      }

      if (
        (patientsStatus === "error" || entriesStatus === "error" || schedulesStatus === "error") &&
        !sessionsHasVisibleData
      ) {
        setInitialLoadState("error");
        return;
      }

      setInitialLoadState("pending");
      return;
    }

    if (isCalendarReady) {
      setInitialLoadState("ready");
      return;
    }

    if ((entriesStatus === "error" || schedulesStatus === "error") && !calendarHasVisibleData) {
      setInitialLoadState("error");
      return;
    }

    setInitialLoadState("pending");
  }, [
    activeView,
    calendarHasVisibleData,
    dashboardStatus,
    entriesStatus,
    isCalendarReady,
    isPanelReady,
    isPatientsReady,
    isSessionsReady,
    panelHasVisibleData,
    patientsStatus,
    patientsHasVisibleData,
    schedulesStatus,
    session,
    sessionsHasVisibleData,
  ]);

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
      setSyncIssue("");
      await refreshPatients({
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
      await refreshSchedules({
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
      await refreshEntriesAndSchedules({
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

  async function handleUpdateEntryFinancial(args: {
    entryId: Entry["id"];
    valorPago: number;
    obs: string;
  }) {
    try {
      await updateEntryFinancialRecord(args);
      setSyncIssue("");
      const nextEntries = entries.map((entry) =>
        entry.id === args.entryId
          ? {
              ...entry,
              valor_pago: args.valorPago,
              obs: args.obs,
            }
          : entry,
      );

      const nextDashboardSnapshot = buildDashboardSnapshot(patients, nextEntries);

      startTransition(() => {
        setEntries(nextEntries);
        setDashboardSnapshot(nextDashboardSnapshot);
      });

      if (loadedUserIdRef.current) {
        persistDatasetCache(loadedUserIdRef.current, "entries", nextEntries);
        persistCacheValue(loadedUserIdRef.current, "dashboard", nextDashboardSnapshot);
      }
    } catch (error) {
      setFlash({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Falha ao atualizar os dados financeiros da sessao.",
      });
      throw error;
    }
  }

  async function handleUpdatePatientObservation(args: {
    patientKey: string;
    nome: string;
    cpf: string;
    email: string;
    telefone: string;
    observacoes: string;
  }) {
    try {
      await updatePatientObservationRecord({
        ...args,
        column: patientColumns.observacoes,
      });
      setSyncIssue("");

      let patientUpdated = false;
      const nextPatients = patients.map((patient) => {
        if (patientRecordKey(patient) !== args.patientKey) {
          return patient;
        }

        patientUpdated = true;
        return {
          ...patient,
          observacoes: args.observacoes,
          observacoees: args.observacoes,
        };
      });

      let snapshotUpdated = false;
      const nextDashboardSnapshot = dashboardSnapshot
        ? {
            ...dashboardSnapshot,
            items: dashboardSnapshot.items.map((patient) => {
              if (patient.patientKey !== args.patientKey) {
                return patient;
              }

              snapshotUpdated = true;
              return {
                ...patient,
                observacoes: args.observacoes,
              };
            }),
          }
        : null;

      startTransition(() => {
        if (patientUpdated) {
          setPatients(nextPatients);
        }

        if (snapshotUpdated && nextDashboardSnapshot) {
          setDashboardSnapshot(nextDashboardSnapshot);
        }
      });

      if (loadedUserIdRef.current) {
        if (patientUpdated) {
          persistDatasetCache(loadedUserIdRef.current, "patients", nextPatients);
        }

        if (snapshotUpdated && nextDashboardSnapshot) {
          persistCacheValue(loadedUserIdRef.current, "dashboard", nextDashboardSnapshot);
        }
      }
    } catch (error) {
      setFlash({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Falha ao atualizar as observacoes do prontuario.",
      });
      throw error;
    }
  }

  function requestNewPatient() {
    setSessionSeed(null);
    setSelectedPatientRequest({
      key: NEW_PATIENT_REQUEST_KEY,
    });
    setActiveView("pacientes");
  }

  function requestNewSession() {
    setSelectedPatientRequest(null);
    setSessionSeed({
      form: emptySessionForm(),
    });
    setActiveView("sessoes");
  }

  function requestSessionAt(date: string, time: string) {
    setSelectedPatientRequest(null);
    setSessionSeed({
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
      form: entryToSessionForm(event),
      context:
        event.source === "entrada"
          ? { entryId: event.id }
          : { scheduleId: event.id },
    });
    setActiveView("sessoes");
  }

  function handlePatientRequestConsumed() {
    setSelectedPatientRequest(null);
  }

  function handleSessionSeedConsumed() {
    setSessionSeed(null);
  }

  function requestPatientEdition(patientKey: string) {
    setSessionSeed(null);
    setSelectedPatientRequest({ key: patientKey });
    setActiveView("pacientes");
  }

  if (!configured) {
    return (
      <main className="login-shell">
        <div className="login-card shell-card">
          <section className="login-copy">
            <div className="brand-lockup brand-lockup-login">
              <div className="brand-mark-shell">
                <AppLogo className="brand-mark-image" priority />
              </div>

              <div className="brand-copy">
                <div className="eyebrow">Configuracao pendente</div>
                <h1>Configure o acesso do app antes de abrir o painel.</h1>
                <p>
                  Defina `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
                  no ambiente local e no deploy usado pelo site.
                </p>
              </div>
            </div>
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
          <div className="brand-lockup brand-lockup-hero">
            <div className="brand-mark-shell">
              <AppLogo className="brand-mark-image" priority />
            </div>

            <div className="headline">
              <div className="hero-top-row">
                <div className="eyebrow">PsicoApp | Painel clinico</div>
                {initialLoadState === "ready" && (
                  <nav className="nav-row nav-row-hero">
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
                    <button
                      className="btn btn-danger btn-hero-logout"
                      type="button"
                      onClick={() => void handleSignOut()}
                    >
                      Sair
                    </button>
                  </nav>
                )}
              </div>
              <h1 className="headline-compact">
                <span>Pacientes, sessoes e agenda</span>
                <span>em um fluxo unico.</span>
              </h1>
            </div>
          </div>
        </header>

        {flash && <div className={`flash ${flash.type}`}>{flash.text}</div>}

        <div className="content-shell">
          {initialLoadState === "pending" && !currentViewHasVisibleData && (
            <section className="panel reveal">
              <div className="panel-title">
                <div>
                  <h2 className="panel-heading">Carregando</h2>
                  <p className="panel-subcopy">{currentViewLoadingCopy(activeView)}</p>
                </div>
              </div>
              <div className="notice-card">
                <strong>Primeira carga em andamento</strong>
                <p>
                  O app está buscando os dados no Supabase. Se houver muito histórico,
                  esse passo pode levar alguns segundos.
                </p>
              </div>
            </section>
          )}

          {initialLoadState === "error" && !currentViewHasVisibleData && (
            <section className="panel reveal">
              <div className="panel-title">
                <div>
                  <h2 className="panel-heading">Falha temporaria</h2>
                  <p className="panel-subcopy">{currentViewFailureCopy(activeView)}</p>
                </div>
              </div>
              <div className="notice-card">
                <strong>O painel ainda nao recebeu dados</strong>
                <p>{syncIssue || "Verifique a conexao com o Supabase e tente novamente."}</p>
              </div>
              <div className="actions-row section-top-space">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => void retryCurrentView()}
                >
                  Tentar novamente
                </button>
              </div>
            </section>
          )}

          {syncIssue && initialLoadState === "ready" && currentViewHasVisibleData && !dataLoading && (
            <div className="flash info">
              Atualizacao incompleta no momento. O app manteve os ultimos dados disponiveis.
            </div>
          )}

          {initialLoadState === "ready" && (
            <>
          {activeView !== "painel" && (
            <div className="status-row">
              <span className="pill">
                {datasetPillText(
                  patients.length,
                  patientsStatus,
                  "{count} pacientes carregados",
                  "Carregando pacientes...",
                  "Pacientes sob demanda",
                )}
              </span>
              <span className="pill">
                {datasetPillText(
                  entries.length,
                  entriesStatus,
                  "{count} sessoes carregadas",
                  "Carregando sessoes...",
                  "Sessoes sob demanda",
                )}
              </span>
              <span className="pill">
                {datasetPillText(
                  schedules.length,
                  schedulesStatus,
                  "{count} agendamentos carregados",
                  "Carregando agenda...",
                  "Agenda sob demanda",
                )}
              </span>
            </div>
          )}

          {activeView === "painel" && (
            <DashboardView
              entries={entries}
              initialSnapshot={dashboardSnapshot}
              onEditPatient={requestPatientEdition}
              onLoadSnapshot={loadDashboardSnapshot}
              onUpdateFinancialEntry={handleUpdateEntryFinancial}
              onUpdatePatientObservation={handleUpdatePatientObservation}
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
            </>
          )}
        </div>
      </div>
    </main>
  );
}
