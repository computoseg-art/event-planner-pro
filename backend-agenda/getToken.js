import { google } from 'googleapis';
import http from 'http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });
const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim()
  || 'http://127.0.0.1:3000/oauth2callback';
const callbackUrl = new URL(redirectUri);

const SCOPES = [
  'https://www.googleapis.com/auth/photoslibrary.appendonly',
  'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
  'https://www.googleapis.com/auth/photoslibrary.edit.appcreateddata'
];

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('Configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en backend-agenda/.env.');
  }
  if (
    callbackUrl.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(callbackUrl.hostname) ||
    callbackUrl.pathname !== '/oauth2callback' ||
    callbackUrl.search ||
    callbackUrl.hash
  ) {
    throw new Error(
      'GOOGLE_REDIRECT_URI debe ser una URL local como http://127.0.0.1:3000/oauth2callback.'
    );
  }

  const callbackHost = callbackUrl.hostname;
  const callbackPort = Number(callbackUrl.port || 80);
  const oAuth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
  const state = randomBytes(32).toString('hex');
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: SCOPES,
    state
  });
  console.log('\nAbre esta URL para autorizar la cuenta de Google Photos:\n', authUrl, '\n');

  const server = http.createServer(async (req, res) => {
    const callback = new URL(req.url || '/', redirectUri);
    if (callback.pathname !== callbackUrl.pathname) {
      res.writeHead(404).end();
      return;
    }

    const returnedState = Buffer.from(callback.searchParams.get('state') || '');
    const expectedState = Buffer.from(state);
    if (
      returnedState.length !== expectedState.length ||
      !timingSafeEqual(returnedState, expectedState)
    ) {
      res.writeHead(400).end('La solicitud de autorización no coincide. Puedes cerrar esta ventana.');
      server.close();
      console.error('Google Photos devolvió un estado OAuth inválido.');
      return;
    }

    const code = callback.searchParams.get('code');
    const oauthError = callback.searchParams.get('error');
    if (oauthError || !code) {
      res.writeHead(400).end('No se pudo completar la autorización. Revisa la consola.');
      server.close();
      console.error('Google Photos rechazó la autorización:', oauthError || 'falta el código.');
      return;
    }

    res.end('Autorización completada. Volvé a la consola.');
    server.close();
    try {
      const { tokens } = await oAuth2Client.getToken(code);
      if (tokens.refresh_token) {
        console.info('\nGuarda este refresh token como REFRESH_TOKEN en el .env local:');
        console.info(tokens.refresh_token);
      } else {
        console.info('Google no devolvió un refresh token; conserva el token existente.');
      }
    } catch (error) {
      console.error('No se pudo obtener el refresh token:', error.message);
      process.exitCode = 1;
    }
  }).listen(callbackPort, callbackHost, () =>
    console.log(`Servidor OAuth escuchando en ${redirectUri}`)
  );

  server.on('error', error => {
    console.error('No se pudo iniciar el callback OAuth:', error.message);
    process.exitCode = 1;
  });
}

main().catch(error => {
  console.error('No se pudo iniciar la autorización de Google Photos:', error.message);
  process.exitCode = 1;
});
