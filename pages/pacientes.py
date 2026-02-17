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


def carregar_pacientes():
    try:
        res = client.table("pacientes").select("*").order("nome").execute()
        return res.data or []
    except Exception as e:
        st.error(f"Erro ao carregar lista de pacientes: {e}")
        return []


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


def preparar_payload_edicao(dados):
    payload = {}
    for chave, valor in dados.items():
        if isinstance(valor, str):
            valor = valor.strip()
            payload[chave] = valor if valor else None
        else:
            payload[chave] = valor
    return payload


def valor_registro(registro, *campos):
    for campo in campos:
        valor = registro.get(campo)
        if valor is not None:
            return str(valor)
    return ""


def chave_registro(registro):
    if not registro:
        return "__novo__"
    if registro.get("id") is not None:
        return f"id:{registro.get('id')}"
    if registro.get("cpf"):
        return f"cpf:{registro.get('cpf')}"
    return f"nome:{registro.get('nome', '')}"


st.title("Cadastro de Paciente (Nuvem)")

lista_origens = carregar_origens()
colunas_pacientes = carregar_colunas_pacientes()
registros_pacientes = carregar_pacientes()

col_nascimento = escolher_coluna(colunas_pacientes, "nascimento")
col_idade = escolher_coluna(colunas_pacientes, "idade")
col_nome_contato = escolher_coluna(colunas_pacientes, "nome_do_contato", "nome_contato")
col_contato_emergencia = escolher_coluna(colunas_pacientes, "contato_emergencia", "contato_de_emergencia")
col_nome_pai = escolher_coluna(colunas_pacientes, "nome_do_pai", "nome_pai")
col_nome_mae = escolher_coluna(colunas_pacientes, "nome_da_mae", "nome_mae")
col_observacoes = escolher_coluna(colunas_pacientes, "observacoees", "observacoes")

KEY_NOME = "cad_nome"
KEY_NASCIMENTO = "cad_nascimento"
KEY_CPF = "cad_cpf"
KEY_IDADE = "cad_idade"
KEY_TRATAMENTO = "cad_tratamento"
KEY_PROFISSAO = "cad_profissao"
KEY_TELEFONE = "cad_telefone"
KEY_EMAIL = "cad_email"
KEY_NOME_CONTATO = "cad_nome_contato"
KEY_CONTATO_EMERGENCIA = "cad_contato_emergencia"
KEY_ENDERECO = "cad_endereco"
KEY_BAIRRO = "cad_bairro"
KEY_CIDADE = "cad_cidade"
KEY_CEP = "cad_cep"
KEY_NOME_PAI = "cad_nome_pai"
KEY_NOME_MAE = "cad_nome_mae"
KEY_OBSERVACOES = "cad_observacoes"


def limpar_campos_formulario():
    for campo in (
        KEY_NOME,
        KEY_NASCIMENTO,
        KEY_CPF,
        KEY_IDADE,
        KEY_TRATAMENTO,
        KEY_PROFISSAO,
        KEY_TELEFONE,
        KEY_EMAIL,
        KEY_NOME_CONTATO,
        KEY_CONTATO_EMERGENCIA,
        KEY_ENDERECO,
        KEY_BAIRRO,
        KEY_CIDADE,
        KEY_CEP,
        KEY_NOME_PAI,
        KEY_NOME_MAE,
        KEY_OBSERVACOES,
    ):
        st.session_state[campo] = ""
    st.session_state["origem_paciente"] = lista_origens[0] if lista_origens else "Particular"
    st.session_state["quem_indicou_paciente"] = ""


def carregar_campos_formulario(registro):
    st.session_state[KEY_NOME] = valor_registro(registro, "nome")
    st.session_state[KEY_NASCIMENTO] = valor_registro(registro, col_nascimento)
    st.session_state[KEY_CPF] = valor_registro(registro, "cpf")
    st.session_state[KEY_IDADE] = valor_registro(registro, col_idade)
    st.session_state[KEY_TRATAMENTO] = valor_registro(registro, "tratamento")
    st.session_state[KEY_PROFISSAO] = valor_registro(registro, "profissao")
    st.session_state[KEY_TELEFONE] = valor_registro(registro, "telefone")
    st.session_state[KEY_EMAIL] = valor_registro(registro, "email")
    st.session_state[KEY_NOME_CONTATO] = valor_registro(registro, col_nome_contato)
    st.session_state[KEY_CONTATO_EMERGENCIA] = valor_registro(registro, col_contato_emergencia)
    st.session_state[KEY_ENDERECO] = valor_registro(registro, "endereco")
    st.session_state[KEY_BAIRRO] = valor_registro(registro, "bairro")
    st.session_state[KEY_CIDADE] = valor_registro(registro, "cidade")
    st.session_state[KEY_CEP] = valor_registro(registro, "cep")
    st.session_state[KEY_NOME_PAI] = valor_registro(registro, col_nome_pai)
    st.session_state[KEY_NOME_MAE] = valor_registro(registro, col_nome_mae)
    st.session_state[KEY_OBSERVACOES] = valor_registro(registro, col_observacoes)

    origem_registro = valor_registro(registro, "origem")
    if origem_registro:
        st.session_state["origem_paciente"] = origem_registro
    elif lista_origens:
        st.session_state["origem_paciente"] = lista_origens[0]
    else:
        st.session_state["origem_paciente"] = "Particular"
    st.session_state["quem_indicou_paciente"] = valor_registro(registro, "quem_indicou")


