import streamlit as st
import pandas as pd
from datetime import date, datetime
import unicodedata
from difflib import SequenceMatcher
import streamlit.components.v1 as components

from database import ensure_login, render_sidebar_user


st.set_page_config(layout="wide", page_title="Pacientes em Stacks")

client = ensure_login()
render_sidebar_user()

CACHE_TTL = 300
SHOW_DEFAULT_LIMIT = 20
SEARCH_MIN_LEN = 2
SEARCH_MAX_RESULTS = 120
QUERY_CHUNK_SIZE = 200


def normalizar_texto(valor):
    texto = str(valor or "").strip().lower()
    if not texto:
        return ""
    texto = "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) not in {"Mn", "Cf"}
    )
    texto = texto.replace("\u00a0", " ")
    return " ".join(texto.split())


def valor(registro, *campos):
    for campo in campos:
        if campo in registro and pd.notna(registro[campo]):
            texto = str(registro[campo]).strip()
            if texto:
                return texto
    return ""


def para_float(v):
    try:
        numero = float(v)
        if pd.isna(numero):
            return 0.0
        return numero
    except Exception:
        return 0.0


def formatar_moeda(v):
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def parse_data(v):
    if v is None:
        return None
    texto = str(v).strip()
    if not texto:
        return None
    formatos = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d")
    for formato in formatos:
        try:
            return datetime.strptime(texto[:10], formato).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(texto.replace("Z", "+00:00")).date()
    except Exception:
        return None


def formatar_data_ddmmyyyy(v):
    dt = parse_data(v)
    if not dt:
        return str(v or "").strip()
    return dt.strftime("%d/%m/%Y")


def calcular_idade(nascimento):
    dt = parse_data(nascimento)
    if not dt:
        return ""
    hoje = date.today()
    idade = hoje.year - dt.year - ((hoje.month, hoje.day) < (dt.month, dt.day))
    if idade < 0 or idade > 130:
        return ""
    return str(idade)


def primeiro_preenchido(registros, *campos):
    for registro in registros:
        for campo in campos:
            valor_campo = registro.get(campo)
            if valor_campo is None:
                continue
            if str(valor_campo).strip():
                return valor_campo
    return ""


@st.cache_data(ttl=CACHE_TTL, show_spinner=False)
def buscar_nomes_default(limit=SHOW_DEFAULT_LIMIT):
    vistos = set()
    saida = []

    # Primeiro: nomes com sessao, ordenados da mais recente para a mais antiga.
    inicio = 0
    lote = 1000
    while len(saida) < limit:
        fim = inicio + lote - 1
        res_e = (
            client.table("entradas")
            .select("nome,data")
            .order("data", desc=True)
            .range(inicio, fim)
            .execute()
        )
        dados = res_e.data or []
        if not dados:
            break
        for r in dados:
            nome = str(r.get("nome", "")).strip()
            if not nome:
                continue
            chave = normalizar_texto(nome)
            if not chave or chave in vistos:
                continue
            vistos.add(chave)
            saida.append(nome)
            if len(saida) >= limit:
                break
        if len(dados) < lote:
            break
        inicio += lote

    # Complemento: pacientes sem sessao (ou fora do recorte), apenas para fechar a lista.
    if len(saida) < limit:
        faltam = limit - len(saida)
        res_p = client.table("pacientes").select("nome").order("nome").limit(1000).execute()
        for r in (res_p.data or []):
            nome = str(r.get("nome", "")).strip()
            if not nome:
                continue
            chave = normalizar_texto(nome)
            if not chave or chave in vistos:
                continue
            vistos.add(chave)
            saida.append(nome)
            if len(saida) >= limit or len(saida) >= faltam + (limit - faltam):
                break

    return saida[:limit]


