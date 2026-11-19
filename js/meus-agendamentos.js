// Seção "Meus agendamentos": a cliente informa o telefone e acompanha seus horários.
// A lista é em tempo real: quando a profissional confirma pelo app, o status muda aqui sozinho.
import {
  HORARIO_OCUPADO, buscarHorariosLivres, cancelarAgendamento,
  observarAgendamentosDoTelefone, reagendar
} from "./banco.js";
import { dados } from "./estado.js";
import {
  $, $$, chaveDaData, dataPorExtenso, dinheiro, escaparHtml, formatarCampoTelefone,
  mostrarAviso, somenteNumeros, telefoneValido
} from "./utilitarios.js";

// Texto e estilo (classe do CSS) de cada status.
const STATUS = {
  pendente: { texto: "Aguardando confirmação", classe: "is-pending" },
  confirmado: { texto: "Confirmado", classe: "is-confirmed" },
  cancelado: { texto: "Cancelado", classe: "is-canceled" }
};

let agendamentos = []; // agendamentos do telefone consultado
let pararDeObservar = null;

// Ordem da lista: primeiro os próximos, depois os que já passaram e por fim os cancelados.
function ordenar(lista) {
  const hoje = chaveDaData(new Date());
  const prioridade = a => (a.status === "cancelado" ? 2 : a.data >= hoje ? 0 : 1);
  return [...lista].sort((a, b) =>
    prioridade(a) - prioridade(b) || (a.data + a.horario).localeCompare(b.data + b.horario)
  );
}

function cartao(agendamento) {
  const status = STATUS[agendamento.status] || STATUS.pendente;
  const cancelado = agendamento.status === "cancelado";

  return `
    <article class="appointment-card" data-id="${escaparHtml(agendamento.id)}">
      <div class="appointment-card-top">
        <div><p class="form-kicker">${escaparHtml(agendamento.servico)}</p><h3>${escaparHtml(agendamento.clienteNome)}</h3></div>
        <span class="appointment-status ${status.classe}">${status.texto}</span>
      </div>
      <div class="appointment-details">
        <div><span>Data</span><strong>${escaparHtml(dataPorExtenso(agendamento.data))}</strong></div>
        <div><span>Horário</span><strong>${escaparHtml(agendamento.horario)} às ${escaparHtml(agendamento.horarioFim)}</strong></div>
        <div><span>Duração</span><strong>${Number(agendamento.duracao)} minutos</strong></div>
        <div><span>Valor</span><strong>${dinheiro(agendamento.preco)}</strong></div>
      </div>
      ${cancelado ? "" : `
        <div class="appointment-actions">
          <button type="button" class="button button-ghost" data-abrir-reagendamento>Reagendar</button>
          <button type="button" class="button button-ghost" data-cancelar>Cancelar agendamento</button>
        </div>
        <div class="reschedule-editor" data-editor hidden>
          <div class="field">
            <label>Escolha uma nova data</label>
            <input type="date" data-nova-data min="${chaveDaData(new Date())}">
          </div>
          <div class="reschedule-slots" data-novos-horarios></div>
          <div class="form-actions end">
            <button type="button" class="button button-primary" data-salvar-reagendamento disabled>Confirmar alteração</button>
          </div>
        </div>`}
    </article>`;
}

function renderizar() {
  const resultados = $("#bookingResults");

  // Não redesenha enquanto a cliente está escolhendo uma nova data, para não fechar o editor.
  if ($("[data-editor]:not([hidden])", resultados)) return;

  resultados.innerHTML = agendamentos.length === 0
    ? '<p class="empty-state lookup-empty">Nenhum agendamento foi encontrado para este número.</p>'
    : ordenar(agendamentos).map(cartao).join("");
}

// Começa a acompanhar os agendamentos de um telefone.
export function consultar(telefoneDigitado) {
  const telefone = somenteNumeros(telefoneDigitado);
  if (!telefoneValido(telefone)) {
    mostrarAviso("Informe um telefone válido com DDD.");
    $("#lookupPhone").focus();
    return;
  }

  if (pararDeObservar) pararDeObservar();
  $("#bookingResults").innerHTML = '<p class="empty-state lookup-empty">Consultando seus agendamentos...</p>';

  pararDeObservar = observarAgendamentosDoTelefone(telefone, lista => {
    agendamentos = lista;
    renderizar();
  }, () => {
    $("#bookingResults").innerHTML = '<p class="empty-state lookup-empty">Não foi possível consultar agora. Tente novamente.</p>';
  });
}

