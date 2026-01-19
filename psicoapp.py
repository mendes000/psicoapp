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
        # --- MÉTRICAS FINANCEIRAS ---
        # Convertendo para float para garantir cálculos precisos
        v_total = df_p['valor_sessao'].astype(float).sum()
        p_total = df_p['valor_pago'].astype(float).sum()
        saldo = p_total - v_total

        col1, col2, col3 = st.columns(3)
        col1.metric("Sessões Registadas", len(df_p))
        col2.metric("Total Pago", f"R$ {p_total:,.2f}")
        col3.metric("Saldo do Paciente", f"R$ {saldo:,.2f}", 
                    delta=f"{saldo:,.2f}", delta_color="normal" if saldo >= 0 else "inverse")

        st.divider()

        # --- EVOLUÇÃO CLÍNICA ---
        st.subheader("📋 Histórico de Evolução")
        
        with st.expander("🔍 Visualizar Anotações e Notas de Sessão", expanded=True):
            # Filtra apenas registros que tenham anotações preenchidas
            notas = df_p[df_p['anotacoes_clinicas'].notna() & (df_p['anotacoes_clinicas'] != "")]
            
            if not notas.empty:
                for _, row in notas.iterrows():
                    data_formatada = pd.to_datetime(row['data']).strftime('%d/%m/%Y')
                    st.markdown(f"**🗓️ {data_formatada}** — *{row['tipo']}*")
                    st.info(row['anotacoes_clinicas'])
                    if row['obs']:
                        st.caption(f"📌 Observação: {row['obs']}")
                    st.divider()
            else:
                st.warning("Nenhuma anotação clínica encontrada para este paciente.")

        # --- TABELA DE LANÇAMENTOS ---
        st.subheader("📑 Detalhamento de Sessões")
        st.dataframe(
            df_p[['data', 'tipo', 'valor_sessao', 'valor_pago', 'faltas', 'obs']], 
            use_container_width=True
        )

    else:
        st.info(f"O paciente {paciente_selecionado} ainda não possui sessões registadas.")
else:
    st.warning("Nenhum paciente encontrado na base de dados. Vá à página de Cadastro.")

# Botão de atualização manual na sidebar
if st.sidebar.button("🔄 Atualizar Base de Dados"):
    st.cache_data.clear()
    st.rerun()