@st.cache_data(ttl=CACHE_TTL, show_spinner=False)
def buscar_nomes_por_termo(termo):
    termo = str(termo or "").strip()
    if not termo:
        return []

    nomes = []

    try:
        res_p = (
            client.table("pacientes")
            .select("nome")
            .or_(f"nome.ilike.%{termo}%,cpf.ilike.%{termo}%,email.ilike.%{termo}%")
            .limit(SEARCH_MAX_RESULTS)
            .execute()
        )
        nomes.extend(
            str(r.get("nome", "")).strip()
            for r in (res_p.data or [])
            if str(r.get("nome", "")).strip()
        )
    except Exception:
        pass

    try:
        res_e = (
            client.table("entradas")
            .select("nome")
            .ilike("nome", f"%{termo}%")
            .limit(SEARCH_MAX_RESULTS)
            .execute()
        )
        nomes.extend(
            str(r.get("nome", "")).strip()
            for r in (res_e.data or [])
            if str(r.get("nome", "")).strip()
        )
    except Exception:
        pass

    vistos = set()
    saida = []
    for nome in nomes:
        chave = normalizar_texto(nome)
        if not chave or chave in vistos:
            continue
        vistos.add(chave)
        saida.append(nome)

    return saida[:SEARCH_MAX_RESULTS]


@st.cache_data(ttl=CACHE_TTL, show_spinner=False)
def carregar_pacientes_por_nomes(nomes_tuple):
    nomes = [str(n).strip() for n in nomes_tuple if str(n).strip()]
    if not nomes:
        return pd.DataFrame()

    dados = []
    for i in range(0, len(nomes), QUERY_CHUNK_SIZE):
        lote = nomes[i : i + QUERY_CHUNK_SIZE]
        res = client.table("pacientes").select("*").in_("nome", lote).execute()
        if res.data:
            dados.extend(res.data)

    return pd.DataFrame(dados) if dados else pd.DataFrame()


@st.cache_data(ttl=CACHE_TTL, show_spinner=False)
def carregar_entradas_por_nomes(nomes_tuple):
    nomes = [str(n).strip() for n in nomes_tuple if str(n).strip()]
    if not nomes:
        return pd.DataFrame()

    dados = []
    for i in range(0, len(nomes), QUERY_CHUNK_SIZE):
        lote = nomes[i : i + QUERY_CHUNK_SIZE]
        res = (
            client.table("entradas")
            .select("nome,data,tipo,valor_sessao,valor_pago,obs,anotacoes_clinicas")
            .in_("nome", lote)
            .order("data", desc=True)
            .execute()
        )
        if res.data:
            dados.extend(res.data)

    return pd.DataFrame(dados) if dados else pd.DataFrame()


