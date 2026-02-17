import streamlit as st
import pandas as pd
import unicodedata
import json
from datetime import date, datetime
from urllib.request import urlopen
from urllib.error import URLError, HTTPError
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


def deduplicar_textos(valores):
    vistos = set()
    resultado = []
    for valor in valores:
        texto = str(valor or "").strip()
        if not texto:
            continue
        chave = normalizar_texto(texto)
        if chave in vistos:
            continue
        vistos.add(chave)
        resultado.append(texto)
    return resultado


@st.cache_data(show_spinner=False, ttl=60 * 10)
def carregar_tratamentos():
    try:
        res = client.table("pacientes").select("tratamento").execute()
        if not res.data:
            return []
        return deduplicar_textos(registro.get("tratamento") for registro in res.data)
    except Exception:
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
    if not colunas_disponiveis:
        return None
    for campo in opcoes:
        if campo in colunas_disponiveis:
            return campo
    return None


def limpar_payload(dados):
    payload = {}
    for chave, valor in dados.items():
        if isinstance(valor, str):
            valor = valor.strip()
        if valor in ("", None):
            continue
        payload[chave] = valor
    return payload


def filtrar_colunas_validas(dados, colunas_disponiveis):
    if not colunas_disponiveis:
        return dados
    return {k: v for k, v in dados.items() if k in colunas_disponiveis}


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


def valor_registro_coluna(registro, coluna):
    if not coluna:
        return ""
    return valor_registro(registro, coluna)


def parse_data_nascimento(valor):
    if valor is None:
        return None
    texto = str(valor).strip()
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


def formatar_data_ddmmyyyy(valor):
    digitos = "".join(c for c in str(valor or "") if c.isdigit())[:8]
    if len(digitos) <= 2:
        return digitos
    if len(digitos) <= 4:
        return f"{digitos[:2]}/{digitos[2:]}"
    return f"{digitos[:2]}/{digitos[2:4]}/{digitos[4:]}"


def data_para_display_nascimento(valor):
    data = parse_data_nascimento(valor)
    if data:
        return data.strftime("%d/%m/%Y")
    return formatar_data_ddmmyyyy(valor)


def nascimento_para_banco(valor):
    texto = str(valor or "").strip()
    if not texto:
        return ""
    data = parse_data_nascimento(texto)
    if not data:
        return texto
    return data.strftime("%Y-%m-%d")


def formatar_telefone_br(valor):
    digitos = "".join(c for c in str(valor or "") if c.isdigit())
    if len(digitos) > 11 and digitos.startswith("55"):
        digitos = digitos[2:]
    digitos = digitos[:11]

    if not digitos:
        return ""
    if len(digitos) <= 2:
        return f"({digitos}"

    ddd = digitos[:2]
    restante = digitos[2:]
    if len(restante) == 0:
        return f"({ddd})"
    if len(restante) == 1:
        return f"({ddd}) {restante}"

    primeiro = restante[0]
    miolo = restante[1:5]
    final = restante[5:]

    texto = f"({ddd}) {primeiro}"
    if miolo:
        texto += f".{miolo}"
    if final:
        texto += f"-{final}"
    return texto


def formatar_cep_br(valor):
    digitos = "".join(c for c in str(valor or "") if c.isdigit())[:8]
    if len(digitos) <= 5:
        return digitos
    return f"{digitos[:5]}-{digitos[5:]}"


@st.cache_data(show_spinner=False, ttl=60 * 60 * 24)
def buscar_endereco_por_cep(cep_digitos):
    if not cep_digitos or len(cep_digitos) != 8:
        return None, "CEP invalido."
    url = f"https://viacep.com.br/ws/{cep_digitos}/json/"
    try:
        with urlopen(url, timeout=5) as resposta:
            payload = json.loads(resposta.read().decode("utf-8"))
    except (URLError, HTTPError, TimeoutError, ValueError):
        return None, "Nao foi possivel consultar o CEP agora."
    except Exception:
        return None, "Falha inesperada ao consultar o CEP."

    if payload.get("erro"):
        return None, "CEP nao encontrado."

    return {
        "endereco": str(payload.get("logradouro") or "").strip(),
        "bairro": str(payload.get("bairro") or "").strip(),
        "cidade": str(payload.get("localidade") or "").strip(),
    }, None


