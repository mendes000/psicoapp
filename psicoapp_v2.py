import streamlit as st

st.set_page_config(layout="wide", page_title="PsicoApp v2")

LABEL_PAINEL = "Painel de Pacientes"
LABEL_STACKS = "Pacientes em Stacks"

PAGES = [
    ("pages/pacientes_stacks.py", LABEL_STACKS),
]

if hasattr(st, "navigation") and hasattr(st, "Page"):
    nav_pages = [st.Page(path, title=title) for path, title in PAGES]
    st.navigation(nav_pages).run()
else:
    st.sidebar.title("Menu")
    labels = [title for _, title in PAGES]
    escolha = st.sidebar.radio("Navegar", labels)

    alvo = dict(PAGES)[escolha]
    if hasattr(st, "switch_page"):
        st.switch_page(alvo)
    else:
        st.error("Sua versao do Streamlit nao suporta trocar de pagina via codigo.")

    st.title("PsicoApp v2")
    st.write("Use o menu lateral para navegar.")