def consolidar_tabela_pacientes(df_pacientes, df_entradas):
    mapa_sessoes = {}
    if not df_entradas.empty and "nome" in df_entradas.columns:
        df_sessoes = df_entradas.copy()
        df_sessoes["nome"] = df_sessoes["nome"].fillna("").astype(str).str.strip()
        df_sessoes = df_sessoes[df_sessoes["nome"] != ""]
        if not df_sessoes.empty:
            df_sessoes["nome_key"] = df_sessoes["nome"].map(normalizar_texto)
            df_sessoes["data_dt"] = pd.to_datetime(df_sessoes.get("data"), errors="coerce")
            df_sessoes = df_sessoes.sort_values(by=["data_dt"], ascending=False, na_position="last")
            for chave, grupo in df_sessoes.groupby("nome_key", sort=False):
                total_cobrado = grupo["valor_sessao"].apply(para_float).sum() if "valor_sessao" in grupo.columns else 0.0
                total_pago = grupo["valor_pago"].apply(para_float).sum() if "valor_pago" in grupo.columns else 0.0
                mapa_sessoes[chave] = {
                    "total_sessoes": int(len(grupo)),
                    "total_cobrado": total_cobrado,
                    "total_pago": total_pago,
                    "saldo": total_pago - total_cobrado,
                    "ultima_sessao_data": grupo.iloc[0].get("data"),
                    "ultimas_sessoes": grupo.head(5).to_dict("records"),
                }

    linhas = []
    if not df_pacientes.empty:
        df_p = df_pacientes.copy()
        if "nome" not in df_p.columns:
            df_p["nome"] = ""
        df_p["nome"] = df_p["nome"].fillna("").astype(str).str.strip()
        df_p = df_p[df_p["nome"] != ""]
        if not df_p.empty:
            df_p["nome_key"] = df_p["nome"].map(normalizar_texto)
            for chave, grupo in df_p.groupby("nome_key", sort=True):
                registros = grupo.to_dict("records")
                dados_sessoes = mapa_sessoes.get(
                    chave,
                    {
                        "total_sessoes": 0,
                        "total_cobrado": 0.0,
                        "total_pago": 0.0,
                        "saldo": 0.0,
                        "ultima_sessao_data": "",
                        "ultimas_sessoes": [],
                    },
                )
                linhas.append(
                    {
                        "nome_key": chave,
                        "nome": primeiro_preenchido(registros, "nome"),
                        "nascimento": primeiro_preenchido(registros, "nascimento"),
                        "cpf": primeiro_preenchido(registros, "cpf"),
                        "tratamento": primeiro_preenchido(registros, "tratamento"),
                        "profissao": primeiro_preenchido(registros, "profissao"),
                        "origem": primeiro_preenchido(registros, "origem"),
                        "quem_indicou": primeiro_preenchido(registros, "quem_indicou"),
                        "telefone": primeiro_preenchido(registros, "telefone"),
                        "email": primeiro_preenchido(registros, "email"),
                        "nome_contato": primeiro_preenchido(registros, "nome_do_contato", "nome_contato"),
                        "contato_emergencia": primeiro_preenchido(
                            registros, "contato_emergencia", "contato_de_emergencia"
                        ),
                        "endereco": primeiro_preenchido(registros, "endereco"),
                        "bairro": primeiro_preenchido(registros, "bairro"),
                        "cidade": primeiro_preenchido(registros, "cidade"),
                        "cep": primeiro_preenchido(registros, "cep"),
                        "nome_pai": primeiro_preenchido(registros, "nome_do_pai", "nome_pai"),
                        "nome_mae": primeiro_preenchido(registros, "nome_da_mae", "nome_mae"),
                        "observacoes": primeiro_preenchido(registros, "observacoees", "observacoes"),
                        **dados_sessoes,
                    }
                )

    nomes_em_sessoes = set(mapa_sessoes.keys())
    nomes_ja_adicionados = {linha["nome_key"] for linha in linhas}
    faltantes = nomes_em_sessoes - nomes_ja_adicionados
    for chave in sorted(faltantes):
        dados_sessoes = mapa_sessoes[chave]
        ultimas = dados_sessoes.get("ultimas_sessoes", [])
        nome_base = str(ultimas[0].get("nome", "")).strip() if ultimas else ""
        linhas.append(
            {
                "nome_key": chave,
                "nome": nome_base or chave.title(),
                "nascimento": "",
                "cpf": "",
                "tratamento": "",
                "profissao": "",
                "origem": "",
                "quem_indicou": "",
                "telefone": "",
                "email": "",
                "nome_contato": "",
                "contato_emergencia": "",
                "endereco": "",
                "bairro": "",
                "cidade": "",
                "cep": "",
                "nome_pai": "",
                "nome_mae": "",
                "observacoes": "",
                **dados_sessoes,
            }
        )

    if not linhas:
        return pd.DataFrame()

    df_consolidado = pd.DataFrame(linhas)
    return df_consolidado.reset_index(drop=True)


def extrair_data_ultima_sessao(row):
    data_bruta = row.get("ultima_sessao_data")
    if pd.notna(data_bruta) and str(data_bruta).strip():
        return pd.to_datetime(data_bruta, errors="coerce")

    ultimas = row.get("ultimas_sessoes", [])
    if isinstance(ultimas, list) and ultimas:
        primeira = ultimas[0] if isinstance(ultimas[0], dict) else {}
        return pd.to_datetime(primeira.get("data"), errors="coerce")

    return pd.NaT


def ordenar_por_ultima_sessao(df):
    if df.empty:
        return df
    df_ord = df.copy()
    df_ord["_ultima_sessao_dt"] = df_ord.apply(extrair_data_ultima_sessao, axis=1)
    df_ord["_nome_ord"] = df_ord.get("nome", pd.Series(dtype=str)).fillna("").astype(str).map(normalizar_texto)
    df_ord = df_ord.sort_values(
        by=["_ultima_sessao_dt", "_nome_ord"],
        ascending=[False, True],
        na_position="last",
    )
    return df_ord.drop(columns=["_ultima_sessao_dt", "_nome_ord"], errors="ignore").reset_index(drop=True)