// Mostra a seção. Se vier um telefone, já preenche e consulta.
export function abrirMeusAgendamentos(telefone = "") {
  const secao = $("#meus-agendamentos");
  secao.hidden = false;
  secao.scrollIntoView({ behavior: "smooth", block: "start" });

  const campo = $("#lookupPhone");
  if (telefone) {
    campo.value = telefone;
    formatarCampoTelefone(campo);
    consultar(telefone);
  } else {
    campo.focus({ preventScroll: true });
  }
}

// ---------- Reagendar e cancelar ----------

const agendamentoDoCartao = card => agendamentos.find(a => a.id === card.dataset.id);

// Mostra os horários livres da nova data escolhida.
async function mostrarNovosHorarios(card) {
  const data = $("[data-nova-data]", card).value;
  const lista = $("[data-novos-horarios]", card);
  $("[data-salvar-reagendamento]", card).disabled = true;
  card.dataset.horarioEscolhido = "";
  if (!data) return (lista.innerHTML = "");

  lista.innerHTML = '<p class="empty-state">Carregando horários...</p>';
  try {
    const agendamento = agendamentoDoCartao(card);
    const livres = await buscarHorariosLivres(data, agendamento.duracao, dados.expediente, agendamento.id);
    lista.innerHTML = livres.length === 0
      ? '<p class="empty-state">Não há horários disponíveis nesta data. Escolha outro dia.</p>'
      : livres.map(horario => `<button type="button" class="time-slot" data-novo-horario="${horario}">${horario}</button>`).join("");
  } catch {
    lista.innerHTML = '<p class="empty-state">Não foi possível carregar os horários.</p>';
  }
}

async function salvarReagendamento(card) {
  const data = $("[data-nova-data]", card).value;
  const horario = card.dataset.horarioEscolhido;
  const botao = $("[data-salvar-reagendamento]", card);
  botao.disabled = true;

  try {
    await reagendar(agendamentoDoCartao(card), data, horario, dados.expediente);
    $("[data-editor]", card).hidden = true; // fecha o editor para a lista poder se atualizar
    renderizar();
    mostrarAviso("Agendamento alterado. Aguarde a nova confirmação.");
  } catch (erro) {
    mostrarAviso(erro.message === HORARIO_OCUPADO ? HORARIO_OCUPADO : "Não foi possível alterar o agendamento.");
    await mostrarNovosHorarios(card);
  }
}

async function cancelar(card) {
  if (!window.confirm("Tem certeza de que deseja cancelar este agendamento?")) return;
  try {
    await cancelarAgendamento(card.dataset.id);
    mostrarAviso("Agendamento cancelado.");
  } catch {
    mostrarAviso("Não foi possível cancelar o agendamento.");
  }
}

// ---------- Liga os botões da página às funções acima ----------

export function iniciarMeusAgendamentos() {
  $("#openMyBookings").addEventListener("click", () => abrirMeusAgendamentos());
  $("#lookupPhone").addEventListener("input", evento => formatarCampoTelefone(evento.target));
  $("#lookupForm").addEventListener("submit", evento => {
    evento.preventDefault();
    consultar($("#lookupPhone").value);
  });

  const resultados = $("#bookingResults");

  resultados.addEventListener("change", evento => {
    if (evento.target.matches("[data-nova-data]")) mostrarNovosHorarios(evento.target.closest(".appointment-card"));
  });

  resultados.addEventListener("click", evento => {
    const card = evento.target.closest(".appointment-card");
    if (!card) return;
    const alvo = seletor => evento.target.closest(seletor);

    if (alvo("[data-abrir-reagendamento]")) {
      const editor = $("[data-editor]", card);
      editor.hidden = !editor.hidden;
      if (editor.hidden) renderizar(); // ao fechar, aproveita para atualizar a lista
      return;
    }

    const novoHorario = alvo("[data-novo-horario]");
    if (novoHorario) {
      $$("[data-novo-horario]", card).forEach(botao => botao.classList.toggle("selected", botao === novoHorario));
      // Guarda a escolha no cartão com outro nome ("horarioEscolhido"). Se usássemos
      // "novoHorario", o cartão inteiro passaria a ter o atributo data-novo-horario
      // e qualquer clique dentro dele seria confundido com a escolha de um horário.
      card.dataset.horarioEscolhido = novoHorario.dataset.novoHorario;
      $("[data-salvar-reagendamento]", card).disabled = false;
      return;
    }

    if (alvo("[data-salvar-reagendamento]")) return salvarReagendamento(card);
    if (alvo("[data-cancelar]")) return cancelar(card);
  });
}
