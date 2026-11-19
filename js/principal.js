/*
  ESPAÇO MARILZA CARICATTI — ponto de partida do site.

  Como o código está organizado (pasta js/):
    principal.js          este arquivo: liga tudo quando a página abre
    agendar.js            passo a passo de agendamento
    meus-agendamentos.js  consulta pelo telefone, reagendar e cancelar
    banco.js              tudo o que lê e grava no Firebase
    horarios.js           regra que calcula os horários livres
    estado.js             dados do Firebase compartilhados entre os arquivos
    utilitarios.js        funções de apoio (datas, dinheiro, avisos)
    configuracao.js       WhatsApp, Instagram e endereço do espaço
    firebase-config.js    chaves do seu projeto Firebase
*/
import { atualizarDisponibilidade, iniciarAgendamento, renderizarServicos, telefoneDaCliente } from "./agendar.js";
import { observarExpediente, observarServicos } from "./banco.js";
import { CONTATO } from "./configuracao.js";
import { dados } from "./estado.js";
import { firebaseConfigurado } from "./firebase-config.js";
import { abrirMeusAgendamentos, iniciarMeusAgendamentos } from "./meus-agendamentos.js";
import { $, $$, mostrarAviso } from "./utilitarios.js";

// Menu do celular (botão ☰).
function iniciarMenu() {
  const menu = $("#mainNav");
  const botao = $("#menuToggle");
  const fechar = () => {
    menu.classList.remove("open");
    botao.setAttribute("aria-expanded", "false");
  };

  botao.addEventListener("click", () => {
    const aberto = menu.classList.toggle("open");
    botao.setAttribute("aria-expanded", String(aberto));
  });
  $$("a, button", menu).forEach(item => item.addEventListener("click", fechar));
}

// Preenche os links de contato com os dados do arquivo configuracao.js.
function preencherContato() {
  const mensagem = encodeURIComponent("Olá! Vim pelo site do Espaço Marilza Caricatti.");
  const linkDoWhatsApp = `https://wa.me/${CONTATO.whatsapp}?text=${mensagem}`;

  $("#floatingWhatsapp").href = linkDoWhatsApp;
  $("#footerWhatsapp").href = linkDoWhatsApp;
  $("#instagramLink").href = CONTATO.instagram || "#";
  $("#addressText").textContent = CONTATO.endereco;

  // Mini mapa do rodapé. O endereço vai dentro do link, por isso precisa ser "codificado".
  const enderecoNoLink = encodeURIComponent(CONTATO.enderecoNoMapa);
  const linkDoMapa = `https://www.google.com/maps/search/?api=1&query=${enderecoNoLink}`;
  $("#locationMap").src = `https://www.google.com/maps?q=${enderecoNoLink}&output=embed`;
  $("#openInMaps").href = linkDoMapa; // abre o Google Maps em outra aba
  $("#addressText").href = linkDoMapa;
  $("#year").textContent = new Date().getFullYear();
}

// Liga o site ao Firebase e mantém serviços e horários sempre atualizados.
function conectarAoBanco() {
  if (!firebaseConfigurado) {
    $("#setupNotice").hidden = false; // aviso explicando que falta configurar o Firebase
    return;
  }

  const avisarErro = () => mostrarAviso("Não foi possível conectar ao banco de dados.");

  observarServicos(servicos => {
    dados.servicos = servicos;
    renderizarServicos();
    atualizarDisponibilidade();
  }, avisarErro);

  observarExpediente(expediente => {
    dados.expediente = expediente;
    atualizarDisponibilidade();
  }, avisarErro);
}

iniciarMenu();
preencherContato();
iniciarAgendamento();
iniciarMeusAgendamentos();
conectarAoBanco();

// Atalho na tela de sucesso: abre "Meus agendamentos" já com o telefone da cliente.
$("#trackBooking").addEventListener("click", () => abrirMeusAgendamentos(telefoneDaCliente()));
