/*
  ESPAÇO MARILZA CARICATTI
  A interface conversa com a API do servidor. Os agendamentos são gravados
  no arquivo data/agendamentos.json; este arquivo JavaScript não guarda reservas.
*/
const CONFIG = {
  whatsapp: "", // Exemplo: "5537999999999" (55 + DDD + número, somente números)
  instagram: "", // Exemplo: "https://instagram.com/seuperfil"
  address: "Endereço a configurar"
};

let SERVICES = [];
const state = {
  step: 1,
  serviceId: null,
  date: null,
  time: null,
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  clientName: "",
  clientPhone: "",
  lookupPhone: "",
  calendarRequest: 0,
  timesRequest: 0
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = value => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseDate = key => { const [year, month, day] = key.split("-").map(Number); return new Date(year, month - 1, day); };
const timeToMinutes = value => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; };
const minutesToTime = value => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const getService = () => SERVICES.find(service => service.id === state.serviceId);
const normalizePhone = value => String(value || "").replace(/\D/g, "");
const formatDate = key => parseDate(key).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error("Não foi possível interpretar a resposta do servidor."); }
  if (!response.ok) throw new Error(payload.erro || "Não foi possível concluir a solicitação.");
  return payload;
}

const showToast = message => {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  setTimeout(() => element.classList.remove("show"), 3000);
};

function renderServices() {
  $("#serviceGrid").innerHTML = SERVICES.map(service => `
    <article class="service-card">
      <div class="service-image" style="background-image:url('${escapeHtml(service.imagem)}')"></div>
      <div class="service-content"><h3>${escapeHtml(service.nome)}</h3><p>${escapeHtml(service.descricao)}</p>
        <div class="service-meta"><span>${Number(service.duracao)} min</span><span>${money(service.preco)}</span></div>
        <button type="button" data-book-service="${escapeHtml(service.id)}">AGENDAR ESTE PROCEDIMENTO →</button>
      </div>
    </article>`).join("");

  $("#bookingServices").innerHTML = SERVICES.map(service => `
    <button type="button" class="booking-service" data-select-service="${escapeHtml(service.id)}">
      <span><strong>${escapeHtml(service.nome)}</strong><small>${Number(service.duracao)} min · ${escapeHtml(service.descricao)}</small></span>
      <b>${money(service.preco)}</b><i class="radio-dot"></i>
    </button>`).join("");
}

async function requestAvailableSlots(day, procedureId, ignoreId = "") {
  const query = new URLSearchParams({ data: day, procedimentoId: procedureId });
  if (ignoreId) query.set("ignorarId", ignoreId);
  const result = await api(`/api/horarios-disponiveis?${query.toString()}`);
  return result.horarios || [];
}

async function renderCalendar() {
  if (!getService()) return;
  const request = ++state.calendarRequest;
  const year = state.month.getFullYear();
  const month = state.month.getMonth();
  $("#monthLabel").textContent = state.month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let html = "";
  for (let index = 0; index < firstDay; index++) html += "<span></span>";
  for (let day = 1; day <= daysInMonth; day++) {
    const date = dateKey(new Date(year, month, day));
    const selected = state.date === date;
    html += `<button type="button" data-date="${date}" class="${selected ? "selected-day" : ""}" disabled>${day}</button>`;
  }
  $("#calendarDays").innerHTML = html;
  $("#prevMonth").disabled = year === new Date().getFullYear() && month === new Date().getMonth();
  $("#prevMonth").style.opacity = $("#prevMonth").disabled ? ".3" : "1";
  $("#timeSubtitle").textContent = "Carregando horários disponíveis...";

  const dates = Array.from({ length: daysInMonth }, (_, index) => dateKey(new Date(year, month, index + 1)));
  const results = await Promise.all(dates.map(async day => {
    try { return [day, await requestAvailableSlots(day, state.serviceId)]; }
    catch { return [day, []]; }
  }));
  if (request !== state.calendarRequest) return;

  const available = new Map(results);
  for (const button of $$("#calendarDays [data-date]")) {
    const slots = available.get(button.dataset.date) || [];
    const enabled = slots.length > 0;
    button.disabled = !enabled;
    button.classList.toggle("available-day", enabled && button.dataset.date !== state.date);
    button.classList.toggle("selected-day", button.dataset.date === state.date);
    button.setAttribute("aria-label", `${Number(button.textContent)}${enabled ? ", disponível" : ", indisponível"}`);
  }
  await renderTimes();
}