opcao_novo = "+ Criar novo paciente"
mapa_pacientes = {}
opcoes_seletor = [opcao_novo]
for i, registro in enumerate(registros_pacientes, start=1):
    nome_label = valor_registro(registro, "nome") or "(Sem nome)"
    cpf_label = valor_registro(registro, "cpf")
    id_label = valor_registro(registro, "id") or str(i)
    if cpf_label:
        label = f"{nome_label} | CPF {cpf_label} | ID {id_label}"
    else:
        label = f"{nome_label} | ID {id_label}"
    opcoes_seletor.append(label)
    mapa_pacientes[label] = registro

st.markdown("### Paciente")
col_seletor, col_modo = st.columns([4, 1])
with col_seletor:
    selecao_paciente = st.selectbox(
        "Buscar paciente existente para editar ou escolher novo cadastro:",
        opcoes_seletor,
        key="cadastro_paciente_seletor",
        help="Digite no campo para filtrar por nome ou CPF.",
    )
with col_modo:
    modo_edicao = selecao_paciente != opcao_novo
    st.markdown("**Modo**")
    st.write("Edicao" if modo_edicao else "Novo")

paciente_selecionado = mapa_pacientes.get(selecao_paciente)
chave_selecao = chave_registro(paciente_selecionado if modo_edicao else None)
if st.session_state.get("_paciente_form_chave") != chave_selecao:
    if modo_edicao and paciente_selecionado:
        carregar_campos_formulario(paciente_selecionado)
    else:
        limpar_campos_formulario()
    st.session_state["_paciente_form_chave"] = chave_selecao

lista_origens_form = list(lista_origens) if lista_origens else ["Particular"]
origem_estado = st.session_state.get("origem_paciente", "")
if origem_estado and origem_estado not in lista_origens_form:
    lista_origens_form.append(origem_estado)

st.markdown("### Origem")
origem_sel = st.selectbox("Origem do Lead:", lista_origens_form, key="origem_paciente")
quem_indicou = ""
if origem_e_indicacao(origem_sel):
    quem_indicou = st.text_input("Quem indicou?", key="quem_indicou_paciente")
else:
    st.session_state["quem_indicou_paciente"] = ""

with st.form("form_paciente", clear_on_submit=False):
    st.markdown("### Dados do Paciente")
    col1, col2, col3 = st.columns(3)
    with col1:
        nome = st.text_input("Nome Completo:", key=KEY_NOME)
        nascimento = st.text_input("Nascimento (AAAA-MM-DD):", key=KEY_NASCIMENTO)
    with col2:
        cpf = st.text_input("CPF:", key=KEY_CPF)
        idade = st.text_input("Idade:", key=KEY_IDADE)
    with col3:
        tratamento = st.text_input("Tratamento:", key=KEY_TRATAMENTO)
        profissao = st.text_input("Profissao:", key=KEY_PROFISSAO)

    st.markdown("### Contato")
    col1, col2 = st.columns(2)
    with col1:
        telefone = st.text_input("Telefone:", key=KEY_TELEFONE)
        email = st.text_input("E-mail:", key=KEY_EMAIL)
    with col2:
        nome_contato = st.text_input("Nome do Contato de Emergencia:", key=KEY_NOME_CONTATO)
        contato_emergencia = st.text_input("Contato de Emergencia:", key=KEY_CONTATO_EMERGENCIA)

    st.markdown("### Endereco")
    col1, col2 = st.columns(2)
    with col1:
        endereco = st.text_input("Endereco:", key=KEY_ENDERECO)
        bairro = st.text_input("Bairro:", key=KEY_BAIRRO)
    with col2:
        cidade = st.text_input("Cidade:", key=KEY_CIDADE)
        cep = st.text_input("CEP:", key=KEY_CEP)

    st.markdown("### Filiacao")
    col1, col2 = st.columns(2)
    with col1:
        nome_pai = st.text_input("Nome do Pai:", key=KEY_NOME_PAI)
    with col2:
        nome_mae = st.text_input("Nome da Mae:", key=KEY_NOME_MAE)

    st.markdown("### Observacoes")
    observacoes = st.text_area("Observacoes:", key=KEY_OBSERVACOES)
    submit = st.form_submit_button("Atualizar Paciente" if modo_edicao else "Salvar Novo Paciente")

if submit:
    nome = nome.strip()
    if not nome:
        st.error("O nome e obrigatorio.")
    else:
        dados_base = {
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
        }
        dados_base["quem_indicou"] = quem_indicou if origem_e_indicacao(origem_sel) else (None if modo_edicao else "")
        try:
            if modo_edicao and paciente_selecionado:
                dados = preparar_payload_edicao(dados_base)
                query = client.table("pacientes").update(dados)
                if paciente_selecionado.get("id") is not None:
                    query = query.eq("id", paciente_selecionado.get("id"))
                elif paciente_selecionado.get("cpf"):
                    query = query.eq("cpf", paciente_selecionado.get("cpf"))
                else:
                    nome_referencia = str(paciente_selecionado.get("nome", "")).strip()
                    if not nome_referencia:
                        raise ValueError("Nao foi possivel identificar o paciente para edicao.")
                    query = query.eq("nome", nome_referencia)
                    email_referencia = str(paciente_selecionado.get("email", "")).strip()
                    telefone_referencia = str(paciente_selecionado.get("telefone", "")).strip()
                    if email_referencia:
                        query = query.eq("email", email_referencia)
                    elif telefone_referencia:
                        query = query.eq("telefone", telefone_referencia)
                query.execute()
                st.success(f"Paciente {nome} atualizado com sucesso!")
            else:
                dados = limpar_payload(dados_base)
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
