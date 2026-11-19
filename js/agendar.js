// Passo a passo de agendamento (seção "Vamos agendar?").
// Etapas: 1 dados da cliente > 2 procedimento > 3 data e hora > 4 revisão > 5 sucesso.
import { HORARIO_OCUPADO, criarAgendamento, observarAgendamentosDoPeriodo } from "./banco.js";
import { CONTATO } from "./configuracao.js";
import { dados } from "./estado.js";
import { calcularFim, calcularHorariosLivres } from "./horarios.js";
import {
  $, $$, chaveDaData, dataPorExtenso, dinheiro, escaparHtml, formatarCampoTelefone,
  montarResumo, mostrarAviso, paraData, somenteNumeros, telefoneValido
} from "./utilitarios.js";

// Tudo o que a cliente já escolheu até agora.
const escolha = {
  etapa: 1,
  nome: "",
  telefone: "",
  servicoId: null,
  data: null, // "2026-11-16"
  horario: null, // "14:30"
  mes: primeiroDiaDoMes(new Date()) // mês mostrado no calendário
};

let agendamentosDoMes = []; // usados para saber quais horários já estão ocupados
let pararDeObservarMes = null;

function primeiroDiaDoMes(data) {
  return new Date(data.getFullYear(), data.getMonth(), 1);
}

const servicoEscolhido = () => dados.servicos.find(servico => servico.id === escolha.servicoId);

// ---------- Procedimentos ----------

// Desenha os procedimentos na vitrine do site e na etapa 2 do agendamento.
export function renderizarServicos() {
  const { servicos } = dados;

  $("#serviceGrid").innerHTML = servicos.length === 0
    ? '<p class="empty-state">Em breve, novos procedimentos por aqui.</p>'
    : servicos.map(servico => `
      <article class="service-card">
        <div class="service-image" ${servico.imagem ? `style="background-image:url('${escaparHtml(servico.imagem)}')"` : ""}></div>
        <div class="service-content">
          <h3>${escaparHtml(servico.nome)}</h3>
          <p>${escaparHtml(servico.descricao)}</p>
          <div class="service-meta"><span>${Number(servico.duracao)} min</span><span>${dinheiro(servico.preco)}</span></div>
          <button type="button" data-agendar-servico="${escaparHtml(servico.id)}">AGENDAR ESTE PROCEDIMENTO →</button>
        </div>
      </article>`).join("");

  $("#bookingServices").innerHTML = servicos.map(servico => `
    <button type="button" class="booking-service ${servico.id === escolha.servicoId ? "selected" : ""}"
            data-escolher-servico="${escaparHtml(servico.id)}">
      <span><strong>${escaparHtml(servico.nome)}</strong><small>${Number(servico.duracao)} min · ${escaparHtml(servico.descricao)}</small></span>
      <b>${dinheiro(servico.preco)}</b><i class="radio-dot"></i>
    </button>`).join("");
}

function escolherServico(id) {
  if (escolha.servicoId !== id) {
    // A duração muda de um serviço para outro, então o horário precisa ser escolhido de novo.
    escolha.data = null;
    escolha.horario = null;
  }
  escolha.servicoId = id;
  $$(".booking-service").forEach(botao =>
    botao.classList.toggle("selected", botao.dataset.escolherServico === id)
  );
}

// ---------- Calendário e horários ----------

// Horários livres de um dia, considerando o expediente e o que já está marcado.
function horariosLivresEm(dataISO) {
  const servico = servicoEscolhido();
  if (!servico) return [];
  return calcularHorariosLivres(dataISO, dados.expediente, servico.duracao, agendamentosDoMes);
}

// Passa a acompanhar, em tempo real, os agendamentos do mês mostrado no calendário.
// Se outra cliente reservar um horário agora, ele some da tela na hora.
function observarMes() {
  if (pararDeObservarMes) pararDeObservarMes();

  const ano = escolha.mes.getFullYear();
  const mes = escolha.mes.getMonth();
  const primeiroDia = chaveDaData(new Date(ano, mes, 1));
  const ultimoDia = chaveDaData(new Date(ano, mes + 1, 0));

  pararDeObservarMes = observarAgendamentosDoPeriodo(primeiroDia, ultimoDia, lista => {
    agendamentosDoMes = lista;
    atualizarDisponibilidade();
  }, () => mostrarAviso("Não foi possível carregar os horários. Verifique sua conexão."));
}

