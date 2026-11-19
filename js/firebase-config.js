// CONFIGURAÇÃO DO FIREBASE
//
// Cole aqui os dados do seu projeto Firebase. Onde encontrar:
// Console do Firebase > Configurações do projeto (engrenagem) > Seus apps > App da Web.
//
// IMPORTANTE: o app usa exatamente os mesmos dados (arquivo src/config/firebaseConfig.ts).
// É por usarem o mesmo projeto que o site e o app ficam sincronizados.
export const firebaseConfig = {
  apiKey: "AIzaSyCB5EH7jnaXwmvYPc3mwrBkeZ_ZP4t1_LY",
  authDomain: "espaco-marilza.firebaseapp.com",
  projectId: "espaco-marilza",
  storageBucket: "espaco-marilza.firebasestorage.app",
  messagingSenderId: "961613271523",
  appId: "1:961613271523:web:1685f933412ae1fa0e50d6"
};

// Fica "true" depois que os dados acima forem preenchidos.
export const firebaseConfigurado = firebaseConfig.projectId !== "COLE_AQUI";
