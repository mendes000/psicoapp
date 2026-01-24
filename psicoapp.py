import streamlit as st
import pandas as pd
from database import supabase # Importa a conexão que configuramos anteriormente

# --- CONFIGURAÇÃO DA PÁGINA ---
st.set_page_config(layout="wide", page_title="PsicoApp - Gestão Clínica")

# --- FUNÇÕES DE BUSCA (SUPABASE) ---
@st.cache_data(ttl=60) # Cache de 1 minuto para garantir dados frescos
def buscar_pacientes():
    res = supabase.table("pacientes").select("nome").execute()
    return sorted([p['nome'] for p in res.data]) if res.data else []

def carregar_dados_paciente(nome_paciente):
    # Busca todas as sessões do paciente selecionado
    res = supabase.table("entradas")\
        .select("*")\
        .eq("nome", nome_paciente)\
        .order("data", desc=True)\
        .execute()
    return pd.DataFrame(res.data) if res.data else pd.DataFrame()

# --- INTERFACE PRINCIPAL ---
st.title("🧠 PsicoApp: Painel do Terapeuta")

# Sidebar para seleção
nomes_pacientes = buscar_pacientes()

if nomes_pacientes:
    paciente_selecionado = st.sidebar.selectbox(
        "🔎 Selecionar Paciente:", 
        nomes_pacientes,
        on_change=lambda: st.cache_data.clear() # Limpa cache ao trocar paciente
    )

    df_p = carregar_dados_paciente(paciente_selecionado)

    if not df_p.empty:
        df_p = df_p.copy()
        df_p["data"] = pd.to_datetime(df_p["data"], errors="coerce")
        df_p["valor_sessao"] = pd.to_numeric(df_p.get("valor_sessao"), errors="coerce").fillna(0)
        df_p["valor_pago"] = pd.to_numeric(df_p.get("valor_pago"), errors="coerce").fillna(0)
        df_p["faltas"] = df_p.get("faltas", False)
        df_p["obs"] = df_p.get("obs", "")

        st.sidebar.markdown("### Filtros")
        tipos_disponiveis = sorted(df_p["tipo"].dropna().unique().tolist())
        tipo_filtro = st.sidebar.multiselect(
            "Tipo de sessão:",
            options=tipos_disponiveis,
            default=tipos_disponiveis
        )
        data_min = df_p["data"].min()
        data_max = df_p["data"].max()
        if pd.notna(data_min) and pd.notna(data_max):
            periodo = st.sidebar.date_input(
                "Período:",
                value=(data_min.date(), data_max.date())
            )
        else:
            periodo = None

        df_filtrado = df_p
        if tipo_filtro:
            df_filtrado = df_filtrado[df_filtrado["tipo"].isin(tipo_filtro)]
        if periodo and len(periodo) == 2:
            inicio, fim = periodo
            df_filtrado = df_filtrado[
                (df_filtrado["data"].dt.date >= inicio) & (df_filtrado["data"].dt.date <= fim)
            ]

        # --- MÉTRICAS FINANCEIRAS ---
        v_total = df_filtrado["valor_sessao"].sum()
        p_total = df_filtrado["valor_pago"].sum()
        saldo = p_total - v_total

        col1, col2, col3 = st.columns(3)
        col1.metric("Sessões Registadas", len(df_filtrado))
        col2.metric("Total Pago", f"R$ {p_total:,.2f}")
        col3.metric("Saldo do Paciente", f"R$ {saldo:,.2f}", 
                    delta=f"{saldo:,.2f}", delta_color="normal" if saldo >= 0 else "inverse")

        st.divider()

        # --- EVOLUÇÃO CLÍNICA ---
        st.subheader("📋 Histórico de Evolução")
        
        with st.expander("🔍 Visualizar Anotações e Notas de Sessão", expanded=True):
            # Filtra apenas registros que tenham anotações preenchidas
            notas = df_filtrado[
                df_filtrado["anotacoes_clinicas"].notna()
                & (df_filtrado["anotacoes_clinicas"] != "")
            ]
            
            if not notas.empty:
                for _, row in notas.iterrows():
                    data_formatada = pd.to_datetime(row["data"]).strftime("%d/%m/%Y")
                    st.markdown(f"**🗓️ {data_formatada}** — *{row['tipo']}*")
                    st.info(row["anotacoes_clinicas"])
                    if row.get("obs"):
                        st.caption(f"📌 Observação: {row['obs']}")
                    st.divider()
            else:
                st.warning("Nenhuma anotação clínica encontrada para este paciente.")

        # --- TABELA DE LANÇAMENTOS ---
        st.subheader("📑 Detalhamento de Sessões")
        st.dataframe(
            df_filtrado[["data", "tipo", "valor_sessao", "valor_pago", "faltas", "obs"]],
            use_container_width=True
        )

        csv = df_filtrado.to_csv(index=False).encode("utf-8")
        st.download_button(
            "⬇️ Exportar sessões (CSV)",
            data=csv,
            file_name=f"sessoes_{paciente_selecionado}.csv",
            mime="text/csv"
        )

    else:
        st.info(f"O paciente {paciente_selecionado} ainda não possui sessões registadas.")
else:
    st.warning("Nenhum paciente encontrado na base de dados. Vá à página de Cadastro.")

# Botão de atualização manual na sidebar
if st.sidebar.button("🔄 Atualizar Base de Dados"):
    st.cache_data.clear()
    st.rerun()
