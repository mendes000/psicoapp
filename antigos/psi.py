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

paciente = st.sidebar.selectbox('Nome do Paciente:',df_entradas['nome'].value_counts().index)

primeira_sessao = df_entradas[df_entradas['nome']==paciente]['data'].min().date()
ultima_sessao = df_entradas[df_entradas['nome']==paciente]['data'].max().date()
qtde_sessoes = df_entradas[df_entradas['nome']==paciente]['nome'].count()
valor_sessoes = df_entradas[df_entradas['nome']==paciente]['valor_sessao'].sum()
valor_pago = df_entradas[df_entradas['nome']==paciente]['valor_pago'].sum()
numero_faltas = df_entradas[df_entradas['nome']==paciente]['faltas'].value_counts()
credito_debito = valor_pago - valor_sessoes

st.write(f'Informações: {paciente}')
st.write(f'primeira sessao: {primeira_sessao}')
st.write(f'ultima sessao: {ultima_sessao}')
st.write(f'qtde sessões: {qtde_sessoes}')
st.write(f'valor total das sessões: {valor_sessoes:.2f}')
st.write(f'valor total pago: {valor_pago:.2f}')
st.write(f'valor credito / debito: {credito_debito:.2f}')
st.write(numero_faltas)



st.dataframe(df_entradas[df_entradas['nome']==paciente])



df_entradas = pd.read_excel(caminho / 'entradas_edit.xlsx')

df_entradas['apenas_pgto'] = False

df_entradas.to_parquet(caminho / 'entradas.parquet', index=False)