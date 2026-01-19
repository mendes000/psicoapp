import streamlit as st
import pandas as pd
from database import supabase # Supondo que centralizou a conexão

st.set_page_config(layout="wide", page_title="Cadastro de Pacientes")

def carregar_origens():
    # Busca origens únicas já cadastradas no Supabase
    res = supabase.table("pacientes").select("origem").execute()
    if res.data:
        df = pd.DataFrame(res.data)
        origens = df['origem'].unique().tolist()
        return sorted([o for o in origens if o])
    return ["Particular", "Indicação", "Instagram"]

st.title("👤 Cadastro de Paciente (Nuvem)")

lista_origens = carregar_origens()
origem_sel = st.selectbox("Origem do Lead:", lista_origens)

with st.form("form_paciente", clear_on_submit=True):
    col1, col2 = st.columns(2)
    with col1:
        nome = st.text_input("Nome Completo:")
        cpf = st.text_input("CPF:")
        email = st.text_input("E-mail:")
    with col2:
        # Campo condicional
        quem_indicou = ""
        if origem_sel == "Indicação":
            quem_indicou = st.text_input("Quem indicou?")
        telefone = st.text_input("Telefone:")

    obs = st.text_area("Observações:")
    submit = st.form_submit_button("Salvar no Supabase")

if submit:
    if not nome:
        st.error("O nome é obrigatório.")
    else:
        dados = {
            "nome": nome,
            "cpf": cpf,
            "email": email,
            "origem": origem_sel,
            "quem_indicou": quem_indicou,
            "telefone": telefone,
            "observacoees": obs
        }
        try:
            supabase.table("pacientes").insert(dados).execute()
            st.success(f"Paciente {nome} salvo com sucesso!")
            st.cache_data.clear()
        except Exception as e:
            st.error(f"Erro ao salvar: {e}")