def calcular_idade(nascimento_str):
    nascimento = parse_data_nascimento(nascimento_str)
    if not nascimento:
        return ""
    hoje = date.today()
    idade = hoje.year - nascimento.year - ((hoje.month, hoje.day) < (nascimento.month, nascimento.day))
    if idade < 0 or idade > 130:
        return ""
    return str(idade)


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
col_nome_contato = escolher_coluna(colunas_pacientes, "nome_do_contato", "nome_contato")
col_contato_emergencia = escolher_coluna(colunas_pacientes, "contato_emergencia", "contato_de_emergencia")
col_nome_pai = escolher_coluna(colunas_pacientes, "nome_do_pai", "nome_pai")
col_nome_mae = escolher_coluna(colunas_pacientes, "nome_da_mae", "nome_mae")
col_observacoes = escolher_coluna(colunas_pacientes, "observacoees", "observacoes")

KEY_NOME = "cad_nome"
KEY_NASCIMENTO = "cad_nascimento"
KEY_CPF = "cad_cpf"
KEY_TRATAMENTO = "cad_tratamento"
KEY_TRATAMENTO_SELECT = "cad_tratamento_select"
KEY_TRATAMENTO_NOVO = "cad_tratamento_novo"
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
DEFAULT_TELEFONE = "(62) 9.0000-0000"
TRATAMENTOS_PADRAO = [
    "Sess\u00e3o Avulsa",
    "Terapia Infantil",
    "Terapia para Adolescentes",
    "Terapia para Adultos",
    "Avalia\u00e7\u00e3o Neuropsicol\u00f3gica",
]
OPCAO_TRATAMENTO_VAZIO = ""
OPCAO_NOVO_TRATAMENTO = "+ Adicionar novo"


