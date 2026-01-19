import streamlit as st
from supabase import create_client, Client

@st.cache_resource
def init_connection():
    # Garante que não existam espaços em branco nas chaves
    url = st.secrets["SUPABASE_URL"].strip()
    key = st.secrets["SUPABASE_KEY"].strip()
    return create_client(url, key)

supabase = init_connection()