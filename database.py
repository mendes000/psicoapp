import streamlit as st
from supabase import create_client, Client

# Teste temporário no database.py
url = st.secrets["SUPABASE_URL"]
key = st.secrets["SUPABASE_KEY"]

st.write(f"URL configurada: {url}")
st.write(f"Tamanho da Chave: {len(key)} caracteres") # Uma anon key costuma ter mais de 80 caracteres

if key.startswith(" "):
    st.error("AVISO: Sua chave começa com um espaço vazio!")
if url.endswith("/"):
    st.error("AVISO: Remova a barra '/' do final da sua URL!")


@st.cache_resource
def init_connection():
    url = st.secrets["SUPABASE_URL"]
    key = st.secrets["SUPABASE_KEY"]
    return create_client(url, key)

supabase = init_connection()