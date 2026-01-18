import pandas as pd
from pathlib import Path
import streamlit as st

# --- FUNÇÃO PARA LIMPAR CACHE ---
def resetar_cache():
    st.cache_data.clear()

# Configuração da página
st.set_page_config(layout="wide", page_title="IA Psi - Prontuário")

# --- CARREGAMENTO COM CACHE ---
@st.cache_data
def carregar_entradas():
    caminho = Path.cwd() / 'entradas.parquet'
    try:
        df = pd.read_parquet(caminho)
        # Garante a existência da coluna de anotações
        if 'anotacoes_clinicas' not in df.columns:
            df['anotacoes_clinicas'] = None
        return df
    except Exception as e:
        return pd.DataFrame()

# Carrega os dados iniciais
df_entradas = carregar_entradas()

if not df_entradas.empty:
    # --- SELECTBOX COM GATILHO DE ATUALIZAÇÃO ---
    # O on_change=resetar_cache faz o app reler o arquivo toda vez que você troca o paciente
    lista_pacientes = sorted(df_entradas['nome'].unique())
    paciente = st.sidebar.selectbox(
        '👤 Selecionar Paciente:', 
        lista_pacientes,
        on_change=resetar_cache
    )

    # Filtragem após o possível reset de cache
    df_p = df_entradas[df_entradas['nome'] == paciente].sort_values(by='data', ascending=False)

    st.title(f"Prontuário Digital: {paciente}")

    # --- MÉTRICAS ---
    col1, col2, col3 = st.columns(3)
    valor_total = df_p['valor_sessao'].sum()
    pago_total = df_p['valor_pago'].sum()
    saldo = pago_total - valor_total
    
    col1.metric("Total de Sessões", len(df_p))
    col2.metric("Valor Total Pago", f"R$ {pago_total:,.2f}")
    col3.metric("Saldo", f"R$ {saldo:,.2f}", delta=f"{saldo:,.2f}")

    st.divider()

    # --- HISTÓRICO DE ANOTAÇÕES (EVOLUÇÃO) ---
    st.subheader("📋 Evolução e Anotações Clínicas")
    
    with st.expander("🔍 Visualizar Histórico de Evolução", expanded=True):
        # Filtro para mostrar apenas quem tem anotação
        df_notas = df_p[df_p['anotacoes_clinicas'].notna() & (df_p['anotacoes_clinicas'] != "")]
        
        if not df_notas.empty:
            for _, row in df_notas.iterrows():
                st.markdown(f"**🗓️ Sessão: {row['data'].strftime('%d/%m/%Y')}**")
                st.info(row['anotacoes_clinicas'])
                if row['obs']:
                    st.caption(f"*Obs: {row['obs']}*")
                st.divider()
        else:
            st.warning("Nenhuma anotação clínica para este paciente.")

    # --- TABELA DE DADOS ---
    st.subheader("📑 Detalhamento")
    st.dataframe(df_p[['data', 'tipo', 'valor_sessao', 'valor_pago', 'faltas', 'obs']], use_container_width=True)

else:
    st.error("Arquivo não encontrado. Cadastre um atendimento primeiro.")