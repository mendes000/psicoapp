import pandas as pd
from pathlib import Path
import streamlit as st
from datetime import date

# --- 1. FUNÇÕES DE DADOS ---
def carregar_dados():
    caminho = Path.cwd()
    df_e = pd.read_parquet(caminho / 'entradas.parquet') if (caminho / 'entradas.parquet').exists() else pd.DataFrame()
    df_p = pd.read_parquet(caminho / 'pacientes.parquet') if (caminho / 'pacientes.parquet').exists() else pd.DataFrame()
    return df_e, df_p

def salvar_atendimento(nova_entrada):
    caminho = Path.cwd() / 'entradas.parquet'
    if caminho.exists():
        df_atual = pd.read_parquet(caminho)
    else:
        df_atual = pd.DataFrame()
    
    df_novo = pd.concat([df_atual, pd.DataFrame([nova_entrada])], ignore_index=True)
    df_novo.to_parquet(caminho)
    st.cache_data.clear()

# --- 2. CONFIGURAÇÃO DA PÁGINA ---
st.set_page_config(layout="wide", page_title="Lançamento de Sessões")
df_entradas, df_pacientes = carregar_dados()

st.title("📝 Lançamento de Atendimento")

# --- 3. LÓGICA DE VALOR DEFAULT ---
# Seleção do Paciente primeiro para podermos buscar o histórico
if not df_pacientes.empty:
    lista_nomes = sorted(df_pacientes['nome'].unique())
    paciente_selecionado = st.selectbox("Selecione o Paciente:", lista_nomes)
    
    # Busca o último valor pago por este paciente
    valor_default = 0.0
    if not df_entradas.empty:
        historico_paciente = df_entradas[df_entradas['nome'] == paciente_selecionado]
        if not historico_paciente.empty:
            # Pega o valor_pago do registro com a data mais recente
            ultimo_registro = historico_paciente.sort_values(by='data', ascending=False).iloc[0]
            valor_default = float(ultimo_registro['valor_pago'])

    # --- 4. FORMULÁRIO DE LANÇAMENTO ---
    with st.form("form_sessao", clear_on_submit=True):
        col1, col2 = st.columns(2)
        
        with col1:
            data_sessao = st.date_input("Data:", value=date.today())
            tipo = st.selectbox("Tipo:", ["Sessão Individual", "Sessão Casal", "Avaliação", "Supervisão"])
            falta = st.selectbox("Falta:", ["-", "FALTA", "FALTA JUSTIFICADA", "ABONO"])
        
        with col2:
            # O valor_pago agora usa o valor_default como padrão
            valor_sessao = st.number_input("Valor da Sessão (R$):", min_value=0.0, value=valor_default, step=10.0)
            valor_pago = st.number_input("Valor Pago (R$):", min_value=0.0, value=valor_default, step=10.0)
            apenas_pgto = st.checkbox("Somente Pagamento (sem sessão)")

        obs = st.text_input("Observação Curta:")
        anotacoes = st.text_area("✍️ Anotações e Evolução do Caso:")

        submit = st.form_submit_button("Salvar Atendimento")

    if submit:
        # Lógica para Somente Pagamento (zera o custo da sessão no banco se for só crédito)
        valor_custo = 0.0 if apenas_pgto else valor_sessao
        
        nova_entrada = {
            'data': pd.Timestamp(data_sessao),
            'nome': paciente_selecionado,
            'tipo': tipo,
            'valor_sessao': valor_custo,
            'valor_pago': valor_pago,
            'faltas': falta if falta != "-" else "",
            'apenas_pgto': apenas_pgto,
            'obs': obs,
            'anotacoes_clinicas': anotacoes
        }
        
        try:
            salvar_atendimento(nova_entrada)
            st.success(f"Lançamento para {paciente_selecionado} salvo com sucesso!")
            st.rerun() # Recarrega para atualizar o histórico e o próximo default
        except Exception as e:
            st.error(f"Erro ao salvar: {e}")

else:
    st.warning("Nenhum paciente cadastrado. Por favor, cadastre um paciente primeiro.")