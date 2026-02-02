import streamlit as st
import pandas as pd
from database import ensure_login, render_sidebar_user

st.set_page_config(layout="wide", page_title="Corrigir Nome")

client = ensure_login()
render_sidebar_user()

st.title("Corrigir nome nas sessoes")

def get_nomes_entradas():
    res = client.table("entradas").select("nome").execute()
    if not res.data:
        return []
    nomes = [r.get("nome") for r in res.data if r.get("nome")]
    return sorted(set(nomes))

def get_nomes_pacientes():
    res = client.table("pacientes").select("nome").execute()
    if not res.data:
        return []
    nomes = [r.get("nome") for r in res.data if r.get("nome")]
    return sorted(set(nomes))

nomes_entradas = get_nomes_entradas()
nomes_pacientes = get_nomes_pacientes()
nomes_pacientes_set = set(nomes_pacientes)
nomes_entradas_set = set(nomes_entradas)
nomes_entradas_divergentes = [n for n in nomes_entradas if n not in nomes_pacientes_set]
nomes_pacientes_sem_correspondencia = [n for n in nomes_pacientes if n not in nomes_entradas_set]

opcoes_entradas = [""] + nomes_entradas_divergentes
opcoes_pacientes = [""] + nomes_pacientes_sem_correspondencia

if st.session_state.get("flash_success"):
    st.success(st.session_state["flash_success"])
    st.session_state["flash_success"] = ""

if st.session_state.get("reset_form_corrigir"):
    st.session_state["nome_entrada_sel"] = ""
    st.session_state["nome_paciente_sel"] = ""
    st.session_state["reset_form_corrigir"] = False

with st.form("form_corrigir_nome"):
    col1, col2 = st.columns(2)
    with col1:
        nome_entrada = st.selectbox("Dropdown nome entradas", opcoes_entradas, key="nome_entrada_sel")
    with col2:
        nome_paciente = st.selectbox("Dropdown nome paciente", opcoes_pacientes, key="nome_paciente_sel")

    nome_final = nome_paciente
    submit = st.form_submit_button("Substituir nome nas entradas")

if submit:
    if not nome_entrada or not nome_final:
        st.error("Selecione os dois nomes antes de substituir.")
    else:
        try:
            res = client.table("entradas").update({"nome": nome_final}).eq("nome", nome_entrada).execute()
            total = len(res.data) if res.data else 0
            st.session_state["flash_success"] = f"Substituicao concluida. Registros atualizados: {total}."
            st.session_state["reset_form_corrigir"] = True
            st.rerun()
        except Exception as e:
            st.error(f"Erro ao substituir: {e}")

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
