// Tudo o que o site faz com o Firebase fica neste arquivo.
// Os outros arquivos nunca falam direto com o banco: eles chamam as funções daqui.
//
// O banco (Firestore) tem três partes, as mesmas usadas pelo app:
//   servicos                  -> serviços cadastrados pela profissional
//   configuracoes/expediente  -> horários que ela disponibiliza
//   agendamentos              -> horários marcados (pelo site ou pelo app)
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";
import { calcularFim, calcularHorariosLivres } from "./horarios.js";

const db = getFirestore(initializeApp(firebaseConfig));
const agendamentos = collection(db, "agendamentos");

export const HORARIO_OCUPADO = "Este horário acabou de ser reservado. Por favor, escolha outro.";

// Transforma o resultado de uma consulta em uma lista simples de objetos.
const paraLista = resultado => resultado.docs.map(d => ({ id: d.id, ...d.data() }));

// ---------- Leituras em tempo real ----------
// As funções "observar" chamam "aoMudar" agora e de novo a cada alteração no banco.
// Todas devolvem uma função que, ao ser chamada, desliga a observação.

export function observarServicos(aoMudar, aoFalhar) {
  return onSnapshot(collection(db, "servicos"), resultado => {
    aoMudar(paraLista(resultado).sort((a, b) => a.nome.localeCompare(b.nome)));
  }, aoFalhar);
}

export function observarExpediente(aoMudar, aoFalhar) {
  return onSnapshot(doc(db, "configuracoes", "expediente"), documento => {
    aoMudar(documento.exists() ? documento.data().horarios : {});
  }, aoFalhar);
}

// Agendamentos entre duas datas (inclusive). Usado para saber quais horários estão ocupados.
export function observarAgendamentosDoPeriodo(dataInicial, dataFinal, aoMudar, aoFalhar) {
  const consulta = query(agendamentos, where("data", ">=", dataInicial), where("data", "<=", dataFinal));
  return onSnapshot(consulta, resultado => aoMudar(paraLista(resultado)), aoFalhar);
}

// Agendamentos de uma cliente, encontrados pelo telefone que ela informou.
export function observarAgendamentosDoTelefone(telefone, aoMudar, aoFalhar) {
  const consulta = query(agendamentos, where("clienteTelefone", "==", telefone));
  return onSnapshot(consulta, resultado => aoMudar(paraLista(resultado)), aoFalhar);
}

// ---------- Gravações ----------

// Busca, direto no banco, os horários livres de um dia (consulta feita na hora).
export async function buscarHorariosLivres(data, duracao, expediente, ignorarId = null) {
  const doDia = paraLista(await getDocs(query(agendamentos, where("data", "==", data))));
  return calcularHorariosLivres(data, expediente, duracao, doDia, ignorarId);
}

// Confere se o horário continua livre no momento de gravar.
async function garantirHorarioLivre(data, horario, duracao, expediente, ignorarId = null) {
  const livres = await buscarHorariosLivres(data, duracao, expediente, ignorarId);
  if (!livres.includes(horario)) throw new Error(HORARIO_OCUPADO);
}

// Cria o agendamento feito pela cliente. Ele nasce "pendente":
// a profissional confirma (ou recusa) pelo app.
export async function criarAgendamento({ nome, telefone, servico, data, horario }, expediente) {
  await garantirHorarioLivre(data, horario, servico.duracao, expediente);

  const novo = {
    clienteNome: nome,
    clienteTelefone: telefone,
    servicoId: servico.id,
    servico: servico.nome,
    preco: servico.preco,
    duracao: servico.duracao,
    data,
    horario,
    horarioFim: calcularFim(horario, servico.duracao),
    status: "pendente",
    origem: "site",
    criadoEm: new Date().toISOString()
  };
  const documento = await addDoc(agendamentos, novo);
  return { id: documento.id, ...novo };
}

// Troca o dia e o horário. Volta a ficar "pendente" para a profissional confirmar de novo.
export async function reagendar(agendamento, data, horario, expediente) {
  await garantirHorarioLivre(data, horario, agendamento.duracao, expediente, agendamento.id);
  await updateDoc(doc(agendamentos, agendamento.id), {
    data,
    horario,
    horarioFim: calcularFim(horario, agendamento.duracao),
    status: "pendente"
  });
}

// Cancelar libera o horário: agendamentos cancelados não contam como ocupados.
export async function cancelarAgendamento(id) {
  await updateDoc(doc(agendamentos, id), { status: "cancelado" });
}