def filtro_aproximado_nome(nome_norm, filtro_norm):
    if not nome_norm or not filtro_norm:
        return False
    if filtro_norm in nome_norm:
        return True
    return SequenceMatcher(None, nome_norm, filtro_norm).ratio() >= 0.72


def injetar_accordion_por_nivel():
    components.html(
        """
<script>
(function () {
  const parentDoc = window.parent.document;
  if (!parentDoc || parentDoc.__psicoAccordionBound) return;
  parentDoc.__psicoAccordionBound = true;

  function detalhes() {
    return Array.from(parentDoc.querySelectorAll("details"));
  }

  function profundidade(el) {
    let d = 0;
    let atual = el.parentElement;
    while (atual) {
      if (atual.tagName === "DETAILS") d += 1;
      atual = atual.parentElement;
    }
    return d;
  }

  function bind() {
    detalhes().forEach((el) => {
      if (el.dataset.psicoAccordion === "1") return;
      el.dataset.psicoAccordion = "1";
      el.addEventListener("toggle", function () {
        if (!el.open) return;
        const nivel = profundidade(el);
        detalhes().forEach((outro) => {
          if (outro === el) return;
          if (profundidade(outro) === nivel) {
            outro.open = false;
          }
        });
      });
    });
  }

  bind();
  const obs = new MutationObserver(bind);
  obs.observe(parentDoc.body, { childList: true, subtree: true });
})();
</script>
        """,
        height=0,
    )


st.markdown(
    """
<style>
div[data-testid="stTextInput"] {
    position: sticky !important;
    top: 0 !important;
    z-index: 1000 !important;
    background: var(--background-color, #0e1117);
    padding: 0.35rem 0 0.35rem 0;
}
div[data-testid="stButton"] {
    padding-top: 0.35rem;
}
div[data-testid="stExpander"] {
    margin-bottom: 0.35rem;
}
</style>
""",
    unsafe_allow_html=True,
)
injetar_accordion_por_nivel()

col_busca, col_btn_pac, col_btn_sess, col_btn_cal = st.columns([7.2, 1.2, 1.2, 0.4])

with col_busca:
    filtro = st.text_input(
        "Buscar paciente por nome, cpf ou email:",
        "",
        placeholder="Buscar paciente por nome, cpf ou email",
        label_visibility="collapsed",
    ).strip()

with col_btn_pac:
    if st.button("➕ Pacientes", use_container_width=False):
        if hasattr(st, "switch_page"):
            st.switch_page("pages/pacientes.py")
        else:
            st.warning("Navegacao indisponivel nesta versao do Streamlit.")

with col_btn_sess:
    if st.button("➕ Sesões", use_container_width=False):
        if hasattr(st, "switch_page"):
            st.switch_page("pages/sessoes.py")
        else:
            st.warning("Navegacao indisponivel nesta versao do Streamlit.")

with col_btn_cal:
    if st.button("📅", use_container_width=False, help="Abrir calendario"):
        if hasattr(st, "switch_page"):
            st.switch_page("pages/calendario.py")
        else:
            st.warning("Navegacao indisponivel nesta versao do Streamlit.")

filtro_norm = normalizar_texto(filtro)

if not filtro_norm:
    nomes_alvo = buscar_nomes_default(SHOW_DEFAULT_LIMIT)
    st.caption(f"Mostrando os {SHOW_DEFAULT_LIMIT} pacientes com sessao mais recente. Use a busca para localizar os demais.")
elif len(filtro_norm) < SEARCH_MIN_LEN:
    st.info(f"Digite ao menos {SEARCH_MIN_LEN} caracteres para buscar.")
    st.stop()
else:
    nomes_alvo = buscar_nomes_por_termo(filtro)

if not nomes_alvo:
    st.info("Nenhum paciente encontrado para o filtro informado.")
    st.stop()

df_pacientes = carregar_pacientes_por_nomes(tuple(sorted(set(nomes_alvo))))
df_entradas = carregar_entradas_por_nomes(tuple(sorted(set(nomes_alvo))))
df_consolidado = consolidar_tabela_pacientes(df_pacientes, df_entradas)
df_consolidado = ordenar_por_ultima_sessao(df_consolidado)

if df_consolidado.empty:
    st.info("Nenhum paciente encontrado para o filtro informado.")
    st.stop()

