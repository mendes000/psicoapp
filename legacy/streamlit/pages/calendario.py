import streamlit as st
import pandas as pd
from datetime import date, datetime, timedelta, time
import calendar as cal

from database import ensure_login, render_sidebar_user

st.set_page_config(layout="wide", page_title="Calendario")

client = ensure_login()
render_sidebar_user()

st.title("Calendario de Sessoes")

@st.cache_data(ttl=60)
def carregar_eventos():
    res_e = client.table("entradas").select(
        "id,data,nome,tipo,valor_sessao,valor_pago,obs,anotacoes_clinicas"
    ).execute()
    df_e = pd.DataFrame(res_e.data) if res_e.data else pd.DataFrame()
    if not df_e.empty:
        df_e["source"] = "entrada"

    res_a = client.table("agendamentos").select(
        "id,data,nome,tipo,valor_sessao,valor_pago,obs"
    ).execute()
    df_a = pd.DataFrame(res_a.data) if res_a.data else pd.DataFrame()
    if not df_a.empty:
        df_a["source"] = "agendamento"

    if df_e.empty and df_a.empty:
        return pd.DataFrame()
    if df_e.empty:
        return df_a
    if df_a.empty:
        return df_e
    return pd.concat([df_e, df_a], ignore_index=True)


def parse_data(df):
    if df.empty:
        return df
    df = df.copy()
    df["data_dt"] = pd.to_datetime(df["data"], errors="coerce")
    df = df[df["data_dt"].notna()]
    df["data_date"] = df["data_dt"].dt.date
    df["hora"] = df["data_dt"].dt.strftime("%H:%M")
    return df


def get_events_map(df):
    eventos = {}
    for _, row in df.iterrows():
        d = row["data_date"]
        eventos.setdefault(d, []).append(row)
    return eventos


def goto_sessoes(dia: date, horario: time):
    st.session_state["prefill_date"] = dia
    st.session_state["prefill_time"] = horario
    if hasattr(st, "switch_page"):
        st.switch_page("pages/sessoes.py")
    else:
        st.info("Navegue ate a aba 'Sessoes' para continuar o lancamento.")


def editar_evento(ev):
    try:
        dt = pd.to_datetime(ev.get("data"))
        if not pd.isna(dt):
            st.session_state["prefill_date"] = dt.date()
            st.session_state["prefill_time"] = dt.time()
    except Exception:
        pass
    st.session_state["edit_event_id"] = ev.get("id") if ev.get("source") == "entrada" else None
    st.session_state["schedule_id"] = ev.get("id") if ev.get("source") == "agendamento" else None
    st.session_state["edit_data"] = ev
    if hasattr(st, "switch_page"):
        st.switch_page("pages/sessoes.py")
    else:
        st.info("Navegue ate a aba 'Sessoes' para editar o atendimento.")


hoje = date.today()

if "cal_view" not in st.session_state:
    st.session_state["cal_view"] = "Semanal"
if "cal_anchor" not in st.session_state:
    st.session_state["cal_anchor"] = hoje

view = st.selectbox("Visualizacao", ["Semanal", "Mensal"], index=0 if st.session_state["cal_view"] == "Semanal" else 1)
st.session_state["cal_view"] = view

col_nav1, col_nav2, col_nav3, col_nav4 = st.columns([1, 1, 2, 2])
with col_nav1:
    if st.button("<"):
        if view == "Semanal":
            st.session_state["cal_anchor"] = st.session_state["cal_anchor"] - timedelta(days=7)
        else:
            anchor = st.session_state["cal_anchor"]
            first = anchor.replace(day=1)
            prev_month_last = first - timedelta(days=1)
            st.session_state["cal_anchor"] = prev_month_last.replace(day=1)
with col_nav2:
    if st.button(">"):
        if view == "Semanal":
            st.session_state["cal_anchor"] = st.session_state["cal_anchor"] + timedelta(days=7)
        else:
            anchor = st.session_state["cal_anchor"]
            days_in_month = cal.monthrange(anchor.year, anchor.month)[1]
            next_month_first = anchor.replace(day=days_in_month) + timedelta(days=1)
            st.session_state["cal_anchor"] = next_month_first.replace(day=1)
with col_nav3:
    if st.button("Hoje"):
        st.session_state["cal_anchor"] = hoje
with col_nav4:
    horario_padrao = st.time_input("Horario para nova sessao", value=time(9, 0))

st.divider()

raw_df = carregar_eventos()
if raw_df.empty:
    st.info("Nenhuma sessao encontrada na base de dados.")
    st.stop()

df = parse_data(raw_df)

if df.empty:
    st.info("Nenhuma sessao com data valida encontrada.")
    st.stop()

events_map = get_events_map(df)

semana_inicio = st.session_state["cal_anchor"] - timedelta(days=st.session_state["cal_anchor"].weekday())
semana_dias = [semana_inicio + timedelta(days=i) for i in range(7)]

if view == "Semanal":
    cols = st.columns(7)
    for idx, dia in enumerate(semana_dias):
        with cols[idx]:
            if st.button(dia.strftime("%a %d/%m"), key=f"day_{dia}"):
                goto_sessoes(dia, horario_padrao)
            eventos = events_map.get(dia, [])
            for ev in sorted(eventos, key=lambda x: x["data_dt"]):
                label = f"{ev['hora']} - {ev['nome']}"
                if st.button(label, key=f"ev_{ev.get('source')}_{ev.get('id')}"):
                    editar_evento(ev)
else:
    anchor = st.session_state["cal_anchor"]
    first_day = anchor.replace(day=1)
    start = first_day - timedelta(days=first_day.weekday())
    days_in_month = cal.monthrange(anchor.year, anchor.month)[1]
    end = first_day.replace(day=days_in_month)
    end = end + timedelta(days=(6 - end.weekday()))

    current = start
    while current <= end:
        cols = st.columns(7)
        for idx in range(7):
            dia = current + timedelta(days=idx)
            with cols[idx]:
                label = dia.strftime("%d")
                if st.button(label, key=f"day_{dia}"):
                    goto_sessoes(dia, horario_padrao)
                eventos = events_map.get(dia, [])
                for ev in sorted(eventos, key=lambda x: x["data_dt"]):
                    label = f"{ev['hora']} - {ev['nome']}"
                    if st.button(label, key=f"ev_{ev.get('source')}_{ev.get('id')}"):
                        editar_evento(ev)
        current += timedelta(days=7)
