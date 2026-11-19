#!/usr/bin/env python3
"""Servidor local do site Espaço Marilza Caricatti.

Ele apenas entrega os arquivos do site (HTML, CSS e JavaScript) em
http://localhost:8000. Os agendamentos NÃO passam por aqui: o próprio
site conversa direto com o Firebase (veja a pasta js/).

Para iniciar:  python server.py
"""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PASTA_DO_SITE = Path(__file__).resolve().parent
PORTA = 8000


class SiteHandler(SimpleHTTPRequestHandler):
    """Entrega os arquivos da pasta do site."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PASTA_DO_SITE), **kwargs)

    def end_headers(self):
        # Evita que o navegador guarde versões antigas dos arquivos durante o desenvolvimento.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format_string, *args):
        # Mantém o terminal limpo durante o uso normal do site.
        return


# Função principal para iniciar o servidor.
def main():
    servidor = ThreadingHTTPServer(("0.0.0.0", PORTA), SiteHandler)
    print(f"Espaço Marilza Caricatti disponível em http://localhost:{PORTA}")
    print("Os agendamentos são salvos no Firebase (Firestore).")
    print("Pressione Ctrl+C para encerrar.")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
