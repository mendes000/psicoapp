export type IdValue = string | number | null | undefined;

export type AppView = "painel" | "pacientes" | "sessoes" | "calendario";

export type SessionSituation =
  | "Realizado"
  | "Remarcado"
  | "Falta abonada"
  | "Falta cobrada";

export interface Patient {
  id?: IdValue;
  nome?: string | null;
  nascimento?: string | null;
  cpf?: string | null;
  tratamento?: string | null;
  profissao?: string | null;
  origem?: string | null;
  quem_indicou?: string | null;
  telefone?: string | null;
  email?: string | null;
  nome_do_contato?: string | null;
  nome_contato?: string | null;
  contato_emergencia?: string | null;
  contato_de_emergencia?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  cep?: string | null;
  nome_do_pai?: string | null;
  nome_pai?: string | null;
  nome_da_mae?: string | null;
  nome_mae?: string | null;
  observacoees?: string | null;
  observacoes?: string | null;
  [key: string]: unknown;
}

export interface Entry {
  id?: IdValue;
  data?: string | null;
  nome?: string | null;
  tipo?: string | null;
  valor_sessao?: number | string | null;
  valor_pago?: number | string | null;
  obs?: string | null;
  anotacoes_clinicas?: string | null;
  [key: string]: unknown;
}

export interface Schedule {
  id?: IdValue;
  data?: string | null;
  nome?: string | null;
  tipo?: string | null;
  valor_sessao?: number | string | null;
  valor_pago?: number | string | null;
  obs?: string | null;
  [key: string]: unknown;
}

export interface ConsolidatedPatient {
  key: string;
  patientKey: string;
  hasPatientRecord: boolean;
  reviewState: "ok" | "duplicate-name" | "entry-only";
  duplicateNameCount: number;
  reviewNote: string;
  nome: string;
  nascimento: string;
  cpf: string;
  tratamento: string;
  profissao: string;
  origem: string;
  quemIndicou: string;
  telefone: string;
  email: string;
  nomeContato: string;
  contatoEmergencia: string;
  endereco: string;
  bairro: string;
  cidade: string;
  cep: string;
  nomePai: string;
  nomeMae: string;
  observacoes: string;
  totalSessoes: number;
  totalPago: number;
  saldo: number;
  ultimaSessaoData: string;
  ultimasSessoes: Entry[];
}

export interface DashboardMetrics {
  totalCadastros: number;
  totalSessoes: number;
  totalPago: number;
  saldo: number;
}

export interface DashboardSnapshot {
  metrics: DashboardMetrics;
  reviewCount: number;
  totalCount: number;
  limited: boolean;
  items: ConsolidatedPatient[];
}

export interface PatientColumnMap {
  nascimento?: string;
  nomeContato?: string;
  contatoEmergencia?: string;
  nomePai?: string;
  nomeMae?: string;
  observacoes?: string;
}

export interface PatientFormValues {
  nome: string;
  nascimento: string;
  cpf: string;
  tratamento: string;
  profissao: string;
  origem: string;
  quemIndicou: string;
  telefone: string;
  email: string;
  nomeContato: string;
  contatoEmergencia: string;
  endereco: string;
  bairro: string;
  cidade: string;
  cep: string;
  nomePai: string;
  nomeMae: string;
  observacoes: string;
}

export interface SessionFormValues {
  nome: string;
  data: string;
  hora: string;
  tipo: string;
  valorSessao: string;
  valorPago: string;
  anotacoesClinicas: string;
  obs: string;
  situacao: SessionSituation;
}

export interface SessionEditorContext {
  entryId?: IdValue;
  scheduleId?: IdValue;
}

export interface SessionSeed {
  form: Partial<SessionFormValues>;
  context?: SessionEditorContext;
}

export interface PatientSelectionRequest {
  key: string;
}

export interface CalendarEvent {
  id?: IdValue;
  source: "entrada" | "agendamento";
  data: string;
  nome: string;
  tipo: string;
  valorSessao: number;
  valorPago: number;
  obs: string;
  anotacoesClinicas: string;
  startsAt: Date;
}

export interface FlashMessage {
  type: "success" | "error" | "info";
  text: string;
}
