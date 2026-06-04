// app.config.js
//
// Existe SÓ pra injetar o google-services.json (FCM/Firebase Android) sem
// commitá-lo. O repo é PÚBLICO, então o arquivo fica no .gitignore + num EAS
// file secret `GOOGLE_SERVICES_JSON`. No build EAS o secret é exposto como um
// path em `process.env.GOOGLE_SERVICES_JSON`; localmente cai no
// `./google-services.json` (gitignored). Todo o resto da config continua no
// app.json — o Expo lê o app.json e o passa aqui como `config`.
//
// Sem isso o Firebase não inicializa no Android e `getDevicePushTokenAsync()`
// lança "Default FirebaseApp is not initialized" → push Android quebrado pra
// todos (services/push-setup.ts). App `com.kindar.app` registrado no projeto
// Firebase `kindar-68480` em 2026-06-04.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ??
      config.android?.googleServicesFile ??
      './google-services.json',
  },
});