// Redesenha calendário e horários. Chamado sempre que algo muda no banco.
export function atualizarDisponibilidade() {
  if (escolha.etapa !== 3) return;

  // Se o horário escolhido foi ocupado enquanto a cliente decidia, avisa e limpa a escolha.
  if (escolha.data && escolha.horario && !horariosLivresEm(escolha.data).includes(escolha.horario)) {
    escolha.horario = null;
    mostrarAviso(HORARIO_OCUPADO);
  }
  renderizarCalendario();
  renderizarHorarios();
}

function renderizarCalendario() {
  const ano = escolha.mes.getFullYear();
  const mes = escolha.mes.getMonth();
  const hoje = new Date();

  $("#monthLabel").textContent = escolha.mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  // Não deixa voltar para meses que já passaram.
  const noMesAtual = ano === hoje.getFullYear() && mes === hoje.getMonth();
  $("#prevMonth").disabled = noMesAtual;
  $("#prevMonth").style.opacity = noMesAtual ? ".3" : "1";

  const espacosAntes = new Date(ano, mes, 1).getDay(); // em que dia da semana o mês começa
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();

  let html = "<span></span>".repeat(espacosAntes);
  for (let dia = 1; dia <= diasNoMes; dia++) {
    const dataISO = chaveDaData(new Date(ano, mes, dia));
    const disponivel = horariosLivresEm(dataISO).length > 0;
    const selecionado = dataISO === escolha.data;
    const classe = selecionado ? "selected-day" : disponivel ? "available-day" : "";
    html += `<button type="button" data-dia="${dataISO}" class="${classe}" ${disponivel ? "" : "disabled"}
      aria-label="${dia}, ${disponivel ? "disponível" : "indisponível"}">${dia}</button>`;
  }
  $("#calendarDays").innerHTML = html;
}