def limpar_campos_formulario():
    for campo in (
        KEY_NOME,
        KEY_NASCIMENTO,
        KEY_CPF,
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
    st.session_state[KEY_TELEFONE] = DEFAULT_TELEFONE
    st.session_state[KEY_CEP] = ""
    st.session_state[KEY_TRATAMENTO_SELECT] = OPCAO_TRATAMENTO_VAZIO
    st.session_state[KEY_TRATAMENTO] = ""
    st.session_state[KEY_TRATAMENTO_NOVO] = ""
    st.session_state["origem_paciente"] = lista_origens[0] if lista_origens else "Particular"
    st.session_state["quem_indicou_paciente"] = ""
    st.session_state["_cep_consultado"] = ""
    st.session_state["_cep_erro"] = ""


def carregar_campos_formulario(registro):
    st.session_state[KEY_NOME] = valor_registro(registro, "nome")
    st.session_state[KEY_NASCIMENTO] = data_para_display_nascimento(valor_registro_coluna(registro, col_nascimento))
    st.session_state[KEY_CPF] = valor_registro(registro, "cpf")
    tratamento_registro = valor_registro(registro, "tratamento")
    st.session_state[KEY_TRATAMENTO] = tratamento_registro
    st.session_state[KEY_TRATAMENTO_SELECT] = tratamento_registro or OPCAO_TRATAMENTO_VAZIO
    st.session_state[KEY_TRATAMENTO_NOVO] = ""
    st.session_state[KEY_PROFISSAO] = valor_registro(registro, "profissao")
    st.session_state[KEY_TELEFONE] = formatar_telefone_br(valor_registro(registro, "telefone"))
    st.session_state[KEY_EMAIL] = valor_registro(registro, "email")
    st.session_state[KEY_NOME_CONTATO] = valor_registro_coluna(registro, col_nome_contato)
    st.session_state[KEY_CONTATO_EMERGENCIA] = valor_registro_coluna(registro, col_contato_emergencia)
    st.session_state[KEY_ENDERECO] = valor_registro(registro, "endereco")
    st.session_state[KEY_BAIRRO] = valor_registro(registro, "bairro")
    st.session_state[KEY_CIDADE] = valor_registro(registro, "cidade")
    st.session_state[KEY_CEP] = formatar_cep_br(valor_registro(registro, "cep"))
    st.session_state[KEY_NOME_PAI] = valor_registro_coluna(registro, col_nome_pai)
    st.session_state[KEY_NOME_MAE] = valor_registro_coluna(registro, col_nome_mae)
    st.session_state[KEY_OBSERVACOES] = valor_registro_coluna(registro, col_observacoes)

    origem_registro = valor_registro(registro, "origem")
    if origem_registro:
        st.session_state["origem_paciente"] = origem_registro
    elif lista_origens:
        st.session_state["origem_paciente"] = lista_origens[0]
    else:
        st.session_state["origem_paciente"] = "Particular"
    st.session_state["quem_indicou_paciente"] = valor_registro(registro, "quem_indicou")
    st.session_state["_cep_consultado"] = "".join(c for c in st.session_state.get(KEY_CEP, "") if c.isdigit())
    st.session_state["_cep_erro"] = ""


opcao_novo_key = "__novo__"
mapa_pacientes = {}
rotulos_pacientes = {opcao_novo_key: "+ Criar novo paciente"}
opcoes_seletor = [opcao_novo_key]
for i, registro in enumerate(registros_pacientes, start=1):
    chave = f"pac_{i}"
    nome_label = valor_registro(registro, "nome") or "(Sem nome)"
    cpf_label = valor_registro(registro, "cpf")
    if cpf_label:
        label = f"{nome_label} | CPF {cpf_label}"
    else:
        label = nome_label
    opcoes_seletor.append(chave)
    mapa_pacientes[chave] = registro
    rotulos_pacientes[chave] = label

st.markdown("### Paciente")
col_seletor, col_modo = st.columns([4, 1])
with col_seletor:
    selecao_paciente = st.selectbox(
        "Buscar paciente existente para editar ou escolher novo cadastro:",
        opcoes_seletor,
        format_func=lambda chave: rotulos_pacientes.get(chave, chave),
        key="cadastro_paciente_seletor",
        help="Digite no campo para filtrar por nome ou CPF.",
    )
with col_modo:
    modo_edicao = selecao_paciente != opcao_novo_key
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

st.markdown("### Dados do Paciente")
col1, col2, col3 = st.columns(3)
st.session_state[KEY_NASCIMENTO] = formatar_data_ddmmyyyy(st.session_state.get(KEY_NASCIMENTO, ""))
st.session_state[KEY_TELEFONE] = formatar_telefone_br(st.session_state.get(KEY_TELEFONE, DEFAULT_TELEFONE))
st.session_state[KEY_CEP] = formatar_cep_br(st.session_state.get(KEY_CEP, ""))
tratamento_atual = str(st.session_state.get(KEY_TRATAMENTO, "")).strip()
lista_tratamentos = deduplicar_textos(
    [*TRATAMENTOS_PADRAO, *carregar_tratamentos(), tratamento_atual]
)
opcoes_tratamento = [OPCAO_TRATAMENTO_VAZIO, *lista_tratamentos, OPCAO_NOVO_TRATAMENTO]
if st.session_state.get(KEY_TRATAMENTO_SELECT) not in opcoes_tratamento:
    st.session_state[KEY_TRATAMENTO_SELECT] = (
        tratamento_atual if tratamento_atual else OPCAO_TRATAMENTO_VAZIO
    )
with col1:
    nome = st.text_input("Nome Completo:", key=KEY_NOME)
    nascimento = st.text_input(
        "Nascimento (DD/MM/AAAA):",
        key=KEY_NASCIMENTO,
        placeholder="DD/MM/AAAA",
        max_chars=10,
    )
with col2:
    cpf = st.text_input("CPF:", key=KEY_CPF)
    idade_visual = calcular_idade(nascimento)
    st.text_input("Idade (automatica):", value=idade_visual, disabled=True)
with col3:
    tratamento_sel = st.selectbox("Tratamento:", opcoes_tratamento, key=KEY_TRATAMENTO_SELECT)
    if tratamento_sel == OPCAO_NOVO_TRATAMENTO:
        tratamento_novo = st.text_input(
            "Novo tratamento:",
            key=KEY_TRATAMENTO_NOVO,
            placeholder="Digite um novo tipo de tratamento",
        )
        tratamento = tratamento_novo.strip()
    else:
        st.session_state[KEY_TRATAMENTO_NOVO] = ""
        tratamento = tratamento_sel
    st.session_state[KEY_TRATAMENTO] = tratamento
    profissao = st.text_input("Profissao:", key=KEY_PROFISSAO)

if nascimento and not idade_visual:
    st.caption("Informe a data de nascimento no formato DD/MM/AAAA.")

st.markdown("### Contato")
col1, col2 = st.columns(2)
with col1:
    telefone = st.text_input("Telefone:", key=KEY_TELEFONE, placeholder="(62) 9.0000-0000", max_chars=16)
    email = st.text_input("E-mail:", key=KEY_EMAIL)
with col2:
    nome_contato = st.text_input("Nome do Contato de Emergencia:", key=KEY_NOME_CONTATO)
    contato_emergencia = st.text_input("Contato de Emergencia:", key=KEY_CONTATO_EMERGENCIA)

st.markdown("### Endereco")
cep = st.text_input("CEP:", key=KEY_CEP, placeholder="00000-000", max_chars=9)
cep_digitos = "".join(c for c in str(cep or "") if c.isdigit())
cep_consultado = st.session_state.get("_cep_consultado", "")

if len(cep_digitos) == 8 and cep_digitos != cep_consultado:
    dados_cep, erro_cep = buscar_endereco_por_cep(cep_digitos)
    st.session_state["_cep_consultado"] = cep_digitos
    st.session_state["_cep_erro"] = erro_cep or ""
    if dados_cep:
        if not str(st.session_state.get(KEY_ENDERECO, "")).strip():
            st.session_state[KEY_ENDERECO] = dados_cep.get("endereco", "")
        if not str(st.session_state.get(KEY_BAIRRO, "")).strip():
            st.session_state[KEY_BAIRRO] = dados_cep.get("bairro", "")
        if not str(st.session_state.get(KEY_CIDADE, "")).strip():
            st.session_state[KEY_CIDADE] = dados_cep.get("cidade", "")
elif len(cep_digitos) < 8:
    st.session_state["_cep_consultado"] = ""
    st.session_state["_cep_erro"] = ""

if st.session_state.get("_cep_erro"):
    st.caption(st.session_state.get("_cep_erro"))

col1, col2 = st.columns(2)
with col1:
    endereco = st.text_input("Endereco:", key=KEY_ENDERECO)
    bairro = st.text_input("Bairro:", key=KEY_BAIRRO)
with col2:
    cidade = st.text_input("Cidade:", key=KEY_CIDADE)

st.markdown("### Filiacao")
col1, col2 = st.columns(2)
with col1:
    nome_pai = st.text_input("Nome do Pai:", key=KEY_NOME_PAI)
with col2:
    nome_mae = st.text_input("Nome da Mae:", key=KEY_NOME_MAE)

st.markdown("### Observacoes")
observacoes = st.text_area("Observacoes:", key=KEY_OBSERVACOES)

submit = st.button("Atualizar Paciente" if modo_edicao else "Salvar Novo Paciente", type="primary")

if submit:
    nome = nome.strip()
    if not nome:
        st.error("O nome e obrigatorio.")
    else:
        nascimento_para_salvar = nascimento_para_banco(nascimento)
        if nascimento and not parse_data_nascimento(nascimento):
            st.error("Data de nascimento invalida. Use o formato DD/MM/AAAA.")
            st.stop()
        dados_base = {
            "nome": nome,
            "tratamento": tratamento,
            "cpf": cpf,
            "email": email,
            "telefone": telefone,
            "profissao": profissao,
            "origem": origem_sel,
            "endereco": endereco,
            "bairro": bairro,
            "cidade": cidade,
            "cep": cep,
        }
        if col_nascimento:
            dados_base[col_nascimento] = nascimento_para_salvar
        if col_nome_contato:
            dados_base[col_nome_contato] = nome_contato
        if col_contato_emergencia:
            dados_base[col_contato_emergencia] = contato_emergencia
        if col_nome_pai:
            dados_base[col_nome_pai] = nome_pai
        if col_nome_mae:
            dados_base[col_nome_mae] = nome_mae
        if col_observacoes:
            dados_base[col_observacoes] = observacoes
        dados_base["quem_indicou"] = quem_indicou if origem_e_indicacao(origem_sel) else (None if modo_edicao else "")
        dados_base = filtrar_colunas_validas(dados_base, colunas_pacientes)
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
