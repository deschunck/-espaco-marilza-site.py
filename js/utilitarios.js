// Pequenas funções de apoio usadas em todo o site.

// Atalhos para encontrar elementos na página.
export const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
export const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

// 35 -> "R$ 35,00"
export const dinheiro = valor =>
  Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Date -> "2026-11-16" (formato em que as datas são guardadas no Firebase)
export function chaveDaData(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// "2026-11-16" -> Date
export function paraData(chave) {
  const [ano, mes, dia] = chave.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

// "2026-11-16" -> "segunda-feira, 16 de novembro de 2026"
export const dataPorExtenso = chave =>
  paraData(chave).toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  });

// "(37) 99876-5432" -> "37998765432"
export const somenteNumeros = valor => String(valor || "").replace(/\D/g, "");

// Um telefone válido tem DDD + número (10 ou 11 dígitos).
export const telefoneValido = numeros => numeros.length >= 10 && numeros.length <= 11;

// Formata o telefone enquanto a pessoa digita: (37) 99876-5432
export function formatarCampoTelefone(campo) {
  let valor = somenteNumeros(campo.value).slice(0, 11);
  if (valor.length > 10) valor = valor.replace(/^(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3");
  else if (valor.length > 6) valor = valor.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
  else if (valor.length > 2) valor = valor.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
  campo.value = valor;
}

// Protege o site: impede que um texto digitado pela cliente vire código HTML.
export const escaparHtml = valor =>
  String(valor ?? "").replace(/[&<>"']/g, letra => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[letra]
  ));

// Mostra um aviso rápido no rodapé da tela, que some sozinho.
let temporizadorDoAviso;
export function mostrarAviso(mensagem) {
  const elemento = $("#toast");
  elemento.textContent = mensagem;
  elemento.classList.add("show");
  clearTimeout(temporizadorDoAviso);
  temporizadorDoAviso = setTimeout(() => elemento.classList.remove("show"), 3500);
}

// Monta as linhas "rótulo: valor" usadas nos resumos de agendamento.
export function montarResumo(linhas) {
  return linhas.map(([rotulo, valor]) => `
    <div class="summary-row"><span>${escaparHtml(rotulo)}</span><strong>${escaparHtml(valor)}</strong></div>
  `).join("");
}
