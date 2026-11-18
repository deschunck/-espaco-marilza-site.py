#!/usr/bin/env python3
"""Servidor do Espaço Marilza Caricatti: site estático + API REST com arquivo JSON."""

from __future__ import annotations

import json
import re
import threading
import uuid
from datetime import date, datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_FILE = DATA_DIR / "agendamentos.json"
STORE_LOCK = threading.RLock()

DEFAULT_STORE = {
    "configuracaoAgenda": {
        "diasDeAtendimento": [0, 1, 2, 3, 4],
        "horarioAbertura": "09:00",
        "horarioFechamento": "17:00",
        "inicioIntervalo": "12:00",
        "fimIntervalo": "13:00",
        "intervaloEntreHorarios": 30,
        "antecedenciaMinimaMinutos": 60,
    },
    "procedimentos": [
        {"id": "manicure", "nome": "Manicure", "descricao": "Cuidado delicado para mãos bonitas e bem cuidadas.", "preco": 35, "duracao": 60, "imagem": "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=700&q=80"},
        {"id": "pedicure", "nome": "Pedicure", "descricao": "Um momento de cuidado e beleza para seus pés.", "preco": 40, "duracao": 60, "imagem": "https://images.unsplash.com/photo-1519014816548-bf5fe059798b?auto=format&fit=crop&w=700&q=80"},
        {"id": "gel", "nome": "Esmaltação em gel", "descricao": "Brilho intenso e acabamento impecável por mais tempo.", "preco": 65, "duracao": 90, "imagem": "https://images.unsplash.com/photo-1632345031435-8727f6897d53?auto=format&fit=crop&w=700&q=80"},
        {"id": "alongamento", "nome": "Alongamento de unhas", "descricao": "Elegância e formato personalizado para suas unhas.", "preco": 150, "duracao": 150, "imagem": "https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=700&q=80"},
        {"id": "manutencao", "nome": "Manutenção de alongamento", "descricao": "Manutenção para conservar a beleza do seu alongamento.", "preco": 90, "duracao": 120, "imagem": "https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=700&q=80"},
        {"id": "nailart", "nome": "Nail art", "descricao": "Detalhes criativos para expressar seu estilo.", "preco": 20, "duracao": 30, "imagem": "https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=700&q=80"},
    ],
    "agendamentos": [],
}


def ensure_store() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        save_store(DEFAULT_STORE)


def load_store() -> dict:
    ensure_store()
    with DATA_FILE.open("r", encoding="utf-8") as file:
        data = json.load(file)
    data.setdefault("configuracaoAgenda", DEFAULT_STORE["configuracaoAgenda"].copy())
    data.setdefault("procedimentos", [])
    data.setdefault("agendamentos", [])
    return data


