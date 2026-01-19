import pandas as pd
from pathlib import Path
import streamlit as st
from datetime import datetime

st.set_page_config(layout="wide")

# Define o caminho base
caminho = Path.cwd()

# Carrega os DataFrames dos arquivos Parquet
df_pacientes = pd.read_parquet(caminho / 'pacientes.parquet')
df_entradas = pd.read_parquet(caminho / 'entradas.parquet')
df_saidas = pd.read_parquet(caminho / 'saidas.parquet')

df_pacientes = df_pacientes.rename(columns={
                                  'nome_do_pai': 'nome_pai',
                                  'nome_da_mae': 'nome_mae',
                                  'observacoes': 'observacoees	'
                                  })


df_pacientes.to_parquet(caminho / 'pacientes.parquet', index=False)