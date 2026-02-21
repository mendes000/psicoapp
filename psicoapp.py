from runpy import run_path
from pathlib import Path

run_path(str(Path(__file__).with_name("psicoapp_v2.py")), run_name="__main__")