def save_store(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temporary = DATA_FILE.with_suffix(".json.tmp")
    with temporary.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
        file.write("\n")
    temporary.replace(DATA_FILE)


def normalize_phone(value: object) -> str:
    return re.sub(r"\D", "", str(value or ""))


def time_minutes(value: str) -> int:
    hour, minute = map(int, value.split(":"))
    return hour * 60 + minute


def minutes_time(value: int) -> str:
    return f"{value // 60:02d}:{value % 60:02d}"


def parse_iso_date(value: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        raise ValueError("Informe uma data válida no formato AAAA-MM-DD.")


def get_procedure(store: dict, procedure_id: str) -> dict | None:
    return next((item for item in store["procedimentos"] if item["id"] == procedure_id), None)


def available_slots(store: dict, day_string: str, procedure: dict, ignore_id: str | None = None) -> list[str]:
    day = parse_iso_date(day_string)
    today = date.today()
    config = store["configuracaoAgenda"]
    if day < today or day.weekday() not in config["diasDeAtendimento"]:
        return []

    opening = time_minutes(config["horarioAbertura"])
    closing = time_minutes(config["horarioFechamento"])
    break_start = time_minutes(config["inicioIntervalo"])
    break_end = time_minutes(config["fimIntervalo"])
    interval = max(5, int(config["intervaloEntreHorarios"]))
    duration = int(procedure["duracao"])
    min_today = -1
    if day == today:
        now = datetime.now()
        min_today = now.hour * 60 + now.minute + int(config["antecedenciaMinimaMinutos"])

    slots: list[str] = []
    for start in range(opening, closing - duration + 1, interval):
        finish = start + duration
        if start < break_end and finish > break_start:
            continue
        if start < min_today:
            continue

        conflict = False
        for booking in store["agendamentos"]:
            if booking["id"] == ignore_id or booking["status"] == "cancelado" or booking["data"] != day_string:
                continue
            booked_start = time_minutes(booking["horarioInicio"])
            booked_end = time_minutes(booking["horarioFim"])
            if start < booked_end and finish > booked_start:
                conflict = True
                break
        if not conflict:
            slots.append(minutes_time(start))
    return slots


def find_booking(store: dict, booking_id: str) -> dict | None:
    return next((item for item in store["agendamentos"] if item["id"] == booking_id), None)


class MarilzaHandler(SimpleHTTPRequestHandler):
    server_version = "MarilzaServer/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def send_json(self, status: int, payload: dict | list):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        if size <= 0 or size > 1_000_000:
            raise ValueError("Corpo JSON ausente ou muito grande.")
        try:
            payload = json.loads(self.rfile.read(size).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ValueError("O corpo da requisição precisa ser um JSON válido.")
        if not isinstance(payload, dict):
            raise ValueError("O corpo da requisição precisa ser um objeto JSON.")
        return payload

    def api_error(self, status: int, message: str):
        self.send_json(status, {"erro": message})

    def do_GET(self):
        parsed = urlsplit(self.path)
        path = unquote(parsed.path)
        if path.startswith("/data/") or path == "/data":
            return self.api_error(404, "Arquivo não encontrado.")
        if not path.startswith("/api/"):
            return super().do_GET()

        try:
            with STORE_LOCK:
                store = load_store()
                if path == "/api/procedimentos":
                    return self.send_json(200, {"procedimentos": store["procedimentos"]})

                if path == "/api/agendamentos":
                    query = parse_qs(parsed.query)
                    phone = normalize_phone(query.get("telefone", [""])[0])
                    if not phone:
                        return self.api_error(400, "Informe o telefone para consultar os agendamentos.")
                    matches = [item for item in store["agendamentos"] if item["cliente"]["telefone"] == phone]
                    matches.sort(key=lambda item: (item["data"], item["horarioInicio"], item["criadoEm"]))
                    return self.send_json(200, {"agendamentos": matches})

                if path.startswith("/api/agendamentos/"):
                    booking_id = path.rsplit("/", 1)[-1]
                    booking = find_booking(store, booking_id)
                    if not booking:
                        return self.api_error(404, "Agendamento não encontrado.")
                    return self.send_json(200, booking)

                if path == "/api/horarios-disponiveis":
                    query = parse_qs(parsed.query)
                    day_string = query.get("data", [""])[0]
                    procedure_id = query.get("procedimentoId", [""])[0]
                    ignore_id = query.get("ignorarId", [None])[0]
                    if not day_string or not procedure_id:
                        return self.api_error(400, "Informe data e procedimentoId.")
                    procedure = get_procedure(store, procedure_id)
                    if not procedure:
                        return self.api_error(404, "Procedimento não encontrado.")
                    slots = available_slots(store, day_string, procedure, ignore_id)
                    return self.send_json(200, {
                        "data": day_string,
                        "procedimentoId": procedure_id,
                        "horarios": slots,
                    })

                return self.api_error(404, "Endpoint não encontrado.")
        except ValueError as error:
            return self.api_error(400, str(error))
        except (OSError, json.JSONDecodeError) as error:
            return self.api_error(500, f"Não foi possível ler os dados: {error}")

    def do_POST(self):
        if urlsplit(self.path).path != "/api/agendamentos":
            return self.api_error(404, "Endpoint não encontrado.")
        try:
            payload = self.read_json()
            client = payload.get("cliente") or {}
            name = str(client.get("nome", "")).strip()
            phone = normalize_phone(client.get("telefone"))
            procedure_id = str(payload.get("procedimentoId", ""))
            day_string = str(payload.get("data", ""))
            start = str(payload.get("horarioInicio", ""))
            if len(name) < 3:
                return self.api_error(400, "Informe o nome completo da cliente.")
            if not 10 <= len(phone) <= 13:
                return self.api_error(400, "Informe um telefone com DDD.")
            parse_iso_date(day_string)
            if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", start):
                return self.api_error(400, "Informe um horário inicial válido.")

            with STORE_LOCK:
                store = load_store()
                procedure = get_procedure(store, procedure_id)
                if not procedure:
                    return self.api_error(404, "Procedimento não encontrado.")
                slots = available_slots(store, day_string, procedure)
                if start not in slots:
                    return self.api_error(409, "Este horário não está mais disponível. Escolha outro.")

                now = datetime.now().astimezone().isoformat(timespec="seconds")
                start_minutes = time_minutes(start)
                booking = {
                    "id": str(uuid.uuid4()),
                    "cliente": {"nome": name, "telefone": phone},
                    "procedimento": {
                        "id": procedure["id"],
                        "nome": procedure["nome"],
                        "preco": procedure["preco"],
                        "duracao": procedure["duracao"],
                    },
                    "data": day_string,
                    "horarioInicio": start,
                    "horarioFim": minutes_time(start_minutes + int(procedure["duracao"])),
                    "status": "confirmado",
                    "criadoEm": now,
                    "atualizadoEm": now,
                    "historico": [{"acao": "criado", "em": now}],
                }
                store["agendamentos"].append(booking)
                save_store(store)
            return self.send_json(201, booking)
        except ValueError as error:
            return self.api_error(400, str(error))
        except (OSError, json.JSONDecodeError) as error:
            return self.api_error(500, f"Não foi possível salvar o agendamento: {error}")

    def do_PUT(self):
        parsed = urlsplit(self.path)
        prefix = "/api/agendamentos/"
        if not parsed.path.startswith(prefix) or parsed.path.endswith("/cancelar"):
            return self.api_error(404, "Endpoint não encontrado.")
        booking_id = unquote(parsed.path[len(prefix):])
        try:
            payload = self.read_json()
            day_string = str(payload.get("data", ""))
            start = str(payload.get("horarioInicio", ""))
            procedure_id = str(payload.get("procedimentoId", ""))
            parse_iso_date(day_string)
            if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", start):
                return self.api_error(400, "Informe um horário inicial válido.")

            with STORE_LOCK:
                store = load_store()
                booking = find_booking(store, booking_id)
                if not booking:
                    return self.api_error(404, "Agendamento não encontrado.")
                if booking["status"] == "cancelado":
                    return self.api_error(409, "Não é possível reagendar um agendamento cancelado.")
                procedure = get_procedure(store, procedure_id or booking["procedimento"]["id"])
                if not procedure:
                    return self.api_error(404, "Procedimento não encontrado.")
                slots = available_slots(store, day_string, procedure, ignore_id=booking_id)
                if start not in slots:
                    return self.api_error(409, "Este horário não está disponível. Escolha outra opção.")

                previous = {
                    "data": booking["data"],
                    "horarioInicio": booking["horarioInicio"],
                    "horarioFim": booking["horarioFim"],
                    "procedimentoId": booking["procedimento"]["id"],
                }
                now = datetime.now().astimezone().isoformat(timespec="seconds")
                start_minutes = time_minutes(start)
                booking["data"] = day_string
                booking["horarioInicio"] = start
                booking["horarioFim"] = minutes_time(start_minutes + int(procedure["duracao"]))
                booking["procedimento"] = {
                    "id": procedure["id"],
                    "nome": procedure["nome"],
                    "preco": procedure["preco"],
                    "duracao": procedure["duracao"],
                }
                booking["atualizadoEm"] = now
                booking.setdefault("historico", []).append({
                    "acao": "reagendado",
                    "em": now,
                    "anterior": previous,
                    "novo": {
                        "data": booking["data"],
                        "horarioInicio": booking["horarioInicio"],
                        "horarioFim": booking["horarioFim"],
                    },
                })
                save_store(store)
            return self.send_json(200, booking)
        except ValueError as error:
            return self.api_error(400, str(error))
        except (OSError, json.JSONDecodeError) as error:
            return self.api_error(500, f"Não foi possível atualizar o agendamento: {error}")

    def do_PATCH(self):
        parsed = urlsplit(self.path)
        suffix = "/cancelar"
        prefix = "/api/agendamentos/"
        if not parsed.path.startswith(prefix) or not parsed.path.endswith(suffix):
            return self.api_error(404, "Endpoint não encontrado.")
        booking_id = unquote(parsed.path[len(prefix):-len(suffix)])
        try:
            with STORE_LOCK:
                store = load_store()
                booking = find_booking(store, booking_id)
                if not booking:
                    return self.api_error(404, "Agendamento não encontrado.")
                if booking["status"] != "cancelado":
                    now = datetime.now().astimezone().isoformat(timespec="seconds")
                    booking["status"] = "cancelado"
                    booking["atualizadoEm"] = now
                    booking.setdefault("historico", []).append({"acao": "cancelado", "em": now})
                    save_store(store)
            return self.send_json(200, booking)
        except (OSError, json.JSONDecodeError) as error:
            return self.api_error(500, f"Não foi possível cancelar o agendamento: {error}")

    def log_message(self, format_string, *args):
        # Mantém o terminal limpo durante o uso normal do site.
        return


def main():
    ensure_store()
    host = "0.0.0.0"
    port = 8000
    server = ThreadingHTTPServer((host, port), MarilzaHandler)
    print("Espaço Marilza Caricatti disponível em http://localhost:8000")
    print("Os agendamentos serão salvos em data/agendamentos.json")
    print("Pressione Ctrl+C para encerrar.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
