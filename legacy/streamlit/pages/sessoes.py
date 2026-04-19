import streamlit as st
import pandas as pd
from datetime import date, datetime, time
from database import ensure_login, render_sidebar_user

st.set_page_config(layout="wide", page_title="Sessoes")

client = ensure_login()
render_sidebar_user()

# --- BUSCA DE DADOS ---
def get_pacientes():
    res = client.table("pacientes").select("nome").execute()
    if not res.data:
        return []
    nomes = [p.get("nome") for p in res.data if p.get("nome")]
    return sorted(set(nomes))


def get_ultimo_valor(nome_paciente):
    res = client.table("entradas").select("valor_pago").eq("nome", nome_paciente).order("data", desc=True).limit(1).execute()
    if not res.data:
        return 0.0
    valor = res.data[0].get("valor_pago")
    try:
        return float(valor) if valor is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


st.title("Lancamento de Atendimento")

nomes = get_pacientes()
if nomes:
    edit_event_id = st.session_state.pop("edit_event_id", None)
    edit_data = st.session_state.pop("edit_data", None)
    schedule_id = st.session_state.pop("schedule_id", None)
    prefill_date = st.session_state.pop("prefill_date", date.today())
    prefill_time = st.session_state.pop("prefill_time", time(9, 0))

    if edit_data is not None:
        edit_nome = edit_data.get("nome")
        if edit_nome in nomes:
            paciente_sel = st.selectbox("Selecione o Paciente:", nomes, index=nomes.index(edit_nome))
        else:
            paciente_sel = st.selectbox("Selecione o Paciente:", nomes)
        try:
            dt = pd.to_datetime(edit_data.get("data"))
            if not pd.isna(dt):
                prefill_date = dt.date()
                prefill_time = dt.time()
        except Exception:
            pass
        valor_padrao = edit_data.get("valor_pago") if edit_data.get("valor_pago") is not None else get_ultimo_valor(paciente_sel)
        valor_sessao_padrao = edit_data.get("valor_sessao") if edit_data.get("valor_sessao") is not None else valor_padrao
        obs_padrao = edit_data.get("obs") if edit_data.get("obs") is not None else ""
    else:
        paciente_sel = st.selectbox("Selecione o Paciente:", nomes)
        valor_padrao = get_ultimo_valor(paciente_sel)
        valor_sessao_padrao = valor_padrao
        obs_padrao = ""

    default_date = prefill_date
    default_time = prefill_time

    with st.form("form_atendimento", clear_on_submit=True):
        c1, c2 = st.columns(2)
        with c1:
            data_s = st.date_input("Data:", value=default_date)
            tipo_index = 0
            if edit_data is not None:
                tipo_index = 0 if edit_data.get("tipo") == "Sessao Individual" else 1
            tipo = st.selectbox("Tipo:", ["Sessao Individual", "Avaliacao"], index=tipo_index)
        with c2:
            hora_s = st.time_input("Horario:", value=default_time)
            v_sessao = st.number_input("Valor Sessao:", value=valor_sessao_padrao)
            v_pago = st.number_input("Valor Pago:", value=valor_padrao)

        anotacoes = st.text_area(
            "Evolucao Clinica:",
            value=(edit_data.get("anotacoes_clinicas") if edit_data is not None else ""),
        )
        obs = st.text_area("Observacoes:", value=obs_padrao)

        data_hora = datetime.combine(data_s, hora_s)
        habilitar_status = datetime.now() > data_hora

        situacao = st.selectbox(
            "Situacao:",
            ["Realizado", "Remarcado", "Falta abonada", "Falta cobrada"],
            disabled=not habilitar_status,
        )

        agendar = st.form_submit_button("Agendar")
        salvar = st.form_submit_button("Salvar Atendimento", disabled=not habilitar_status)

    if agendar:
        dados_agendamento = {
            "data": data_hora.isoformat(),
            "nome": paciente_sel,
            "tipo": tipo,
            "valor_sessao": v_sessao,
            "valor_pago": v_pago,
            "obs": obs,
        }
        try:
            client.table("agendamentos").insert(dados_agendamento).execute()
            st.success("Agendamento salvo.")
            st.cache_data.clear()
        except Exception as e:
            st.error(f"Erro ao agendar: {e}")

    if salvar:
        log = ""
        data_str = data_hora.strftime("%d/%m/%Y %H:%M")
        v_sessao_final = v_sessao
        v_pago_final = v_pago
        if situacao == "Realizado":
            log = f"Sessao realizada dia {data_str}."
        elif situacao == "Remarcado":
            log = f"Sessao nao realizada na data {data_str}."
            st.info("Sessao remarcada. Selecione nova data e horario.")
            st.session_state["prefill_date"] = date.today()
            st.session_state["prefill_time"] = time(9, 0)
            st.rerun()
        elif situacao == "Falta abonada":
            log = f"Sessao abonada dia {data_str}."
            v_sessao_final = 0
            v_pago_final = 0
        elif situacao == "Falta cobrada":
            log = f"Cliente faltou no dia {data_str}."

        obs_final = obs.strip()
        if log:
            obs_final = f"{log}\n{obs_final}".strip()

        dados_sessao = {
            "data": data_hora.isoformat(),
            "nome": paciente_sel,
            "tipo": tipo,
            "valor_sessao": v_sessao_final,
            "valor_pago": v_pago_final,
            "anotacoes_clinicas": anotacoes,
            "obs": obs_final,
        }
        try:
            if edit_event_id:
                client.table("entradas").update(dados_sessao).eq("id", edit_event_id).execute()
                st.success("Atendimento atualizado!")
            else:
                client.table("entradas").insert(dados_sessao).execute()
                st.success("Atendimento registrado na nuvem!")
            if schedule_id:
                client.table("agendamentos").delete().eq("id", schedule_id).execute()
            st.cache_data.clear()
        except Exception as e:
            st.error(f"Erro: {e}")

    st.divider()
    st.subheader("Tabela de Sessoes (Supabase)")
    try:
        res = client.table("entradas").select("*").order("data", desc=True).execute()
        df_entradas = pd.DataFrame(res.data) if res.data else pd.DataFrame()
        if not df_entradas.empty:
            st.dataframe(df_entradas, use_container_width=True)
        else:
            st.info("Nenhuma sessao encontrada na base.")
    except Exception as e:
        st.error(f"Erro ao carregar sessoes: {e}")
else:
    st.warning("Cadastre um paciente primeiro.")