if filtro_norm:
    nomes = df_consolidado.get("nome", pd.Series(dtype=str)).fillna("").astype(str)
    nomes_norm = nomes.map(normalizar_texto)
    cpfs = df_consolidado.get("cpf", pd.Series(dtype=str)).fillna("").astype(str).str.lower()
    emails = df_consolidado.get("email", pd.Series(dtype=str)).fillna("").astype(str).str.lower()

    mask_nome = nomes_norm.map(lambda n: filtro_aproximado_nome(n, filtro_norm))
    mask = mask_nome | cpfs.str.contains(filtro.lower()) | emails.str.contains(filtro.lower())
    df_view = df_consolidado[mask].copy()
else:
    df_view = df_consolidado.copy()

df_view = ordenar_por_ultima_sessao(df_view)

if df_view.empty:
    st.info("Nenhum paciente encontrado para o filtro informado.")
    st.stop()

for _, row in df_view.iterrows():
    nome = valor(row, "nome") or "(Sem nome)"
    cpf = valor(row, "cpf")
    email = valor(row, "email")

    header = nome

    with st.expander(header, expanded=False):
        total_sessoes = int(row.get("total_sessoes", 0))
        total_pago = para_float(row.get("total_pago", 0))
        saldo = para_float(row.get("saldo", 0))
        ultimas_sessoes = row.get("ultimas_sessoes", [])

        c1, c2, c3 = st.columns(3)
        c1.metric("Sessoes", total_sessoes)
        c2.metric("Total Pago", formatar_moeda(total_pago))
        c3.metric("Saldo", formatar_moeda(saldo))

        with st.expander("Dados Pessoais", expanded=False):
            st.write(f"Nome: {nome}")
            st.write(f"Nascimento: {formatar_data_ddmmyyyy(valor(row, 'nascimento'))}")
            st.write(f"Idade: {calcular_idade(valor(row, 'nascimento'))}")
            st.write(f"CPF: {cpf}")
            st.write(f"Tratamento: {valor(row, 'tratamento')}")
            st.write(f"Profissao: {valor(row, 'profissao')}")
            st.write(f"Origem: {valor(row, 'origem')}")
            st.write(f"Quem indicou: {valor(row, 'quem_indicou')}")

        with st.expander("Contato", expanded=False):
            st.write(f"Telefone: {valor(row, 'telefone')}")
            st.write(f"Email: {email}")
            st.write(f"Nome contato emergencia: {valor(row, 'nome_contato')}")
            st.write(f"Contato emergencia: {valor(row, 'contato_emergencia')}")

        with st.expander("Endereco", expanded=False):
            st.write(f"Endereco: {valor(row, 'endereco')}")
            st.write(f"Bairro: {valor(row, 'bairro')}")
            st.write(f"Cidade: {valor(row, 'cidade')}")
            st.write(f"CEP: {valor(row, 'cep')}")

        with st.expander("Familia e Observacoes", expanded=False):
            st.write(f"Nome do pai: {valor(row, 'nome_pai')}")
            st.write(f"Nome da mae: {valor(row, 'nome_mae')}")
            st.write(f"Observacoes: {valor(row, 'observacoes')}")

        with st.expander("Ultimas Sessoes", expanded=False):
            if not isinstance(ultimas_sessoes, list) or not ultimas_sessoes:
                st.info("Nenhuma sessao encontrada para este paciente.")
            else:
                for sessao in ultimas_sessoes:
                    data = formatar_data_ddmmyyyy(valor(sessao, "data"))
                    tipo = valor(sessao, "tipo")
                    obs = valor(sessao, "obs")
                    anotacoes = valor(sessao, "anotacoes_clinicas")
                    valor_pago = para_float(sessao.get("valor_pago"))
                    valor_sessao = para_float(sessao.get("valor_sessao"))

                    with st.container(border=True):
                        col_a, col_b = st.columns(2)
                        with col_a:
                            st.write(f"Data: {data}")
                            st.write(f"Valor sessao: {formatar_moeda(valor_sessao)}")
                        with col_b:
                            st.write(f"Tipo: {tipo}")
                            st.write(f"Valor pago: {formatar_moeda(valor_pago)}")
                        st.write(f"Obser.: {obs}")
                        if anotacoes:
                            st.write(f"Evolucao clinica: {anotacoes}")
