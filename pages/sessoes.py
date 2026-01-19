import streamlit as st
import pandas as pd
from datetime import date
from database import supabase

st.set_page_config(layout="wide", page_title="Sessões")

# --- BUSCA DE DADOS ---
def get_pacientes():
    res = supabase.table("pacientes").select("nome").execute()
    return sorted([p['nome'] for p in res.data]) if res.data else []

def get_ultimo_valor(nome_paciente):
    res = supabase.table("entradas").select("valor_pago").eq("nome", nome_paciente).order("data", desc=True).limit(1).execute()
    return float(res.data[0]['valor_pago']) if res.data else 0.0

st.title("📝 Lançamento de Atendimento")

nomes = get_pacientes()
if nomes:
    paciente_sel = st.selectbox("Selecione o Paciente:", nomes)
    valor_padrao = get_ultimo_valor(paciente_sel)

    with st.form("form_atendimento", clear_on_submit=True):
        c1, c2 = st.columns(2)
        with c1:
            data_s = st.date_input("Data:", value=date.today())
            tipo = st.selectbox("Tipo:", ["Sessão Individual", "Avaliação"])
        with c2:
            v_sessao = st.number_input("Valor Sessão:", value=valor_padrao)
            v_pago = st.number_input("Valor Pago:", value=valor_padrao)
        
        anotacoes = st.text_area("Evolução Clínica:")
        
        if st.form_submit_button("Salvar Atendimento"):
            dados_sessao = {
                "data": str(data_s),
                "nome": paciente_sel,
                "tipo": tipo,
                "valor_sessao": v_sessao,
                "valor_pago": v_pago,
                "anotacoes_clinicas": anotacoes
            }
            try:
                supabase.table("entradas").insert(dados_sessao).execute()
                st.success("Atendimento registrado na nuvem!")
                st.cache_data.clear()
            except Exception as e:
                st.error(f"Erro: {e}")
else:
    st.warning("Cadastre um paciente primeiro.")