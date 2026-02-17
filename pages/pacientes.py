import streamlit as st
import pandas as pd
import unicodedata
from database import ensure_login, render_sidebar_user

st.set_page_config(layout="wide", page_title="Cadastro de Pacientes")

client = ensure_login()
render_sidebar_user()


def carregar_origens():
    try:
        res = client.table("pacientes").select("origem").execute()
        if res.data and len(res.data) > 0:
            df = pd.DataFrame(res.data)
            if "origem" in df.columns:
                origens = df["origem"].dropna().unique().tolist()
                return sorted([str(o) for o in origens if o])
        return ["Particular", "Indicacao", "Instagram", "Google Ads"]
    except Exception as e:
        st.error(f"Erro de Conexao: {e}")
        return ["Particular", "Indicacao"]


def carregar_colunas_pacientes():
    try:
        res = client.table("pacientes").select("*").limit(1).execute()
        if res.data and len(res.data) > 0:
            return set(res.data[0].keys())
    except Exception:
        pass
    return set()


def normalizar_texto(valor):
    if not valor:
        return ""
    texto = str(valor).strip().lower()
    return "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )


def origem_e_indicacao(origem):
    return normalizar_texto(origem) in {"indicacao", "indicacoes"}


def escolher_coluna(colunas_disponiveis, *opcoes):
    if colunas_disponiveis:
        for campo in opcoes:
            if campo in colunas_disponiveis:
                return campo
    return opcoes[0]


def limpar_payload(dados):
    payload = {}
    for chave, valor in dados.items():
        if isinstance(valor, str):
            valor = valor.strip()
        if valor in ("", None):
            continue
        payload[chave] = valor
    return payload


st.title("Cadastro de Paciente (Nuvem)")

lista_origens = carregar_origens()
colunas_pacientes = carregar_colunas_pacientes()

col_nascimento = escolher_coluna(colunas_pacientes, "nascimento")
col_idade = escolher_coluna(colunas_pacientes, "idade")
col_nome_contato = escolher_coluna(colunas_pacientes, "nome_do_contato", "nome_contato")
col_contato_emergencia = escolher_coluna(colunas_pacientes, "contato_emergencia", "contato_de_emergencia")
col_nome_pai = escolher_coluna(colunas_pacientes, "nome_do_pai", "nome_pai")
col_nome_mae = escolher_coluna(colunas_pacientes, "nome_da_mae", "nome_mae")
col_observacoes = escolher_coluna(colunas_pacientes, "observacoees", "observacoes")

st.markdown("### Origem")
origem_sel = st.selectbox("Origem do Lead:", lista_origens, key="origem_paciente")
quem_indicou = ""
if origem_e_indicacao(origem_sel):
    quem_indicou = st.text_input("Quem indicou?", key="quem_indicou_paciente")

with st.form("form_paciente", clear_on_submit=True):
    st.markdown("### Dados do Paciente")
    col1, col2, col3 = st.columns(3)
    with col1:
        nome = st.text_input("Nome Completo:")
        nascimento = st.text_input("Nascimento (AAAA-MM-DD):")
    with col2:
        cpf = st.text_input("CPF:")
        idade = st.text_input("Idade:")
    with col3:
        tratamento = st.text_input("Tratamento:")
        profissao = st.text_input("Profissao:")

    st.markdown("### Contato")
    col1, col2 = st.columns(2)
    with col1:
        telefone = st.text_input("Telefone:")
        email = st.text_input("E-mail:")
    with col2:
        nome_contato = st.text_input("Nome do Contato de Emergencia:")
        contato_emergencia = st.text_input("Contato de Emergencia:")

    st.markdown("### Endereco")
    col1, col2 = st.columns(2)
    with col1:
        endereco = st.text_input("Endereco:")
        bairro = st.text_input("Bairro:")
    with col2:
        cidade = st.text_input("Cidade:")
        cep = st.text_input("CEP:")

    st.markdown("### Filiacao")
    col1, col2 = st.columns(2)
    with col1:
        nome_pai = st.text_input("Nome do Pai:")
    with col2:
        nome_mae = st.text_input("Nome da Mae:")

    st.markdown("### Observacoes")
    observacoes = st.text_area("Observacoes:")
    submit = st.form_submit_button("Salvar no Supabase")

if submit:
    if not nome:
        st.error("O nome e obrigatorio.")
    else:
        dados = limpar_payload({
            "nome": nome,
            col_nascimento: nascimento,
            col_idade: idade,
            "tratamento": tratamento,
            "cpf": cpf,
            "email": email,
            "telefone": telefone,
            "profissao": profissao,
            "origem": origem_sel,
            "quem_indicou": quem_indicou,
            col_nome_contato: nome_contato,
            col_contato_emergencia: contato_emergencia,
            "endereco": endereco,
            "bairro": bairro,
            "cidade": cidade,
            "cep": cep,
            col_nome_pai: nome_pai,
            col_nome_mae: nome_mae,
            col_observacoes: observacoes,
        })
        try:
            client.table("pacientes").insert(dados).execute()
            st.success(f"Paciente {nome} salvo com sucesso!")
            st.cache_data.clear()
        except Exception as e:
            st.error(f"Erro ao salvar: {e}")

st.divider()
st.subheader("Tabela de Pacientes")
try:
    res = client.table("pacientes").select("*").order("nome").execute()
    df_pacientes = pd.DataFrame(res.data) if res.data else pd.DataFrame()
    if not df_pacientes.empty:
        st.dataframe(df_pacientes, use_container_width=True)
    else:
        st.info("Nenhum paciente encontrado na base.")
except Exception as e:
    st.error(f"Erro ao carregar pacientes: {e}")
