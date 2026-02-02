import streamlit as st
import pandas as pd
from database import ensure_login, render_sidebar_user

# --- CONFIGURACAO DA PAGINA ---
st.set_page_config(layout="wide", page_title="PsicoApp - Gestao Clinica")

client = ensure_login()
render_sidebar_user()

# --- FUNCOES DE BUSCA (SUPABASE) ---
@st.cache_data(ttl=60)  # Cache de 1 minuto para garantir dados frescos
def buscar_pacientes():
    nomes = set()
    res_p = client.table("pacientes").select("nome").execute()
    if res_p.data:
        nomes.update([p.get("nome") for p in res_p.data if p.get("nome")])
    res_e = client.table("entradas").select("nome").execute()
    if res_e.data:
        nomes.update([p.get("nome") for p in res_e.data if p.get("nome")])
    return sorted(nomes)

def carregar_dados_pacientes(nomes_pacientes):
    if not nomes_pacientes:
        return pd.DataFrame()
    res = client.table("entradas") \
        .select("*") \
        .in_("nome", nomes_pacientes) \
        .order("data", desc=True) \
        .execute()
    return pd.DataFrame(res.data) if res.data else pd.DataFrame()

# --- INTERFACE PRINCIPAL ---
st.title("PsicoApp: Painel do Terapeuta")

# Sidebar para selecao
nomes_pacientes = buscar_pacientes()

if nomes_pacientes:
    pacientes_selecionados = st.sidebar.multiselect(
        "Selecionar Paciente(s):",
        nomes_pacientes,
        default=[nomes_pacientes[0]] if nomes_pacientes else None,
        on_change=lambda: st.cache_data.clear()
    )

    df_p = carregar_dados_pacientes(pacientes_selecionados)

    if not df_p.empty:
        # --- METRICAS FINANCEIRAS ---
        v_total = df_p['valor_sessao'].astype(float).sum()
        p_total = df_p['valor_pago'].astype(float).sum()
        saldo = p_total - v_total

        col1, col2, col3 = st.columns(3)
        col1.metric("Sessoes Registradas", len(df_p))
        col2.metric("Total Pago", f"R$ {p_total:,.2f}")
        col3.metric(
            "Saldo do Paciente",
            f"R$ {saldo:,.2f}",
            delta=f"{saldo:,.2f}",
            delta_color="normal",
        )

        st.divider()

        # --- EVOLUCAO CLINICA ---
        st.subheader("Historico de Evolucao")

        with st.expander("Visualizar Anotacoes e Notas de Sessao", expanded=True):
            notas = df_p[df_p['anotacoes_clinicas'].notna() & (df_p['anotacoes_clinicas'] != "")]

            if not notas.empty:
                for _, row in notas.iterrows():
                    data_formatada = pd.to_datetime(row['data']).strftime('%d/%m/%Y')
                    st.markdown(f"**{data_formatada}** - *{row['tipo']}*")
                    st.info(row['anotacoes_clinicas'])
                    if row.get('obs'):
                        st.caption(f"Observacao: {row['obs']}")
                    st.divider()
            else:
                st.warning("Nenhuma anotacao clinica encontrada para este paciente.")

        # --- TABELA DE LANCAMENTOS ---
        st.subheader("Detalhamento de Sessoes")
        st.dataframe(
            df_p[['data', 'tipo', 'valor_sessao', 'valor_pago', 'faltas', 'obs']],
            use_container_width=True,
        )

        st.subheader("Tabela de Pacientes (Supabase)")
        try:
            res_p = client.table("pacientes").select("*").in_("nome", pacientes_selecionados).order("nome").execute()
            df_pacientes = pd.DataFrame(res_p.data) if res_p.data else pd.DataFrame()
            if not df_pacientes.empty:
                st.dataframe(df_pacientes, use_container_width=True)
            else:
                st.info("Nenhum paciente encontrado na base de dados.")
        except Exception as e:
            st.error(f"Erro ao carregar pacientes: {e}")

        st.subheader("Tabela de Sessoes (Supabase)")
        try:
            res_e = client.table("entradas").select("*").in_("nome", pacientes_selecionados).order("data", desc=True).execute()
            df_entradas = pd.DataFrame(res_e.data) if res_e.data else pd.DataFrame()
            if not df_entradas.empty:
                st.dataframe(df_entradas, use_container_width=True)
            else:
                st.info("Nenhuma sessao encontrada na base de dados.")
        except Exception as e:
            st.error(f"Erro ao carregar sessoes: {e}")

    else:
        if pacientes_selecionados:
            st.info("Nenhuma sessao registrada para os pacientes selecionados.")
        else:
            st.info("Selecione ao menos um paciente.")
else:
    st.warning("Nenhum paciente encontrado na base de dados. Va a pagina de Cadastro.")
