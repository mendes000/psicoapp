import streamlit as st
from supabase import create_client, Client


@st.cache_resource
def init_anon_connection():
    url = st.secrets["SUPABASE_URL"].strip()
    key = st.secrets["SUPABASE_KEY"].strip()
    return create_client(url, key)


def get_user_client() -> Client:
    client = init_anon_connection()
    access = st.session_state.get("sb_access_token")
    refresh = st.session_state.get("sb_refresh_token")
    if access and refresh:
        client.auth.set_session(access, refresh)
    return client


def is_logged_in() -> bool:
    return bool(st.session_state.get("sb_access_token"))


def sign_in(email: str, password: str) -> bool:
    client = init_anon_connection()
    try:
        res = client.auth.sign_in_with_password({"email": email, "password": password})
    except Exception as exc:
        st.error(f"Erro no login: {exc}")
        return False

    session = getattr(res, "session", None)
    user = getattr(res, "user", None)
    if not session:
        st.error("Login falhou. Verifique email e senha.")
        return False

    st.session_state["sb_access_token"] = session.access_token
    st.session_state["sb_refresh_token"] = session.refresh_token
    st.session_state["sb_user_id"] = user.id if user else None
    st.session_state["sb_user_email"] = user.email if user else email
    return True


def sign_out():
    client = get_user_client()
    try:
        client.auth.sign_out()
    except Exception:
        pass
    for key in (
        "sb_access_token",
        "sb_refresh_token",
        "sb_user_id",
        "sb_user_email",
    ):
        st.session_state.pop(key, None)


def ensure_login():
    if is_logged_in():
        return get_user_client()

    st.markdown(
        """
<style>
section[data-testid="stSidebar"] { display: none !important; }
button[kind="header"] { display: none !important; }
</style>
""",
        unsafe_allow_html=True,
    )
    st.subheader("Login")
    with st.form("login_form"):
        email = st.text_input("Email", key="login_email")
        password = st.text_input("Senha", type="password", key="login_password")
        submit = st.form_submit_button("Entrar")
    if submit:
        if sign_in(email, password):
            st.rerun()
    st.warning("Faca login para continuar.")
    st.stop()


def render_sidebar_user():
    if not is_logged_in():
        return

    if not st.session_state.get("_topbar_css"):
        st.markdown(
            """
<style>
section[data-testid="stSidebar"] { display: none !important; }
button[kind="header"] { display: none !important; }
section.main > div.block-container { padding-top: 0.2rem !important; }
.top-user-wrap {
  width: 100%;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  min-height: 1rem;
  margin: 0;
  padding: 0;
}
.top-user-email {
  font-size: 0.82rem;
  opacity: 0.75;
  line-height: 1rem;
}
div[data-testid="stButton"] > button[kind="secondary"] {
  min-height: 1rem;
  height: 1rem;
  padding: 0 0.25rem;
  line-height: 1rem;
  font-size: 0.8rem;
}
</style>
""",
            unsafe_allow_html=True,
        )
        st.session_state["_topbar_css"] = True

    email = st.session_state.get("sb_user_email", "")
    c_spacer, c_email, c_btn = st.columns([22, 5, 1])
    with c_email:
        if email:
            st.markdown(
                f"<div class='top-user-wrap'><span class='top-user-email'>{email}</span></div>",
                unsafe_allow_html=True,
            )
    with c_btn:
        if st.button("?", help="Sair", key="logout_top_icon"):
            sign_out()
            st.rerun()


supabase = init_anon_connection()
