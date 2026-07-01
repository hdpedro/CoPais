// Stub de "server-only" para os testes. O pacote real lança quando importado
// fora de um Server Component (por design). Vários módulos server-side
// (ex: src/lib/whatsapp/brain-handlers.ts, activity-reminders.ts) importam
// "server-only"; no vitest apontamos o import pra este módulo vazio via
// resolve.alias — assim as suítes de caracterização do processor (que importam
// o processor, que agora puxa brain-handlers) carregam sem throw.
export {};