function renderizarHorarios() {
  const subtitulo = $("#timeSubtitle");
  const lista = $("#timeSlots");

  if (!escolha.data) {
    subtitulo.textContent = "Selecione uma data no calendário.";
    lista.innerHTML = '<p class="empty-state">Escolha uma data para visualizar os horários.</p>';
    return;
  }

  subtitulo.textContent = paraData(escolha.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
  const livres = horariosLivresEm(escolha.data);

  lista.innerHTML = livres.length === 0
    ? '<p class="empty-state">Não há horários disponíveis nesta data. Escolha outro dia.</p>'
    : livres.map(horario => `
        <button type="button" class="time-slot ${horario === escolha.horario ? "selected" : ""}"
                data-horario="${horario}">${horario}</button>`).join("");
}

function mudarMes(diferenca) {
  escolha.mes = new Date(escolha.mes.getFullYear(), escolha.mes.getMonth() + diferenca, 1);
  agendamentosDoMes = [];
  observarMes();
}

// ---------- Etapas ----------

function linhasDoResumo(agendamento) {
  return [
    ["Cliente", agendamento.clienteNome],
    ["Procedimento", agendamento.servico],
    ["Data", dataPorExtenso(agendamento.data)],
    ["Horário", `${agendamento.horario} às ${agendamento.horarioFim}`],
    ["Duração", `${agendamento.duracao} minutos`],
    ["Valor", dinheiro(agendamento.preco)]
  ];
}

function irParaEtapa(numero) {
  escolha.etapa = numero;

  $$(".booking-step").forEach(secao =>
    secao.classList.toggle("active", Number(secao.dataset.step) === numero)
  );
  $$(".step").forEach(indicador => {
    const etapa = Number(indicador.dataset.stepIndicator);
    indicador.classList.toggle("active", etapa === numero);
    indicador.classList.toggle("done", etapa < numero);
  });

  if (numero === 3) {
    observarMes();
    atualizarDisponibilidade();
  }
  if (numero === 4) {
    const servico = servicoEscolhido();
    $("#bookingSummary").innerHTML = montarResumo(linhasDoResumo({
      clienteNome: escolha.nome,
      servico: servico.nome,
      data: escolha.data,
      horario: escolha.horario,
      horarioFim: calcularFim(escolha.horario, servico.duracao),
      duracao: servico.duracao,
      preco: servico.preco
    }));
  }
}

// Confere se a etapa atual está preenchida antes de avançar.
function etapaValida() {
  if (escolha.etapa === 1) {
    escolha.nome = $("#clientName").value.trim();
    escolha.telefone = somenteNumeros($("#clientPhone").value);
    if (escolha.nome.length < 3) {
      mostrarAviso("Informe seu nome completo.");
      $("#clientName").focus();
      return false;
    }
    if (!telefoneValido(escolha.telefone)) {
      mostrarAviso("Informe um telefone com DDD.");
      $("#clientPhone").focus();
      return false;
    }
  }
  if (escolha.etapa === 2 && !servicoEscolhido()) {
    mostrarAviso("Selecione um procedimento para continuar.");
    return false;
  }
  if (escolha.etapa === 3) {
    if (!escolha.data) { mostrarAviso("Selecione uma data."); return false; }
    if (!escolha.horario) { mostrarAviso("Selecione um horário disponível."); return false; }
  }
  return true;
}

// Grava o agendamento no Firebase. A partir daqui ele aparece no app da profissional.
async function confirmarAgendamento(evento) {
  evento.preventDefault();
  const botao = $("#confirmButton");
  botao.disabled = true;

  try {
    const agendamento = await criarAgendamento({
      nome: escolha.nome,
      telefone: escolha.telefone,
      servico: servicoEscolhido(),
      data: escolha.data,
      horario: escolha.horario
    }, dados.expediente);

    $("#successSummary").innerHTML = montarResumo(linhasDoResumo(agendamento));

    const mensagem = `Olá! Fiz um pedido de agendamento pelo site. Nome: ${agendamento.clienteNome}. ` +
      `Procedimento: ${agendamento.servico}. Data: ${dataPorExtenso(agendamento.data)}. Horário: ${agendamento.horario}.`;
    $("#whatsappLink").href = `https://wa.me/${CONTATO.whatsapp}?text=${encodeURIComponent(mensagem)}`;

    irParaEtapa(5);
  } catch (erro) {
    if (erro.message === HORARIO_OCUPADO) {
      mostrarAviso(HORARIO_OCUPADO);
      escolha.horario = null;
      irParaEtapa(3);
    } else {
      console.error(erro);
      mostrarAviso("Não foi possível concluir o agendamento. Tente novamente.");
    }
  } finally {
    botao.disabled = false;
  }
}

function reiniciar() {
  $("#bookingForm").reset();
  Object.assign(escolha, {
    etapa: 1, nome: "", telefone: "", servicoId: null, data: null, horario: null,
    mes: primeiroDiaDoMes(new Date())
  });
  renderizarServicos();
  irParaEtapa(1);
  window.location.hash = "inicio";
}

// Telefone usado no agendamento que acabou de ser feito (para o atalho "acompanhar").
export const telefoneDaCliente = () => escolha.telefone;

// ---------- Liga os botões da página às funções acima ----------

export function iniciarAgendamento() {
  $("#clientPhone").addEventListener("input", evento => formatarCampoTelefone(evento.target));
  $("#bookingForm").addEventListener("submit", confirmarAgendamento);
  $("#newBooking").addEventListener("click", reiniciar);
  $("#prevMonth").addEventListener("click", () => mudarMes(-1));
  $("#nextMonth").addEventListener("click", () => mudarMes(1));

  // Um único "ouvinte" de cliques cuida dos botões criados dinamicamente.
  document.addEventListener("click", evento => {
    const alvo = seletor => evento.target.closest(seletor);

    const agendarServico = alvo("[data-agendar-servico]"); // botão na vitrine de procedimentos
    if (agendarServico) {
      escolherServico(agendarServico.dataset.agendarServico);
      irParaEtapa(1);
      $("#agendar").scrollIntoView({ behavior: "smooth" });
      $("#clientName").focus({ preventScroll: true });
      return;
    }

    const opcaoDeServico = alvo("[data-escolher-servico]");
    if (opcaoDeServico) return escolherServico(opcaoDeServico.dataset.escolherServico);

    const dia = alvo("[data-dia]");
    if (dia) {
      escolha.data = dia.dataset.dia;
      escolha.horario = null;
      return atualizarDisponibilidade();
    }

    const horario = alvo("[data-horario]");
    if (horario) {
      escolha.horario = horario.dataset.horario;
      return renderizarHorarios();
    }

    if (alvo("[data-next]") && etapaValida()) return irParaEtapa(escolha.etapa + 1);
    if (alvo("[data-prev]")) return irParaEtapa(Math.max(1, escolha.etapa - 1));
  });

  irParaEtapa(1);
}
