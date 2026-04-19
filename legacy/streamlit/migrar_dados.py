from pathlib import Path
import unicodedata

import numpy as np
import pandas as pd
import streamlit as st

from database import supabase


def limpar_valor(v):
    if pd.isna(v) or (isinstance(v, float) and np.isnan(v)):
        return None
    if isinstance(v, (pd.Timestamp,)):
        return v.strftime("%Y-%m-%d")
    if hasattr(v, "isoformat") and not isinstance(v, (str, bytes)):
        try:
            return v.isoformat()
        except Exception:
            pass
    return v


EXCEL_PATH = Path("antigos") / "dados_limpos.xlsx"
SHEET_PACIENTES = "dados"
SHEET_ENTRADAS = "entradas"

COLS_PACIENTES = {
    "nome",
    "cpf",
    "email",
    "origem",
    "quem_indicou",
    "telefone",
    "observacoees",
}

COLS_ENTRADAS = {
    "data",
    "valor_sessao",
    "nome",
    "tipo",
    "faltas",
    "valor_pago",
    "obs",
    "anotacoes_clinicas",
}


def normalizar_colunas(df):
    def norm(col):
        texto = str(col).strip().lower()
        texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
        return texto.replace(" ", "_").replace("-", "_").replace(".", "")

    return df.rename(columns={c: norm(c) for c in df.columns})


def preparar_pacientes(df):
    df = normalizar_colunas(df)
    ajustes = {
        "observacoes": "observacoees",
    }
    df = df.rename(columns=ajustes)
    df = df[df.get("nome").notna()].copy()
    df = df[[c for c in df.columns if c in COLS_PACIENTES]]
    return df


def preparar_entradas(df):
    df = normalizar_colunas(df)
    ajustes = {
        "valor": "valor_sessao",
        "pago": "valor_pago",
    }
    df = df.rename(columns=ajustes)

    if "data" in df.columns:
        df["data"] = pd.to_datetime(df["data"], errors="coerce").dt.strftime("%Y-%m-%d")

    for coluna in ("valor_sessao", "valor_pago"):
        if coluna in df.columns:
            df[coluna] = pd.to_numeric(df[coluna], errors="coerce")

    if "anotacoes_clinicas" not in df.columns:
        df["anotacoes_clinicas"] = None

    df = df.copy()
    df["_nome_ok"] = df.get("nome").notna()
    df["_data_ok"] = df.get("data").notna()
    df = df[df["_nome_ok"] & df["_data_ok"]].copy()
    df = df.drop(columns=["_nome_ok", "_data_ok"], errors="ignore")
    df = df[[c for c in df.columns if c in COLS_ENTRADAS]]
    return df


st.title("Migração: Excel -> Supabase")

if st.button("Importar dados do Excel"):
    try:
        st.write("Lendo planilha...")
        df_pacientes = pd.read_excel(EXCEL_PATH, sheet_name=SHEET_PACIENTES)
        df_entradas = pd.read_excel(EXCEL_PATH, sheet_name=SHEET_ENTRADAS)

        st.write(f"Pacientes lidos: {len(df_pacientes)}")
        st.write(f"Entradas lidas: {len(df_entradas)}")

        df_pacientes = preparar_pacientes(df_pacientes)
        df_entradas = preparar_entradas(df_entradas)

        st.write(f"Pacientes prontos: {len(df_pacientes)}")
        st.write(f"Entradas prontas: {len(df_entradas)}")
        if not df_entradas.empty:
            st.write("Exemplo de entrada:")
            st.json(df_entradas.head(1).to_dict(orient="records")[0])

        dados_pacientes = []
        for registro in df_pacientes.to_dict(orient="records"):
            dados_pacientes.append({k: limpar_valor(v) for k, v in registro.items()})

        dados_entradas = []
        for registro in df_entradas.to_dict(orient="records"):
            dados_entradas.append({k: limpar_valor(v) for k, v in registro.items()})

        st.write(f"Enviando {len(dados_pacientes)} pacientes...")
        for i in range(0, len(dados_pacientes), 50):
            batch = dados_pacientes[i:i + 50]
            supabase.table("pacientes").insert(batch).execute()

        st.write(f"Enviando {len(dados_entradas)} entradas...")
        for i in range(0, len(dados_entradas), 100):
            batch = dados_entradas[i:i + 100]
            supabase.table("entradas").insert(batch).execute()

        st.success("Migração concluída. Verifique o app.")

    except Exception as e:
        st.error(f"Erro detalhado: {e}")