async function renderTimes() {
  const request = ++state.timesRequest;
  const title = $("#timeTitle");
  const subtitle = $("#timeSubtitle");
  const container = $("#timeSlots");
  if (!state.date) {
    title.textContent = "Horários disponíveis";
    subtitle.textContent = "Selecione uma data no calendário.";
    container.innerHTML = '<p class="empty-state">Escolha uma data para visualizar os horários.</p>';
    return;
  }
  title.textContent = "Horários disponíveis";
  subtitle.textContent = parseDate(state.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
  container.innerHTML = '<p class="empty-state">Carregando horários...</p>';
  try {
    const slots = await requestAvailableSlots(state.date, state.serviceId);
    if (request !== state.timesRequest) return;
    if (!slots.length) {
      container.innerHTML = '<p class="empty-state">Não há horários disponíveis nesta data. Escolha outro dia.</p>';
      return;
    }
    container.innerHTML = slots.map(time => `<button type="button" class="time-slot ${state.time === time ? "selected" : ""}" data-time="${time}">${time}</button>`).join("");
  } catch (error) {
    if (request === state.timesRequest) container.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

function renderSummary(target) {
  const service = getService();
  if (!service || !state.date || !state.time) return;
  const end = minutesToTime(timeToMinutes(state.time) + Number(service.duracao));
  $(target).innerHTML = [
    ["Cliente", state.clientName], ["Telefone", state.clientPhone], ["Procedimento", service.nome],
    ["Data", formatDate(state.date)], ["Horário", `${state.time} às ${end}`],
    ["Duração", `${service.duracao} minutos`], ["Valor", money(service.preco)]
  ].map(([label, value]) => `<div class="summary-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
}

function updateSteps() {
  $$(".booking-step").forEach(element => element.classList.toggle("active", Number(element.dataset.step) === state.step));
  $$(".step").forEach(element => {
    const number = Number(element.dataset.stepIndicator);
    element.classList.toggle("active", number === state.step);
    element.classList.toggle("done", number < state.step);
  });
  if (state.step === 3) renderCalendar();
  if (state.step === 4) renderSummary("#bookingSummary");
}

function goToStep(number) { state.step = number; updateSteps(); }

function validateStep() {
  if (state.step === 1) {
    state.clientName = $("#clientName").value.trim();
    state.clientPhone = normalizePhone($("#clientPhone").value);
    if (state.clientName.length < 3) {
      showToast("Informe seu nome completo.");
      $("#clientName").focus();
      return false;
    }
    if (state.clientPhone.length < 10 || state.clientPhone.length > 13) {
      showToast("Informe um telefone com DDD.");
      $("#clientPhone").focus();
      return false;
    }
  }
  if (state.step === 2 && !state.serviceId) {
    showToast("Selecione um procedimento para continuar.");
    return false;
  }
  if (state.step === 3) {
    if (!state.date) { showToast("Selecione uma data."); return false; }
    if (!state.time) { showToast("Selecione um horário disponível."); return false; }
  }
  return true;
}

async function confirmBooking(event) {
  event.preventDefault();
  if (!validateStep()) return;
  const button = $("#confirmButton");
  button.disabled = true;
  try {
    // O servidor confere novamente a disponibilidade antes de gravar no JSON.
    const booking = await api("/api/agendamentos", {
      method: "POST",
      body: JSON.stringify({
        cliente: { nome: state.clientName, telefone: state.clientPhone },
        procedimentoId: state.serviceId,
        data: state.date,
        horarioInicio: state.time
      })
    });
    const service = booking.procedimento;
    state.clientName = booking.cliente.nome;
    state.clientPhone = booking.cliente.telefone;
    $("#successSummary").innerHTML = [
      ["Cliente", booking.cliente.nome], ["Telefone", booking.cliente.telefone], ["Procedimento", service.nome],
      ["Data", formatDate(booking.data)], ["Horário", `${booking.horarioInicio} às ${booking.horarioFim}`],
      ["Duração", `${service.duracao} minutos`], ["Valor", money(service.preco)]
    ].map(([label, value]) => `<div class="summary-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");

    const whatsapp = normalizePhone(CONFIG.whatsapp);
    const message = encodeURIComponent(`Olá! Meu agendamento no Espaço Marilza Caricatti foi realizado. Nome: ${booking.cliente.nome}. Procedimento: ${service.nome}. Data: ${formatDate(booking.data)}. Horário: ${booking.horarioInicio}.`);
    $("#whatsappLink").href = whatsapp ? `https://wa.me/${whatsapp}?text=${message}` : `https://wa.me/?text=${message}`;
    goToStep(5);
  } catch (error) {
    showToast(error.message);
    if (error.message.toLowerCase().includes("horário") || error.message.toLowerCase().includes("disponível")) {
      state.time = null;
      goToStep(3);
    }
  } finally {
    button.disabled = false;
  }
}

function resetBooking() {
  $("#bookingForm").reset();
  state.step = 1;
  state.serviceId = null;
  state.date = null;
  state.time = null;
  state.month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  $$(".booking-service").forEach(element => element.classList.remove("selected"));
  updateSteps();
  window.location.hash = "inicio";
}

function configureContact() {
  const whatsapp = normalizePhone(CONFIG.whatsapp);
  const whatsappUrl = whatsapp ? `https://wa.me/${whatsapp}` : "https://wa.me/";
  ["floatingWhatsapp", "footerWhatsapp"].forEach(id => $("#" + id).href = whatsappUrl);
  $("#instagramLink").href = CONFIG.instagram || "#";
  $("#addressText").textContent = CONFIG.address;
  $("#year").textContent = new Date().getFullYear();
}

function formatPhoneInput(input) {
  let value = normalizePhone(input.value).slice(0, 11);
  if (value.length > 10) value = value.replace(/^(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3");
  else if (value.length > 6) value = value.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
  else if (value.length > 2) value = value.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
  input.value = value;
}

function sortBookings(bookings) {
  const today = dateKey(new Date());
  const priority = booking => {
    if (booking.status === "cancelado") return 2;
    return booking.data >= today ? 0 : 1;
  };
  return [...bookings].sort((a, b) => priority(a) - priority(b)
    || a.data.localeCompare(b.data)
    || a.horarioInicio.localeCompare(b.horarioInicio));
}

function renderBookingCards(bookings) {
  const results = $("#bookingResults");
  if (!bookings.length) {
    results.innerHTML = '<p class="empty-state lookup-empty">Nenhum agendamento foi encontrado para este número.</p>';
    return;
  }
  results.innerHTML = sortBookings(bookings).map(booking => {
    const canceled = booking.status === "cancelado";
    const statusText = canceled ? "Cancelado" : "Confirmado";
    const service = booking.procedimento || {};
    return `
      <article class="appointment-card" data-booking-id="${escapeHtml(booking.id)}">
        <div class="appointment-card-top">
          <div><p class="form-kicker">${escapeHtml(service.nome || "Procedimento")}</p><h3>${escapeHtml(booking.cliente?.nome || "Cliente")}</h3></div>
          <span class="appointment-status ${canceled ? "is-canceled" : "is-confirmed"}">${statusText}</span>
        </div>
        <div class="appointment-details">
          <div><span>Data</span><strong>${escapeHtml(formatDate(booking.data))}</strong></div>
          <div><span>Horário</span><strong>${escapeHtml(booking.horarioInicio)} às ${escapeHtml(booking.horarioFim)}</strong></div>
          <div><span>Duração</span><strong>${Number(service.duracao || 0)} minutos</strong></div>
          <div><span>Valor</span><strong>${money(service.preco || 0)}</strong></div>
        </div>
        ${canceled ? "" : `
          <div class="appointment-actions">
            <button type="button" class="button button-ghost" data-reschedule>Reagendar</button>
            <button type="button" class="button button-ghost" data-cancel-booking>Cancelar agendamento</button>
          </div>
          <div class="reschedule-editor" data-reschedule-editor hidden>
            <div class="field">
              <label>Escolha uma nova data</label>
              <input type="date" data-new-date min="${dateKey(new Date())}">
            </div>
            <div class="form-actions end">
              <button type="button" class="button button-ghost" data-load-reschedule-slots>Ver horários disponíveis</button>
            </div>
            <div class="reschedule-slots" data-reschedule-slots></div>
            <div class="form-actions end">
              <button type="button" class="button button-primary" data-save-reschedule disabled>Confirmar alteração</button>
            </div>
          </div>`}
      </article>`;
  }).join("");
}

async function lookupBookings(phone) {
  const normalized = normalizePhone(phone);
  if (normalized.length < 10 || normalized.length > 13) {
    showToast("Informe um telefone válido com DDD.");
    $("#lookupPhone").focus();
    return;
  }
  state.lookupPhone = normalized;
  $("#bookingResults").innerHTML = '<p class="empty-state lookup-empty">Consultando seus agendamentos...</p>';
  try {
    const response = await api(`/api/agendamentos?telefone=${encodeURIComponent(normalized)}`);
    renderBookingCards(response.agendamentos || []);
  } catch (error) {
    $("#bookingResults").innerHTML = `<p class="empty-state lookup-empty">${escapeHtml(error.message)}</p>`;
  }
}

function openMyBookings() {
  const section = $("#meus-agendamentos");
  section.hidden = false;
  $("#mainNav").classList.remove("open");
  $("#menuToggle").setAttribute("aria-expanded", "false");
  window.location.hash = "meus-agendamentos";
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  $("#lookupPhone").focus({ preventScroll: true });
}

async function loadRescheduleSlots(card) {
  const dateInput = $("[data-new-date]", card);
  const slotsContainer = $("[data-reschedule-slots]", card);
  const saveButton = $("[data-save-reschedule]", card);
  const day = dateInput.value;
  saveButton.disabled = true;
  card.dataset.selectedTime = "";
  slotsContainer.innerHTML = "";
  if (!day) {
    showToast("Escolha uma data para consultar os horários.");
    dateInput.focus();
    return;
  }
  try {
    const bookingId = card.dataset.bookingId;
    const bookingResponse = await api(`/api/agendamentos/${encodeURIComponent(bookingId)}`);
    const slots = await requestAvailableSlots(day, bookingResponse.procedimento.id, bookingId);
    if (!slots.length) {
      slotsContainer.innerHTML = '<p class="empty-state">Não há horários disponíveis nesta data. Escolha outro dia.</p>';
      return;
    }
    slotsContainer.innerHTML = slots.map(time => `<button type="button" class="time-slot" data-reschedule-time="${time}">${time}</button>`).join("");
  } catch (error) {
    slotsContainer.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

async function saveReschedule(card) {
  const date = $("[data-new-date]", card).value;
  const time = card.dataset.selectedTime;
  if (!date || !time) {
    showToast("Escolha uma data e um novo horário.");
    return;
  }
  const button = $("[data-save-reschedule]", card);
  button.disabled = true;
  try {
    await api(`/api/agendamentos/${encodeURIComponent(card.dataset.bookingId)}`, {
      method: "PUT",
      body: JSON.stringify({ data: date, horarioInicio: time })
    });
    showToast("Agendamento alterado com sucesso.");
    await lookupBookings(state.lookupPhone);
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
    if (error.message.toLowerCase().includes("horário") || error.message.toLowerCase().includes("disponível")) {
      await loadRescheduleSlots(card);
    }
  }
}

async function cancelBooking(card) {
  if (!window.confirm("Tem certeza de que deseja cancelar este agendamento?")) return;
  try {
    await api(`/api/agendamentos/${encodeURIComponent(card.dataset.bookingId)}/cancelar`, { method: "PATCH" });
    showToast("Agendamento cancelado.");
    await lookupBookings(state.lookupPhone);
  } catch (error) {
    showToast(error.message);
  }
}

$("#menuToggle").addEventListener("click", () => {
  const nav = $("#mainNav");
  const open = nav.classList.toggle("open");
  $("#menuToggle").setAttribute("aria-expanded", String(open));
});
$$(".main-nav a").forEach(link => link.addEventListener("click", () => {
  $("#mainNav").classList.remove("open");
  $("#menuToggle").setAttribute("aria-expanded", "false");
}));
$("#openMyBookings").addEventListener("click", openMyBookings);
$("#lookupForm").addEventListener("submit", event => {
  event.preventDefault();
  lookupBookings($("#lookupPhone").value);
});
$("#clientPhone").addEventListener("input", event => formatPhoneInput(event.target));
$("#lookupPhone").addEventListener("input", event => formatPhoneInput(event.target));
$("#bookingForm").addEventListener("submit", confirmBooking);
$("#newBooking").addEventListener("click", resetBooking);

$("#prevMonth").addEventListener("click", () => {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
  renderCalendar();
});
$("#nextMonth").addEventListener("click", () => {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
  renderCalendar();
});

document.addEventListener("click", async event => {
  const bookService = event.target.closest("[data-book-service]");
  if (bookService) {
    state.serviceId = bookService.dataset.bookService;
    state.date = null;
    state.time = null;
    goToStep(1);
    $("#clientName").focus();
    $("#agendar").scrollIntoView({ behavior: "smooth" });
    return;
  }

  const selectService = event.target.closest("[data-select-service]");
  if (selectService) {
    if (state.serviceId !== selectService.dataset.selectService) {
      state.date = null;
      state.time = null;
    }
    state.serviceId = selectService.dataset.selectService;
    $$(".booking-service").forEach(element => element.classList.toggle("selected", element === selectService));
    return;
  }

  const rescheduleTime = event.target.closest("[data-reschedule-time]");
  if (rescheduleTime) {
    const card = rescheduleTime.closest(".appointment-card");
    $$("[data-reschedule-time]", card).forEach(element => element.classList.toggle("selected", element === rescheduleTime));
    card.dataset.selectedTime = rescheduleTime.dataset.rescheduleTime;
    $("[data-save-reschedule]", card).disabled = false;
    return;
  }

  const dateButton = event.target.closest("[data-date]");
  if (dateButton) {
    state.date = dateButton.dataset.date;
    state.time = null;
    $$("#calendarDays [data-date]").forEach(element => {
      const selected = element === dateButton;
      element.classList.toggle("selected-day", selected);
      element.classList.toggle("available-day", !selected && !element.disabled);
    });
    renderTimes();
    return;
  }

  const timeButton = event.target.closest("[data-time]");
  if (timeButton) {
    state.time = timeButton.dataset.time;
    renderTimes();
    return;
  }

  const nextButton = event.target.closest("[data-next]");
  if (nextButton) {
    if (validateStep()) goToStep(state.step + 1);
    return;
  }

  const previousButton = event.target.closest("[data-prev]");
  if (previousButton) {
    goToStep(Math.max(1, state.step - 1));
    return;
  }

  const rescheduleButton = event.target.closest("[data-reschedule]");
  if (rescheduleButton) {
    const editor = $("[data-reschedule-editor]", rescheduleButton.closest(".appointment-card"));
    editor.hidden = !editor.hidden;
    return;
  }

  const loadSlotsButton = event.target.closest("[data-load-reschedule-slots]");
  if (loadSlotsButton) {
    await loadRescheduleSlots(loadSlotsButton.closest(".appointment-card"));
    return;
  }

  const saveButton = event.target.closest("[data-save-reschedule]");
  if (saveButton) {
    await saveReschedule(saveButton.closest(".appointment-card"));
    return;
  }

  const cancelButton = event.target.closest("[data-cancel-booking]");
  if (cancelButton) {
    await cancelBooking(cancelButton.closest(".appointment-card"));
  }
});

document.addEventListener("change", event => {
  if (event.target.matches("[data-new-date]")) {
    const card = event.target.closest(".appointment-card");
    card.dataset.selectedTime = "";
    $("[data-reschedule-slots]", card).innerHTML = "";
    $("[data-save-reschedule]", card).disabled = true;
  }
});

async function initialize() {
  configureContact();
  try {
    const response = await api("/api/procedimentos");
    SERVICES = response.procedimentos || [];
    renderServices();
    updateSteps();
  } catch (error) {
    showToast("Não foi possível conectar ao servidor. Inicie o site pelo arquivo server.py.");
    console.error(error);
  }
}

initialize();
