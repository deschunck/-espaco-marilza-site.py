// Regras de horário. O app tem uma cópia desta mesma lógica em src/utils/horarios.ts,
// por isso os dois sempre mostram os mesmos horários livres.
import { chaveDaData, paraData } from "./utilitarios.js";

// "14:30" -> 870 (minutos desde a meia-noite)
export function paraMinutos(horario) {
  const [horas, minutos] = horario.split(":").map(Number);
  return horas * 60 + minutos;
}

// 870 -> "14:30"
export function paraHorario(minutos) {
  const horas = String(Math.floor(minutos / 60)).padStart(2, "0");
  const resto = String(minutos % 60).padStart(2, "0");
  return `${horas}:${resto}`;
}

// Calcula o horário de término de um atendimento.
export function calcularFim(horario, duracao) {
  return paraHorario(paraMinutos(horario) + Number(duracao));
}

// Devolve os horários ainda livres em um dia.
//
// dataISO: dia consultado, no formato "2026-11-16"
// expediente: horários oferecidos pela profissional em cada dia da semana
//             (exemplo: { "1": ["09:00", "10:00"] } -> segunda às 9h e às 10h)
// duracao: duração do serviço escolhido (em minutos)
// agendamentos: agendamentos existentes (de qualquer dia; a função filtra)
// ignorarId: agendamento que não conta como ocupado (usado ao reagendar)
export function calcularHorariosLivres(dataISO, expediente, duracao, agendamentos, ignorarId = null) {
  const agora = new Date();
  const hojeISO = chaveDaData(agora);
  if (dataISO < hojeISO) return []; // dia que já passou

  const diaDaSemana = paraData(dataISO).getDay(); // 0 = domingo
  const horariosDoDia = expediente[String(diaDaSemana)] || [];

  const minutosDeAgora = agora.getHours() * 60 + agora.getMinutes();
  const ocupados = agendamentos.filter(a =>
    a.data === dataISO && a.status !== "cancelado" && a.id !== ignorarId
  );

  return [...horariosDoDia].sort().filter(horario => {
    const inicio = paraMinutos(horario);
    const fim = inicio + Number(duracao);

    // Hoje, só vale horário que ainda não passou.
    if (dataISO === hojeISO && inicio <= minutosDeAgora) return false;

    // O horário está livre se não "encosta" em nenhum agendamento existente.
    const temConflito = ocupados.some(a =>
      inicio < paraMinutos(a.horarioFim) && fim > paraMinutos(a.horario)
    );
    return !temConflito;
  });
}
