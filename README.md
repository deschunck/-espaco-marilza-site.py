# Espaço Marilza Caricatti — Site de agendamento

Site onde a cliente escolhe um procedimento, vê os horários livres e pede um agendamento.
Ele funciona junto com o **app da profissional** (projeto `app-agenda`): os dois usam o
mesmo banco de dados no **Firebase**, por isso tudo fica sincronizado em tempo real.

## Como o site e o app conversam

```
   SITE (cliente)                 FIREBASE (Firestore)                APP (profissional)
 ─────────────────             ──────────────────────────           ─────────────────────
 vê os serviços        ◄─────   servicos                   ◄─────   cadastra os serviços
 vê horários livres    ◄─────   configuracoes/expediente   ◄─────   escolhe os horários
 pede um agendamento   ─────►   agendamentos (pendente)    ─────►   vê o pedido na agenda
 acompanha o status    ◄─────   agendamentos (confirmado)  ◄─────   confirma ou recusa
```

1. No app, a profissional cadastra os **serviços** e marca os **horários** que quer oferecer.
2. No site, a cliente só consegue escolher horários marcados no app e que ainda estão livres.
3. O pedido chega no app como **pendente**. A profissional confirma (ou recusa).
4. Ao confirmar, o app abre o WhatsApp com a mensagem pronta para a cliente.
5. Em "Meus agendamentos", a cliente digita o telefone e vê o status mudar na hora.

## Configurar o Firebase (uma vez só)

1. Acesse <https://console.firebase.google.com> e clique em **Criar um projeto**
   (pode desativar o Google Analytics).
2. No menu **Criação > Firestore Database**, clique em **Criar banco de dados**
   (local `southamerica-east1`, modo de produção).
3. Na aba **Regras** do Firestore, cole o conteúdo do arquivo [`firestore.rules`](firestore.rules)
   e clique em **Publicar**.
4. No menu **Criação > Authentication**, clique em **Vamos começar**, ative o provedor
   **E-mail/senha** e, na aba **Usuários**, adicione o e-mail e a senha da profissional
   (senha de 8 a 20 caracteres). É com eles que ela entra no app.
5. Em **Configurações do projeto** (engrenagem) **> Seus apps**, clique no ícone **`</>`** (Web),
   dê um nome e registre. O Firebase mostra um bloco `firebaseConfig = { ... }`.
6. Copie os valores desse bloco para **os dois** arquivos:
   - site: `js/firebase-config.js`
   - app: `espaco-marilza-app/src/config/firebaseConfig.ts`

## Rodar no computador

```bash
python server.py
```

Depois abra <http://localhost:8000>. (O site precisa ser aberto pelo servidor;
abrir o `index.html` direto com dois cliques não funciona.)

Na primeira vez, entre no app e, na aba **Serviços**, toque em *Adicionar serviços de exemplo*;
na aba **Horários**, marque os horários e salve. Só então o site terá o que mostrar.

## Organização dos arquivos

| Arquivo | O que faz |
| --- | --- |
| `index.html` | Estrutura da página |
| `styles.css` | Visual do site |
| `server.py` | Servidor local que entrega os arquivos |
| `firestore.rules` | Regras de segurança do banco (colar no console do Firebase) |
| `js/principal.js` | Ponto de partida: liga tudo quando a página abre |
| `js/agendar.js` | Passo a passo de agendamento |
| `js/meus-agendamentos.js` | Consulta pelo telefone, reagendar e cancelar |
| `js/banco.js` | Tudo o que lê e grava no Firebase |
| `js/horarios.js` | Regra que calcula os horários livres |
| `js/estado.js` | Dados do Firebase compartilhados entre os arquivos |
| `js/utilitarios.js` | Funções de apoio (datas, dinheiro, avisos) |
| `js/configuracao.js` | WhatsApp, Instagram e endereço do espaço |
| `js/firebase-config.js` | Chaves do seu projeto Firebase |

## Formato dos dados no Firestore

**`agendamentos`** (um documento por agendamento)

| Campo | Exemplo | Observação |
| --- | --- | --- |
| `clienteNome` | `"Camila Ribeiro"` | |
| `clienteTelefone` | `"37998765432"` | só números, com DDD |
| `servicoId`, `servico`, `preco`, `duracao` | `"abc"`, `"Manicure"`, `35`, `60` | copiados do serviço na hora da marcação |
| `data` | `"2026-11-20"` | ano-mês-dia |
| `horario`, `horarioFim` | `"14:00"`, `"15:00"` | |
| `status` | `"pendente"` | `pendente`, `confirmado` ou `cancelado` |
| `origem` | `"site"` | `site` (cliente) ou `app` (profissional) |
| `criadoEm` | `"2026-11-18T13:00:00.000Z"` | |

**`servicos`**: `nome`, `descricao`, `preco`, `duracao` (minutos), `imagem` (URL da foto).

**`configuracoes/expediente`**: campo `horarios`, com os horários oferecidos em cada dia da
semana (0 = domingo ... 6 = sábado). Exemplo: `{ "1": ["09:00", "10:00"], "2": [] }`.
