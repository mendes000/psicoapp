# Legacy Streamlit

Este diretorio preserva a versao antiga em Streamlit apenas para consulta historica.

## Status

- Nao faz parte do deploy na Vercel
- Nao e mais o frontend oficial do projeto
- Segredos reais foram removidos do branch atual

## Se for realmente necessario rodar o legado

1. Crie `legacy/streamlit/.streamlit/secrets.toml` a partir de `secrets.toml.example`.
2. Instale as dependencias do legado:

```bash
pip install -r legacy/streamlit/requirements.txt
```

3. Rode o painel antigo:

```bash
streamlit run legacy/streamlit/psicoapp.py
```
