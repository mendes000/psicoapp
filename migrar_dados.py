import pandas as pd
import streamlit as st
from database import supabase
import numpy as np

def limpar_valor(v):
    if pd.isna(v) or (isinstance(v, float) and np.isnan(v)):
        return None
    return v

st.title("🚀 Migração Final: Parquet -> Supabase")

if st.button("Executar Migração Agora"):
    try:
        st.write("📖 Lendo pacientes.parquet...")
        df = pd.read_parquet('pacientes.parquet')

        # --- MAPEAMENTO DE GUERRA ---
        # Aqui alinhamos o seu arquivo com os nomes que o erro confirmou existirem
        mapeamento = {
            'nome da mãe': 'nome_da_mae',
            'nome contato': 'nome_do_contato',  # O erro confirmou que este nome já existe!
            'contato emergencia': 'contato_emergencia',
            'quem indicou': 'quem_indicou',
            'nome do pai': 'nome_do_pai',
            'observações': 'observacoees'      # Ajustado para o nome com dois 'e' do seu código original
        }
        
        # Renomeia as colunas encontradas
        df = df.rename(columns=mapeamento)
        
        # Garante que todas as outras fiquem em minúsculo e sem espaços
        df.columns = [col.lower().strip().replace(" ", "_") for col in df.columns]

        # Converte para lista de dicionários e limpa NaNs
        dados = []
        for registro in df.to_dict(orient='records'):
            dados.append({k: limpar_valor(v) for k, v in registro.items()})

        st.write(f"📤 Enviando {len(dados)} pacientes...")
        
        # Envio em lotes para evitar erros de timeout
        for i in range(0, len(dados), 50):
            batch = dados[i:i+50]
            supabase.table("pacientes").insert(batch).execute()
            
        st.success("🎉 MIGRADO COM SUCESSO! Verifique seu app agora.")

    except Exception as e:
        st.error(f"Erro detalhado: {e}")