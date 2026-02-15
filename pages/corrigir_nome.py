import streamlit as st
import pandas as pd
from database import ensure_login, render_sidebar_user

st.set_page_config(layout="wide", page_title="Corrigir Nome")

client = ensure_login()
render_sidebar_user()

st.title("Corrigir nome nas sessoes")

UNDO_STACK_KEY = "corrigir_nome_undo_stack"
PAGE_SIZE = 1000

def buscar_todos_registros(query_builder, page_size=PAGE_SIZE):
    registros = []
    inicio = 0
    while True:
        res = query_builder.range(inicio, inicio + page_size - 1).execute()
        lote = res.data or []
        registros.extend(lote)
        if len(lote) < page_size:
            break
        inicio += page_size
    return registros


def get_nomes_entradas():
    registros = buscar_todos_registros(client.table("entradas").select("nome"))
    nomes = [r.get("nome") for r in registros if r.get("nome")]
    return sorted(set(nomes))


def get_nomes_pacientes():
    registros = buscar_todos_registros(client.table("pacientes").select("nome"))
    nomes = [r.get("nome") for r in registros if r.get("nome")]
    return sorted(set(nomes))


def get_entrada_ids_por_nome(nome):
    registros = buscar_todos_registros(client.table("entradas").select("id").eq("nome", nome))
    return [r.get("id") for r in registros if r.get("id") is not None]


def iter_lotes(lista, tamanho_lote=200):
    for i in range(0, len(lista), tamanho_lote):
        yield lista[i:i + tamanho_lote]


def atualizar_nome_por_ids(ids, nome_final):
    if not ids:
        return 0
    total = 0
    for ids_lote in iter_lotes(ids):
        res = client.table("entradas").update({"nome": nome_final}).in_("id", ids_lote).execute()
        total += len(res.data) if res.data else 0
    return total


if UNDO_STACK_KEY not in st.session_state:
    st.session_state[UNDO_STACK_KEY] = []

nomes_entradas = get_nomes_entradas()
nomes_pacientes = get_nomes_pacientes()
nomes_pacientes_set = set(nomes_pacientes)
nomes_entradas_set = set(nomes_entradas)
nomes_entradas_divergentes = [n for n in nomes_entradas if n not in nomes_pacientes_set]
nomes_pacientes_sem_correspondencia = [n for n in nomes_pacientes if n not in nomes_entradas_set]

opcoes_entradas = [""] + nomes_entradas
opcoes_pacientes = [""] + nomes_pacientes
qtd_entradas_dropdown = len(opcoes_entradas) - 1
qtd_pacientes_dropdown = len(opcoes_pacientes) - 1

if st.session_state.get("flash_success"):
    st.success(st.session_state["flash_success"])
    st.session_state["flash_success"] = ""

if st.session_state.get("reset_form_corrigir"):
    st.session_state["nome_entrada_sel"] = ""
    st.session_state["nome_paciente_sel"] = ""
    st.session_state["reset_form_corrigir"] = False

if st.session_state.get("nome_entrada_sel") not in opcoes_entradas:
    st.session_state["nome_entrada_sel"] = ""

if st.session_state.get("nome_paciente_sel") not in opcoes_pacientes:
    st.session_state["nome_paciente_sel"] = ""

st.caption(
    f"Nomes em entradas: {len(nomes_entradas)} | "
    f"Nomes em pacientes: {len(nomes_pacientes)} | "
    f"Divergentes: {len(nomes_entradas_divergentes)}"
)

with st.form("form_corrigir_nome"):
    col1, col2 = st.columns(2)
    with col1:
        st.markdown(
            f"Dropdown nome entradas <span style='font-size:0.8em;color:#8a8f98;'>({qtd_entradas_dropdown})</span>",
            unsafe_allow_html=True,
        )
        nome_entrada = st.selectbox(
            "Dropdown nome entradas",
            opcoes_entradas,
            key="nome_entrada_sel",
            label_visibility="collapsed",
        )
    with col2:
        st.markdown(
            f"Dropdown nome paciente <span style='font-size:0.8em;color:#8a8f98;'>({qtd_pacientes_dropdown})</span>",
            unsafe_allow_html=True,
        )
        nome_paciente = st.selectbox(
            "Dropdown nome paciente",
            opcoes_pacientes,
            key="nome_paciente_sel",
            label_visibility="collapsed",
        )

    nome_final = nome_paciente
    submit = st.form_submit_button("Substituir nome nas entradas")

if submit:
    if not nome_entrada or not nome_final:
        st.error("Selecione os dois nomes antes de substituir.")
    else:
        try:
            ids_afetados = get_entrada_ids_por_nome(nome_entrada)
            if not ids_afetados:
                st.warning("Nenhum registro encontrado para o nome selecionado.")
            else:
                total = atualizar_nome_por_ids(ids_afetados, nome_final)
                st.session_state[UNDO_STACK_KEY].append(
                    {
                        "nome_origem": nome_entrada,
                        "nome_destino": nome_final,
                        "ids": ids_afetados,
                    }
                )
                st.session_state["flash_success"] = (
                    f"Substituicao concluida. Registros atualizados: {total}. "
                    "Voce pode desfazer a ultima correcao abaixo."
                )
                st.session_state["reset_form_corrigir"] = True
                st.rerun()
        except Exception as e:
            st.error(f"Erro ao substituir: {e}")

st.divider()
st.subheader("Desfazer ultima correcao")
undo_stack = st.session_state.get(UNDO_STACK_KEY, [])
if undo_stack:
    ultima = undo_stack[-1]
    st.caption(
        f"Ultima correcao: '{ultima['nome_origem']}' -> '{ultima['nome_destino']}' "
        f"({len(ultima['ids'])} registros)."
    )
    if st.button("Desfazer ultima correcao"):
        try:
            total_restaurado = atualizar_nome_por_ids(ultima["ids"], ultima["nome_origem"])
            st.session_state[UNDO_STACK_KEY] = undo_stack[:-1]
            st.session_state["flash_success"] = f"Desfazer concluido. Registros restaurados: {total_restaurado}."
            st.session_state["reset_form_corrigir"] = True
            st.rerun()
        except Exception as e:
            st.error(f"Erro ao desfazer: {e}")
else:
    st.caption("Nenhuma correcao recente para desfazer nesta sessao.")

st.divider()
st.subheader("Amostra das entradas")
try:
    res = client.table("entradas").select("data,nome,tipo,valor_sessao,valor_pago").order("data", desc=True).limit(20).execute()
    df = pd.DataFrame(res.data) if res.data else pd.DataFrame()
    if not df.empty:
        st.dataframe(df, use_container_width=True)
    else:
        st.info("Nenhuma entrada encontrada.")
except Exception as e:
    st.error(f"Erro ao carregar entradas: {e}")
