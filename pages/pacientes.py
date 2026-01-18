import pandas as pd
from pathlib import Path
import streamlit as st
from datetime import date

# --- 1. FUNÇÕES DE DADOS ---
def carregar_origens_atuais():
    caminho = Path.cwd() / 'pacientes.parquet'
    if caminho.exists():
        try:
            df = pd.read_parquet(caminho)
            if 'origem' in df.columns:
                origens = df['origem'].dropna().unique().tolist()
                origens = [str(o) for o in origens if o != ""]
                if "Indicação" not in origens:
                    origens.append("Indicação")
                return sorted(origens)
        except:
            pass
    return ["Particular", "Indicação", "Instagram", "Google Ads"]

def salvar_paciente(dados):
    caminho = Path.cwd() / 'pacientes.parquet'
    if caminho.exists():
        df_atual = pd.read_parquet(caminho)
    else:
        # Cria o DataFrame com TODAS as colunas identificadas no arquivo
        colunas = [
            'nome', 'tratamento', 'nascimento', 'telefone', 'profissao', 
            'contato emergência', 'nome do contato', 'email', 'endereco', 
            'bairro', 'cidade', 'CEP', 'nome do pai', 'nome da mae', 
            'CPF', 'origem', 'quem indicou', 'observacoees'
        ]
        df_atual = pd.DataFrame(columns=colunas)
    
    # Adiciona o novo paciente
    df_novo = pd.concat([df_atual, pd.DataFrame([dados])], ignore_index=True)
    df_novo.to_parquet(caminho)
    st.cache_data.clear()

# --- 2. CONFIGURAÇÃO DA PÁGINA ---
st.set_page_config(layout="wide", page_title="Cadastro Completo de Pacientes")
st.title("👤 Cadastro Completo de Paciente")

# --- 3. INTERFACE ---
lista_origens = carregar_origens_atuais()

# Origem fora do form para lógica dinâmica do campo "quem indicou"
origem_selecionada = st.selectbox("🎯 Origem do Lead:", lista_origens)

with st.form("form_paciente_completo", clear_on_submit=True):
    # --- SEÇÃO 1: DADOS PESSOAIS ---
    st.subheader("📋 Dados Pessoais")
    c1, c2, c3 = st.columns([2, 1, 1])
    with c1:
        nome = st.text_input("Nome Completo:")
    with c2:
        nascimento = st.text_input("Data de Nascimento (ou texto):")
    with c3:
        cpf = st.text_input("CPF:")
        
    c4, c5, c6 = st.columns(3)
    with c4:
        profissao = st.text_input("Profissão:")
    with c5:
        tratamento = st.text_input("Tipo de Tratamento:")
    with c6:
        email = st.text_input("E-mail:")

    # --- SEÇÃO 2: LOCALIZAÇÃO E CONTATOS ---
    st.subheader("📍 Localização e Contatos")
    l1, l2 = st.columns([2, 1])
    with l1:
        endereco = st.text_input("Endereço:")
    with l2:
        bairro = st.text_input("Bairro:")
        
    l3, l4, l5 = st.columns(3)
    with l3:
        cidade = st.text_input("Cidade:")
    with l4:
        cep = st.text_input("CEP:")
    with l5:
        telefone = st.text_input("Telefone Principal:")

    # --- SEÇÃO 3: FAMÍLIA E EMERGÊNCIA ---
    st.subheader("👪 Família e Emergência")
    f1, f2 = st.columns(2)
    with f1:
        nome_pai = st.text_input("Nome do Pai:")
    with f2:
        nome_mae = st.text_input("Nome da Mãe:")
        
    e1, e2 = st.columns(2)
    with e1:
        nome_contato = st.text_input("Nome do Contato de Emergência:")
    with e2:
        contato_emergencia = st.text_input("Telefone de Emergência:")

    # --- SEÇÃO 4: ORIGEM E OBSERVAÇÕES ---
    st.subheader("📝 Informações Adicionais")
    
    # Campo condicional de indicação
    quem_indicou = ""
    if origem_selecionada == "Indicação":
        quem_indicou = st.text_input("👤 Nome de quem indicou:")
    
    observacoes = st.text_area("🗒️ Observações (observacoees):")

    # Botão de Envio
    submit = st.form_submit_button("💾 Salvar Cadastro Completo")

# --- 4. PROCESSAMENTO ---
if submit:
    if not nome:
        st.error("O campo 'Nome' é obrigatório.")
    else:
        novo_paciente = {
            'nome': nome,
            'tratamento': tratamento,
            'nascimento': nascimento,
            'telefone': telefone,
            'profissao': profissao,
            'contato emergência': contato_emergencia,
            'nome do contato': nome_contato,
            'email': email,
            'endereco': endereco,
            'bairro': bairro,
            'cidade': cidade,
            'CEP': cep,
            'nome do pai': nome_pai,
            'nome da mae': nome_mae,
            'CPF': cpf,
            'origem': origem_selecionada,
            'quem indicou': quem_indicou,
            'observacoees': observacoes
        }
        
        try:
            salvar_paciente(novo_paciente)
            st.success(f"Paciente {nome} cadastrado com sucesso!")
            st.balloons()
        except Exception as e:
            st.error(f"Erro ao salvar: {e}")

# --- 5. VISUALIZAÇÃO ---
st.divider()
st.subheader("🔍 Pacientes Recentes")
if (Path.cwd() / 'pacientes.parquet').exists():
    df_lista = pd.read_parquet(Path.cwd() / 'pacientes.parquet')
    st.dataframe(df_lista.tail(5).iloc[::-1], use_container_width=True)