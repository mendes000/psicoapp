import streamlit as st
import pandas as pd
from database import ensure_login, render_sidebar_user

st.set_page_config(layout="wide", page_title="Cadastro de Pacientes")

client = ensure_login()
render_sidebar_user()


def carregar_origens():
    try:
        res = client.table("pacientes").select("origem").execute()
        if res.data and len(res.data) > 0:
            df = pd.DataFrame(res.data)
            if 'origem' in df.columns:
                origens = df['origem'].dropna().unique().tolist()
                return sorted([str(o) for o in origens if o])
        return ["Particular", "Indicacao", "Instagram", "Google Ads"]
    except Exception as e:
        st.error(f"Erro de Conexao: {e}")
        return ["Particular", "Indicacao"]


st.title("Cadastro de Paciente (Nuvem)")

lista_origens = carregar_origens()
origem_sel = st.selectbox("Origem do Lead:", lista_origens)

with st.form("form_paciente", clear_on_submit=True):
    col1, col2 = st.columns(2)
    with col1:
        nome = st.text_input("Nome Completo:")
        cpf = st.text_input("CPF:")
        email = st.text_input("E-mail:")
    with col2:
        quem_indicou = ""
        if origem_sel == "Indicacao":
            quem_indicou = st.text_input("Quem indicou?")
        telefone = st.text_input("Telefone:")

    obs = st.text_area("Observacoes:")
    submit = st.form_submit_button("Salvar no Supabase")

if submit:
    if not nome:
        st.error("O nome e obrigatorio.")
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
